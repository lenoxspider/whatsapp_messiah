import path from 'node:path';
import { messageRepo } from '../../db/repositories/message.repo.js';
import { contactRepo } from '../../db/repositories/contact.repo.js';
import { discordService } from '../../services/discord.service.js';

export class AntiRevokeHandler {
  async handleRevoke(revokedKeyId: string): Promise<void> {
    const originalMessage = messageRepo.markAsRevoked(revokedKeyId);
    if (!originalMessage) {
      return;
    }

    console.log(`[Anti-Revoke] Contact attempted to delete message ${revokedKeyId}. Preserved in DB.`);

    const phone = originalMessage.sender_jid.split('@')[0];
    const contact = contactRepo.getContact(originalMessage.sender_jid);
    const fileName = originalMessage.media_path ? path.basename(originalMessage.media_path) : undefined;

    await discordService.sendAntiRevokeAlert({
      senderPhone: phone,
      senderName: contact?.name || null,
      messageText: originalMessage.content || (originalMessage.media_path ? '[Preserved Media Attachment]' : '[Deleted Payload]'),
      timestamp: originalMessage.timestamp,
      filePath: originalMessage.media_path || null,
      fileName: fileName || null,
      mimeType: originalMessage.media_mimetype || null
    });
  }
}

export const antiRevokeHandler = new AntiRevokeHandler();
