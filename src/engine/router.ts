import type { WASocket } from '@whiskeysockets/baileys';
import { messageRepo } from '../db/repositories/message.repo.js';
import { contactRepo } from '../db/repositories/contact.repo.js';
import { antiRevokeHandler } from './messiah/anti_revoke.js';
import { mediaExtractor } from './messiah/media.js';
import { discordService } from '../services/discord.service.js';
import { secondBrainDispatcher } from './second_brain/dispatcher.js';
import { messiahHandler } from './messiah/handler.js';
import type { IncomingMessageContext } from '../types/message.js';
import { ContactTier } from '../types/contact.js';
import { env } from '../config/env.js';
import { openaiService } from '../services/openai.service.js';
import { noteRepo } from '../db/repositories/note.repo.js';
import { statusStealRepo } from '../db/repositories/status_steal.repo.js';
import { statusTargetRepo } from '../db/repositories/status_target.repo.js';
import { antiEditHandler } from './messiah/anti_edit.js';
import { identityService } from '../services/identity.service.js';
import { quarantineFailedPayload } from './messiah/quarantine.js';

class BoundedSet<T> {
  private set = new Set<T>();
  constructor(private maxSize = 5000) {}

  add(val: T): void {
    if (this.set.has(val)) return;
    if (this.set.size >= this.maxSize) {
      const first = this.set.values().next().value;
      if (first !== undefined) this.set.delete(first);
    }
    this.set.add(val);
  }

  has(val: T): boolean {
    return this.set.has(val);
  }
}

const requestedPlaceholderResends = new BoundedSet<string>(2000);
const decodedPdoIds = new BoundedSet<string>(2000);
const processedViewOnceAlerts = new BoundedSet<string>(2000);


export function isStatusStealerTrigger(inputText: string, configuredTrigger: string): boolean {
  if (!inputText) return false;
  const norm = (s: string) =>
    s
      .trim()
      .replace(/[\uFE00-\uFE0F]/g, '')
      .replace(/\u200D/g, '')
      .toLowerCase();

  return norm(inputText) === norm(configuredTrigger || '!😶🌫️');
}

export function extractMessageText(message: any): string {
  if (!message) return '';
  const { innerMessage, caption } = mediaExtractor.unwrapMessage({ message } as any);
  const m = innerMessage || message;

  return (
    caption ||
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
}

export async function routeIncomingMessage(sock: WASocket, upsert: any): Promise<void> {
  const { messages, type } = upsert;
  if (!messages || messages.length === 0) return;

  // Auto-detect user identifiers from the live socket
  const myPhone = sock.user?.id ? sock.user.id.split(':')[0].replace(/[^0-9]/g, '') : env.phoneNumber;
  const myJid = myPhone ? `${myPhone}@s.whatsapp.net` : env.ownerJid;
  const myLid = (sock.user as any)?.lid ? (sock.user as any).lid.split(':')[0] + '@lid' : '';

  for (const msg of messages) {
    const rawChatJid = msg.key?.remoteJid || '';
    // Completely drop WhatsApp Channels (@newsletter) before any parsing, logging, or state checks
    if (rawChatJid.endsWith('@newsletter') || rawChatJid.includes('newsletter')) {
      continue;
    }

    // DIAGNOSTIC: Log stubs / null-message events and trigger placeholder resend
    if (!msg.message) {
      const stubJid = msg.key?.remoteJid || 'unknown';
      const stubId = msg.key?.id;
      if ((msg.key as any)?.isViewOnce) {
        console.warn(`[Router] ⚠️ WhatsApp delivered an unavailable View-Once stub for ${stubId} from ${stubJid}. Requesting resend...`);
      } else {
        console.log(`[Router] ⚠️  msg.message is null (stub/receipt) for ${stubId} from ${stubJid} (upsert.type=${type})`);
      }

      // Deduplicate placeholder resend requests so socket is not spammed
      if (stubId && requestedPlaceholderResends.has(stubId)) {
        console.log(`[Router] ℹ️ Placeholder resend already requested for ${stubId}, skipping duplicate request.`);
      } else if (msg.key && typeof (sock as any)?.requestPlaceholderResend === 'function') {
        if (stubId) requestedPlaceholderResends.add(stubId);
        (sock as any).requestPlaceholderResend(msg.key).catch((err: any) => {
          console.warn(`[Router] Failed to request placeholder resend for ${stubId}:`, err?.message || err);
        });
      }
      continue;
    }

    // Handle Protocol Events (Revocation, Edits, and View-Once Placeholder Resends)
    const protocolMessage = msg.message?.protocolMessage;
    if (protocolMessage) {
      const pType = protocolMessage.type;
      const isRevoke = pType === 0 || pType === 'REVOKE';
      const isEdit = pType === 14 || pType === 'MESSAGE_EDIT';
      const isPdoResponse = pType === 17 ||
        pType === 'PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE' ||
        Boolean(protocolMessage.peerDataOperationRequestResponseMessage);

      if (isRevoke) {
        const targetKey = protocolMessage.key?.id;
        if (targetKey) {
          await antiRevokeHandler.handleRevoke(sock, targetKey);
        }
        continue;
      } else if (isEdit) {
        const chatJid = msg.key.remoteJid || '';
        const senderJid = msg.key.participant || chatJid;
        await antiEditHandler.handleEdit(protocolMessage, senderJid, chatJid);
        continue;
      } else if (isPdoResponse) {
        // WhatsApp delivers View-Once media via PLACEHOLDER_MESSAGE_RESEND.
        // The actual message is encoded as base64/binary protobuf in webMessageInfoBytes.
        try {
          const results = (protocolMessage as any)?.peerDataOperationRequestResponseMessage?.peerDataOperationResult;
          if (Array.isArray(results)) {
            const { proto: BaileysProto } = await import('@whiskeysockets/baileys');
            for (const result of results) {
              const bytes = result?.placeholderMessageResendResponse?.webMessageInfoBytes;
              if (bytes) {
                const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'base64');
                try {
                  const decoded = BaileysProto.WebMessageInfo.decode(buf);
                  const pdoId = decoded?.key?.id;

                  if (pdoId && decodedPdoIds.has(pdoId)) {
                    console.log(`[Router] ℹ️ Type 17 PDO response for ${pdoId} already decoded, skipping duplicate.`);
                    continue;
                  }
                  if (pdoId) decodedPdoIds.add(pdoId);

                  if (decoded?.message) {
                    console.log(`[Router] 📦 Decoded View-Once placeholder resend for ${pdoId}`);
                    // Explicitly tag View-Once flag on re-injected message object so it is preserved
                    (decoded as any).isViewOnce = true;
                    if (decoded.key) (decoded.key as any).isViewOnce = true;
                    upsert.messages.push(decoded as any);
                  }
                } catch (protoErr: any) {
                  console.warn('[Router] Failed to decode placeholder resend protobuf:', protoErr.message);
                  quarantineFailedPayload(buf, protocolMessage?.key?.id, protoErr, 'Type 17 PDO Protobuf Decode Failure');
                }
              }
            }
          }
        } catch (err: any) {
          console.warn('[Router] Failed to process PDO response message:', err.message);
          quarantineFailedPayload(protocolMessage, protocolMessage?.key?.id, err, 'Type 17 PDO Wrapper Failure');
        }
        continue;
      }
      // Drop all other protocol messages (receipts, reactions, etc.)
      continue;
    }

    const text = extractMessageText(msg.message);
    const fromMe = Boolean(msg.key.fromMe);
    const isGroup = rawChatJid.endsWith('@g.us');
    const isStatus = rawChatJid === 'status@broadcast';

    const isLid = rawChatJid.endsWith('@lid');
    const chatUserPart = rawChatJid.split('@')[0].split(':')[0];
    const chatPhone = !isLid ? chatUserPart.replace(/[^0-9]/g, '') : '';
    const chatJid = (!isGroup && !isStatus && !isLid && chatPhone) ? `${chatPhone}@s.whatsapp.net` : rawChatJid;

    const rawSenderJid = (isGroup || isStatus) ? (msg.key.participant || rawChatJid) : rawChatJid;
    const senderUserPart = rawSenderJid.split('@')[0].split(':')[0];
    const senderPhone = senderUserPart.replace(/[^0-9]/g, '');
    const senderJid = (!isGroup && !isStatus && senderPhone) ? `${senderPhone}@s.whatsapp.net` : rawSenderJid;
    const messageType = Object.keys(msg.message)[0] || 'unknown';

    // Ignore bot's own output to prevent infinite loops
    const isBotEcho = fromMe && (
      text.startsWith('⚡ *MESSIAH') ||
      text.startsWith('📝 *Saved Note') ||
      text.startsWith('⏰ *REMINDER') ||
      text.startsWith('🔍 *Search Results') ||
      text.startsWith('🔍 *IDENTITY RESOLVED') ||
      text.startsWith('📋 *EXECUTIVE DOSSIER') ||
      text.startsWith('❄️ *DORMANT THREADS') ||
      text.startsWith('⏳ *Synthesizing') ||
      text.startsWith('📦 *MESSIAH BACKUP READY*') ||
      text.startsWith('⏳ *Initiating Full Disaster Recovery Backup') ||
      text.startsWith('❌ *Backup Failed') ||
      text.startsWith('❓ Unknown command') ||
      text.startsWith('🧠 *MESSIAH') ||
      text.startsWith('📥 Captured') ||
      text.startsWith('⚠️ Usage:')
    );
    if (isBotEcho) continue;

    const allMsgKeys = Object.keys(msg.message || {});
    console.log(`[Message Inbound] chat=${chatJid} fromMe=${fromMe} type=[${allMsgKeys.join(', ')}] text="${text}"`);

    // 0. COVERT OPS: STATUS STEALER ("GHOST CAPTURE")
    const rawInnerMsg =
      msg.message?.ephemeralMessage?.message ||
      msg.message?.viewOnceMessage?.message ||
      msg.message?.viewOnceMessageV2?.message ||
      msg.message?.documentWithCaptionMessage?.message ||
      msg.message;

    const contextInfo =
      rawInnerMsg?.extendedTextMessage?.contextInfo ||
      rawInnerMsg?.imageMessage?.contextInfo ||
      rawInnerMsg?.videoMessage?.contextInfo ||
      rawInnerMsg?.documentMessage?.contextInfo;

    // 🎯 STEALTH STATUS STEALER (Capture-On-Receipt for Targeted Contacts)
    if (isStatus && !fromMe) {
      if (statusTargetRepo.isTarget(senderPhone)) {
        console.log(`[Status Stealer] 🎯 Captured incoming status update from targeted contact +${senderPhone}`);
        try {
          const extractedMedia = await mediaExtractor.extractAndSaveMedia(msg);
          const contact = contactRepo.getContact(senderJid);
          const caption = extractedMedia?.caption || text || undefined;

          // Record in SQLite database
          statusStealRepo.recordSteal({
            statusId: msg.key?.id || null,
            contactJid: senderJid,
            contactPhone: senderPhone,
            contactName: contact?.name || null,
            content: caption || null,
            mediaPath: extractedMedia?.filePath || null,
            mediaType: extractedMedia
              ? (extractedMedia.mimeType.startsWith('image/') ? 'image' : (extractedMedia.mimeType.startsWith('video/') ? 'video' : 'media'))
              : (text ? 'text' : 'unknown'),
            mimeType: extractedMedia?.mimeType || null,
            timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
            discordSent: env.statusStealerDiscord
          });

          // Forward to Discord (if configured)
          if (env.statusStealerDiscord) {
            await discordService.sendStatusStealAlert({
              contactPhone: senderPhone,
              contactName: contact?.name || null,
              caption: extractedMedia?.caption || undefined,
              textContent: !extractedMedia ? text : undefined,
              timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
              buffer: extractedMedia?.buffer || null,
              fileName: extractedMedia?.fileName || null,
              mimeType: extractedMedia?.mimeType || null
            });
          }

          // Forward directly to Owner WhatsApp (if configured)
          if (env.ownerJid) {
            try {
              const header = `📸 *[STATUS CAPTURED]*\n\n` +
                `👤 *From:* ${contact?.name || 'Contact'} (+${senderPhone})\n` +
                `💬 *Content:* ${caption || text || '[No text]'}`;

              if (extractedMedia) {
                const msgObj: any = { caption: header };
                if (extractedMedia.mediaType === 'image') msgObj.image = extractedMedia.buffer;
                else if (extractedMedia.mediaType === 'video') msgObj.video = extractedMedia.buffer;
                else msgObj.document = extractedMedia.buffer;
                await sock.sendMessage(env.ownerJid, msgObj);
              } else if (text) {
                await sock.sendMessage(env.ownerJid, { text: header });
              }
            } catch {}
          }
        } catch (stErr: any) {
          console.warn(`[Status Stealer] Failed to extract status media:`, stErr.message);
        }
      }
      continue;
    }

    // 1. SILENT ARCHIVE & MEDIA EXTRACTION
    // First-time inbound contact anomaly radar
    const isFirstTimeContact = !fromMe && !isGroup && !isStatus && !messageRepo.hasPriorMessages(senderJid);
    if (isFirstTimeContact) {
      console.log(`[Anomaly Radar] First-time contact message detected from ${senderPhone}!`);
      identityService.resolveIdentity(sock, senderJid, msg.pushName).then(async (profile) => {
        await discordService.sendFirstTimeContactAlert({
          senderPhone,
          senderName: profile.savedName || profile.pushName || null,
          initialMessage: text || (isViewOnce ? '[View-Once Media]' : '[Media Message]'),
          sharedGroups: profile.sharedGroups,
          timestamp: Number(msg.messageTimestamp) * 1000 || Date.now()
        });
      }).catch(err => {
        console.warn(`[Anomaly Radar] Failed to resolve identity: ${err.message}`);
      });
    }

    // Check if message is a View-Once or standard media message
    let mediaResult = null;
    const isViewOnce = mediaExtractor.isViewOnceMessage(msg);

    // Save initial record to SQLite
    const msgId = msg.key.id || `${Date.now()}`;
    messageRepo.saveMessage({
      id: msgId,
      chatJid,
      senderJid,
      fromMe,
      messageType,
      content: text,
      rawPayload: msg,
      timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
      isViewOnce
    });

    // Determine self-chat identity
    const isSelfChat = fromMe && !isGroup && !isStatus && (
      (myJid && chatJid === myJid) ||
      (myPhone && chatPhone && chatPhone === myPhone) ||
      (myPhone && rawChatJid.includes(myPhone)) ||
      (myLid && (rawChatJid === myLid || chatJid === myLid)) ||
      (rawChatJid === (sock.user as any)?.id) ||
      (rawChatJid === (sock.user as any)?.lid) ||
      (rawChatJid === myJid)
    );

    const ctx: IncomingMessageContext = {
      id: msgId,
      chatJid,
      senderJid,
      senderPhone,
      fromMe,
      isGroup,
      messageType,
      text,
      timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
      raw: msg,
      isViewOnce
    };

    // Asynchronously extract and decrypt media (so text routing remains instant)
    // Skip extraction for plain text-only messages (conversation, extendedText) with no media wrappers
    const isPureText = (messageType === 'conversation' || messageType === 'extendedTextMessage') && !isViewOnce;
    const outerRaw = isPureText ? JSON.stringify(msg.message || {}) : '';
    const mightHaveMedia = !isPureText ||
      outerRaw.includes('imageMessage') ||
      outerRaw.includes('videoMessage') ||
      outerRaw.includes('audioMessage');

    if (mightHaveMedia) {
      // Shared single media extraction task (prevents duplicate download calls)
      const mediaExtractionTask = mediaExtractor.extractAndSaveMedia(msg);

      // Eager pre-download check for Tier 1 & Tier 2 priority contacts
      const senderContact = contactRepo.getContact(senderJid);
      const isPriorityContact = senderContact ? (senderContact.tier === ContactTier.TIER1_INNER || senderContact.tier === ContactTier.TIER2_ACQUAINTANCE) : false;

      if (isPriorityContact) {
        try {
          const eagerExtracted = await mediaExtractionTask;
          if (eagerExtracted) {
            messageRepo.updateMedia(msgId, eagerExtracted.filePath, eagerExtracted.mimeType, eagerExtracted.isViewOnce);
            console.log(`[Anti-Revoke/Eager] ⚡ Eagerly saved media from Tier ${senderContact?.tier} contact (+${senderPhone}) -> ${eagerExtracted.fileName}`);
          }
        } catch (eagerErr: any) {
          console.warn(`[Anti-Revoke/Eager] Priority download failed for ${msgId}: ${eagerErr.message}`);
        }
      }

      mediaExtractionTask.then(async (extracted) => {
        if (!extracted) return;

        messageRepo.updateMedia(msgId, extracted.filePath, extracted.mimeType, extracted.isViewOnce);

      // Check if media is an audio / voice note
      const isAudio =
        extracted.mediaType === 'audio' ||
        extracted.mimeType.startsWith('audio/') ||
        extracted.fileName.endsWith('.ogg') ||
        extracted.fileName.endsWith('.mp3') ||
        Boolean(msg.message?.audioMessage);

      let audioTranscript = '';

      // Only transcribe audio if relevant: Self-Chat (Second Brain) or 1-on-1 DM (Messiah Ghost Handler).
      // Skip group chats to prevent burning OpenAI Whisper credits on group voice notes.
      const shouldTranscribe = isAudio && openaiService.isConfigured() && (isSelfChat || (!fromMe && !isGroup));

      if (shouldTranscribe) {
        try {
          console.log(`[Whisper] Transcribing audio note (${extracted.fileName})...`);
          audioTranscript = await openaiService.transcribeAudio(extracted.buffer, extracted.fileName, extracted.mimeType);
          if (audioTranscript) {
            console.log(`[Whisper] Transcription result: "${audioTranscript}"`);
            messageRepo.updateContent(msgId, `[Voice Note]: ${audioTranscript}`);

            // If voice note was sent to Self-Chat: Auto-save as a Second Brain voice note!
            if (isSelfChat) {
              const savedNote = noteRepo.saveNote(audioTranscript, 'voice');
              await sock.sendMessage(chatJid, {
                text: `🎙️ *Voice Note Transcribed & Saved* [#${savedNote.id}]\n\n"${audioTranscript}"`
              });
            } else if (!fromMe && !isGroup) {
              // External contact sent voice note: feed transcription into Messiah Ghost handler
              const ghostCtx = { ...ctx, text: audioTranscript };
              await messiahHandler.handleContactMessage(sock, ghostCtx);
            }
          }
        } catch (whisperErr: any) {
          console.warn(`[Whisper Error] Failed to transcribe voice note: ${whisperErr.message}`);
        }
      }

      // If media is View-Once and Discord forwarding is enabled:
      // Note: Regular everyday media (stickers, normal photos, group voice notes) are archived silently in SQLite & data/media.
      // Discord is alerted strictly for Ephemeral View-Once (Anti-ViewOnce) or Deleted messages (Anti-Revoke).
      const isStatusBroadcast = chatJid === 'status@broadcast' || senderJid === 'status@broadcast';

      const wasViewOnce = Boolean(isViewOnce || extracted.isViewOnce || (msg as any)?.isViewOnce || (msg.key as any)?.isViewOnce);
      if (wasViewOnce && !fromMe && !isStatusBroadcast) {
        if (processedViewOnceAlerts.has(msgId)) {
          console.log(`[Anti-ViewOnce] ℹ️ Alert for View-Once message ${msgId} already processed, skipping duplicate alert.`);
          return;
        }
        processedViewOnceAlerts.add(msgId);

        console.log(`[Anti-ViewOnce] Ephemeral View-Once from ${senderPhone} (fromMe=${fromMe}) decrypted and stored eagerly at ${extracted.filePath}.`);

        // 1. Forward to Discord if configured
        if (env.forwardMediaToDiscord) {
          if (env.discordWebhookUrl) {
            const contact = contactRepo.getContact(senderJid);
            const discordCaption = audioTranscript
              ? `🎙️ [Transcription]: ${audioTranscript}`
              : (extracted.caption || text || undefined);

            await discordService.sendViewOnceAlert({
              senderPhone,
              senderName: contact?.name || null,
              caption: discordCaption,
              timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
              buffer: extracted.buffer,
              fileName: extracted.fileName,
              mimeType: extracted.mimeType
            });
          } else {
            console.warn(`[Anti-ViewOnce] ⚠️ Ephemeral View-Once from ${senderPhone} was decrypted, but DISCORD_WEBHOOK_URL is not configured in .env!`);
          }
        }

        // 2. Forward decrypted View-Once directly to owner JID on WhatsApp
        if (env.ownerJid) {
          try {
            const contact = contactRepo.getContact(senderJid);
            const captionText = `👁️ *[ANTI-VIEWONCE CAPTURED]*\n\n` +
              `👤 *From:* ${contact?.name || 'Contact'} (+${senderPhone})\n` +
              `💬 *Caption:* ${extracted.caption || text || '[No caption]'}`;

            const mediaMsg: any = {};
            if (extracted.mediaType === 'image') {
              mediaMsg.image = extracted.buffer;
            } else if (extracted.mediaType === 'video') {
              mediaMsg.video = extracted.buffer;
            } else if (extracted.mediaType === 'audio') {
              mediaMsg.audio = extracted.buffer;
              mediaMsg.mimetype = extracted.mimeType;
              mediaMsg.ptt = true;
            } else {
              mediaMsg.document = extracted.buffer;
              mediaMsg.mimetype = extracted.mimeType;
              mediaMsg.fileName = extracted.fileName;
            }
            mediaMsg.caption = captionText;

            await sock.sendMessage(env.ownerJid, mediaMsg);
            console.log(`[Anti-ViewOnce] Decrypted View-Once media forwarded directly to owner WhatsApp (${env.ownerJid}).`);
          } catch (waErr: any) {
            console.warn('[Anti-ViewOnce] Failed to forward media to owner WhatsApp:', waErr.message);
          }
        }
      }
    }).catch(err => {
      console.warn(`[Media Extraction Error] ${msgId}: ${err.message}`);
      if (isViewOnce) {
        quarantineFailedPayload(msg, msgId, err, 'View-Once Media Extraction Exception');
      }
    });
    } // end if(mightHaveMedia)

    // 2. SELF-CHAT / SECOND BRAIN ROUTING:
    // Matches if message was sent from your account to yourself OR if you type any '!' command in any DM
    const isCommand = fromMe && text.startsWith('!');

    if ((isSelfChat || isCommand) && text) {
      console.log(`[Second Brain] Executing command/capture from owner: "${text}"`);
      await secondBrainDispatcher.dispatch(sock, ctx);
      continue;
    }

    // 3. MESSIAH GHOST HANDLER ROUTING:
    // Inbound messages from external contacts (non-group)
    if (!fromMe && !isGroup && text) {
      await messiahHandler.handleContactMessage(sock, ctx);
    }
  }
}
