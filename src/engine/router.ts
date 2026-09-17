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

export function extractMessageText(message: any): string {
  if (!message) return '';
  const m =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    message;

  return (
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
    if (!msg.message) continue;

    // Handle Revocation ("Delete for Everyone") events
    const protocolMessage = msg.message?.protocolMessage;
    if (protocolMessage && protocolMessage.type === 0 /* REVOKE */) {
      const targetKey = protocolMessage.key?.id;
      if (targetKey) {
        await antiRevokeHandler.handleRevoke(targetKey);
      }
      continue;
    }

    const text = extractMessageText(msg.message);
    const chatJid = msg.key.remoteJid || '';
    const fromMe = Boolean(msg.key.fromMe);
    const isGroup = chatJid.endsWith('@g.us');
    const senderJid = isGroup ? (msg.key.participant || '') : chatJid;
    const senderPhone = senderJid.split('@')[0];
    const messageType = Object.keys(msg.message)[0] || 'unknown';

    // Ignore bot's own output to prevent infinite loops
    const isBotEcho = fromMe && (
      text.startsWith('⚡ *MESSIAH') ||
      text.startsWith('📝 *Saved Note') ||
      text.startsWith('⏰ *REMINDER') ||
      text.startsWith('🔍 *Search Results') ||
      text.startsWith('❓ Unknown command') ||
      text.startsWith('🧠 *MESSIAH') ||
      text.startsWith('📥 Captured') ||
      text.startsWith('⚠️ Usage:')
    );
    if (isBotEcho) continue;

    console.log(`[Message Inbound] chat=${chatJid} fromMe=${fromMe} text="${text}"`);

    // 1. SILENT ARCHIVE & MEDIA EXTRACTION
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

    // Asynchronously extract and decrypt media (so text routing remains instant)
    mediaExtractor.extractAndSaveMedia(msg).then(async (extracted) => {
      if (!extracted) return;

      messageRepo.updateMedia(msgId, extracted.filePath, extracted.mimeType, extracted.isViewOnce);

      // If media is from someone else and Discord forwarding is enabled:
      if (!fromMe && env.forwardMediaToDiscord) {
        const contact = contactRepo.getContact(senderJid);
        if (extracted.isViewOnce) {
          console.log(`[Anti-ViewOnce] Ephemeral View-Once from ${senderPhone} decrypted, forwarding immediately to Discord.`);
          await discordService.sendViewOnceAlert({
            senderPhone,
            senderName: contact?.name || null,
            caption: extracted.caption || text || undefined,
            timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
            buffer: extracted.buffer,
            fileName: extracted.fileName,
            mimeType: extracted.mimeType
          });
        } else {
          console.log(`[Media Inbound] Media from ${senderPhone} saved to ${extracted.fileName}, forwarding to Discord.`);
          await discordService.sendIncomingMediaAlert({
            senderPhone,
            senderName: contact?.name || null,
            caption: extracted.caption || text || undefined,
            timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
            buffer: extracted.buffer,
            fileName: extracted.fileName,
            mimeType: extracted.mimeType
          });
        }
      }
    }).catch(err => {
      console.warn(`[Media Extraction Error] ${msgId}: ${err.message}`);
    });

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

    // 2. SELF-CHAT / SECOND BRAIN ROUTING:
    // Matches if message was sent from your account to yourself OR if you type any '!' command in any DM
    const isSelfChat = fromMe && (
      (myJid && chatJid === myJid) ||
      (myPhone && chatJid.startsWith(myPhone)) ||
      (myLid && chatJid === myLid)
    );

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
