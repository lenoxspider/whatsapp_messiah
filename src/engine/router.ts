import type { WASocket } from '@whiskeysockets/baileys';
import { messageRepo } from '../db/repositories/message.repo.js';
import { antiRevokeHandler } from './messiah/anti_revoke.js';
import { secondBrainDispatcher } from './second_brain/dispatcher.js';
import { messiahHandler } from './messiah/handler.js';
import type { IncomingMessageContext } from '../types/message.js';
import { env } from '../config/env.js';

export async function routeIncomingMessage(sock: WASocket, upsert: any): Promise<void> {
  const { messages, type } = upsert;
  if (!messages || messages.length === 0) return;

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

    // Extract message body text
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      '';

    const chatJid = msg.key.remoteJid || '';
    const fromMe = Boolean(msg.key.fromMe);
    const isGroup = chatJid.endsWith('@g.us');
    const senderJid = isGroup ? (msg.key.participant || '') : chatJid;
    const senderPhone = senderJid.split('@')[0];
    const messageType = Object.keys(msg.message)[0] || 'unknown';

    // 1. SILENT ARCHIVE: Persist message immediately to SQLite
    messageRepo.saveMessage({
      id: msg.key.id || `${Date.now()}`,
      chatJid,
      senderJid,
      fromMe,
      messageType,
      content: text,
      rawPayload: msg,
      timestamp: Number(msg.messageTimestamp) * 1000 || Date.now()
    });

    const ctx: IncomingMessageContext = {
      id: msg.key.id || '',
      chatJid,
      senderJid,
      senderPhone,
      fromMe,
      isGroup,
      messageType,
      text,
      timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
      raw: msg
    };

    // 2. ROUTE TO SECOND BRAIN:
    // If sent from the user's account to themselves ("Message Yourself"), or targeting the owner's chat
    const isSelfChat = fromMe && (chatJid === env.ownerJid || chatJid.includes(env.phoneNumber));
    if (isSelfChat || (fromMe && chatJid.endsWith('@s.whatsapp.net') && !isGroup && text.startsWith('!'))) {
      await secondBrainDispatcher.dispatch(sock, ctx);
      continue;
    }

    // 3. ROUTE TO MESSIAH GHOST HANDLER:
    // Inbound messages from other contacts (skip group chats to avoid group spam)
    if (!fromMe && !isGroup) {
      await messiahHandler.handleContactMessage(sock, ctx);
    }
  }
}
