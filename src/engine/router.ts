import type { WASocket } from '@whiskeysockets/baileys';
import { messageRepo } from '../db/repositories/message.repo.js';
import { contactRepo } from '../db/repositories/contact.repo.js';
import { antiRevokeHandler } from './messiah/anti_revoke.js';
import { mediaExtractor } from './messiah/media.js';
import { discordService } from '../services/discord.service.js';
import { secondBrainDispatcher } from './second_brain/dispatcher.js';
import { messiahHandler } from './messiah/handler.js';
import type { IncomingMessageContext } from '../types/message.js';
import { env } from '../config/env.js';
import { openaiService } from '../services/openai.service.js';
import { noteRepo } from '../db/repositories/note.repo.js';
import { statusStealRepo } from '../db/repositories/status_steal.repo.js';
import { antiEditHandler } from './messiah/anti_edit.js';
import { identityService } from '../services/identity.service.js';

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

    // DIAGNOSTIC: Log stubs / null-message events so we can see business View-Once arriving
    if (!msg.message) {
      const stubJid = msg.key?.remoteJid || 'unknown';
      if ((msg.key as any)?.isViewOnce) {
        console.warn(`[Router] ⚠️ WhatsApp delivered an unavailable View-Once stub for ${msg.key?.id} from ${stubJid}.`);
      } else {
        console.log(`[Router] ⚠️  msg.message is null (stub/receipt) for ${msg.key?.id} from ${stubJid} (upsert.type=${type})`);
      }
      continue;
    }

    // Handle Protocol Events (Revocation & Message Edits)
    const protocolMessage = msg.message?.protocolMessage;
    if (protocolMessage) {
      if (protocolMessage.type === 0 /* REVOKE */) {
        const targetKey = protocolMessage.key?.id;
        if (targetKey) {
          await antiRevokeHandler.handleRevoke(targetKey);
        }
        continue;
      } else if (protocolMessage.type === 14 /* MESSAGE_EDIT */) {
        const chatJid = msg.key.remoteJid || '';
        const senderJid = msg.key.participant || chatJid;
        await antiEditHandler.handleEdit(protocolMessage, senderJid, chatJid);
        continue;
      }
    }

    const text = extractMessageText(msg.message);
    const fromMe = Boolean(msg.key.fromMe);
    const isGroup = rawChatJid.endsWith('@g.us');
    const isStatus = rawChatJid === 'status@broadcast';

    const chatUserPart = rawChatJid.split('@')[0].split(':')[0];
    const chatPhone = chatUserPart.replace(/[^0-9]/g, '');
    const chatJid = (!isGroup && !isStatus && chatPhone) ? `${chatPhone}@s.whatsapp.net` : rawChatJid;

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

    if (fromMe && isStatusStealerTrigger(text, env.statusStealerTrigger)) {
      console.log(`[Status Stealer] Trigger "${text}" detected in chat=${chatJid}`);

      if (contextInfo?.quotedMessage) {
        const targetContactJid = contextInfo.participant || (chatJid !== 'status@broadcast' ? chatJid : '');
        const targetContactPhone = targetContactJid.split('@')[0].replace(/[^0-9]/g, '');
        const targetContact = contactRepo.getContact(targetContactJid);

        let extractedMedia: any = null;
        const textContent =
          contextInfo.quotedMessage.conversation ||
          contextInfo.quotedMessage.extendedTextMessage?.text ||
          '';

        try {
          extractedMedia = await mediaExtractor.extractQuotedStatus(
            contextInfo.quotedMessage,
            contextInfo.stanzaId
          );
        } catch (mediaErr: any) {
          console.warn(`[Status Stealer] Media extraction error: ${mediaErr.message}`);
        }

        const caption = extractedMedia?.caption || textContent || undefined;
        console.log(`[Status Stealer] Exfiltrated status from ${targetContactPhone} (${targetContact?.name || 'Unknown'}). Media=${Boolean(extractedMedia)}`);

        // Record in SQLite database
        statusStealRepo.recordSteal({
          statusId: contextInfo.stanzaId || null,
          contactJid: targetContactJid,
          contactPhone: targetContactPhone,
          contactName: targetContact?.name || null,
          content: caption || null,
          mediaPath: extractedMedia?.filePath || null,
          mediaType: extractedMedia
            ? (extractedMedia.mimeType.startsWith('image/') ? 'image' : (extractedMedia.mimeType.startsWith('video/') ? 'video' : 'media'))
            : (textContent ? 'text' : 'unknown'),
          mimeType: extractedMedia?.mimeType || null,
          timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
          discordSent: env.statusStealerDiscord
        });

        // Forward to Discord
        if (env.statusStealerDiscord) {
          await discordService.sendStatusStealAlert({
            contactPhone: targetContactPhone,
            contactName: targetContact?.name || null,
            caption: extractedMedia?.caption || undefined,
            textContent: !extractedMedia ? textContent : undefined,
            timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
            buffer: extractedMedia?.buffer || null,
            fileName: extractedMedia?.fileName || null,
            mimeType: extractedMedia?.mimeType || null
          });
        }

        // Stealth Auto-Delete: Revoke the trigger message from contact DM
        if (env.statusStealerAutoDelete) {
          try {
            console.log(`[Status Stealer] Stealth auto-deleting trigger message in ${chatJid}...`);
            await sock.sendMessage(chatJid, { delete: msg.key });
          } catch (delErr: any) {
            console.warn(`[Status Stealer] Could not auto-delete trigger message: ${delErr.message}`);
          }
        }

        continue;
      } else {
        console.warn(`[Status Stealer] Trigger received but message does not quote a status message.`);
      }
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
    const isSelfChat = fromMe && (
      (myJid && chatJid === myJid) ||
      (myPhone && chatJid.startsWith(myPhone)) ||
      (myLid && chatJid === myLid)
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
    mediaExtractor.extractAndSaveMedia(msg).then(async (extracted) => {
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

      const wasViewOnce = Boolean(isViewOnce || extracted.isViewOnce);
      if (wasViewOnce && !isStatusBroadcast) {
        if (env.forwardMediaToDiscord) {
          if (env.discordWebhookUrl) {
            const contact = contactRepo.getContact(senderJid);
            const discordCaption = audioTranscript
              ? `🎙️ [Transcription]: ${audioTranscript}`
              : (extracted.caption || text || undefined);

            console.log(`[Anti-ViewOnce] Ephemeral View-Once from ${senderPhone} (fromMe=${fromMe}) decrypted, forwarding immediately to Discord.`);
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
      }
    }).catch(err => {
      console.warn(`[Media Extraction Error] ${msgId}: ${err.message}`);
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
