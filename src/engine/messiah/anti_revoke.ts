import path from 'node:path';
import fs from 'node:fs';
import type { WASocket } from '@whiskeysockets/baileys';
import { messageRepo } from '../../db/repositories/message.repo.js';
import { contactRepo } from '../../db/repositories/contact.repo.js';
import { discordService } from '../../services/discord.service.js';
import { env } from '../../config/env.js';

export class AntiRevokeHandler {
  async handleRevoke(sock: WASocket | null, revokedKeyId: string): Promise<void> {
    const originalMessage = messageRepo.markAsRevoked(revokedKeyId);
    if (!originalMessage || originalMessage.from_me === 1) {
      return;
    }

    console.log(`[Anti-Revoke] Contact attempted to delete message ${revokedKeyId}. Preserved in DB.`);

    const phone = originalMessage.sender_jid.split('@')[0];
    const contact = contactRepo.getContact(originalMessage.sender_jid);
    const fileName = originalMessage.media_path ? path.basename(originalMessage.media_path) : undefined;
    const contentText = originalMessage.content || (originalMessage.media_path ? '[Preserved Media Attachment]' : '[Deleted Payload]');

    // 1. Send alert to Discord (if configured)
    await discordService.sendAntiRevokeAlert({
      senderPhone: phone,
      senderName: contact?.name || null,
      messageText: contentText,
      timestamp: originalMessage.timestamp,
      filePath: originalMessage.media_path || null,
      fileName: fileName || null,
      mimeType: originalMessage.media_mimetype || null
    });

    // 2. Send alert directly to owner JID on WhatsApp (if sock and ownerJid are available)
    if (sock && env.ownerJid) {
      try {
        const header = `🛡️ *[ANTI-REVOKE DETECTED]*\n\n` +
          `👤 *Sender:* ${contact?.name || 'Contact'} (+${phone})\n` +
          `🕒 *Time:* ${new Date(originalMessage.timestamp).toLocaleString()}\n` +
          `💬 *Deleted Content:* ${originalMessage.content || '[Media Attachment]'}`;

        if (originalMessage.media_path && fs.existsSync(originalMessage.media_path)) {
          const buffer = await fs.promises.readFile(originalMessage.media_path);
          const mime = originalMessage.media_mimetype || 'application/octet-stream';
          const msgObj: any = { caption: header };

          if (mime.startsWith('image/')) {
            msgObj.image = buffer;
          } else if (mime.startsWith('video/')) {
            msgObj.video = buffer;
          } else if (mime.startsWith('audio/')) {
            msgObj.audio = buffer;
            msgObj.mimetype = mime;
          } else {
            msgObj.document = buffer;
            msgObj.mimetype = mime;
            msgObj.fileName = fileName || 'deleted_media';
          }
          await sock.sendMessage(env.ownerJid, msgObj);
        } else {
          await sock.sendMessage(env.ownerJid, { text: header });
        }
        console.log(`[Anti-Revoke] Preserved deleted message forwarded directly to owner WhatsApp (${env.ownerJid}).`);
      } catch (waErr: any) {
        console.warn('[Anti-Revoke] Failed to forward revoked message to owner WhatsApp:', waErr.message);
      }
    }
  }
}

export const antiRevokeHandler = new AntiRevokeHandler();
