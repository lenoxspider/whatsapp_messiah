import { messageRepo } from '../../db/repositories/message.repo.js';
import { discordService } from '../../services/discord.service.js';

export class AntiRevokeHandler {
  async handleRevoke(revokedKeyId: string): Promise<void> {
    const originalMessage = messageRepo.markAsRevoked(revokedKeyId);
    if (!originalMessage) {
      return;
    }

    console.log(`[Anti-Revoke] Contact attempted to delete message ${revokedKeyId}. Preserved in DB.`);

    const phone = originalMessage.sender_jid.split('@')[0];
    await discordService.sendAntiRevokeAlert({
      senderPhone: phone,
      messageText: originalMessage.content || '[Media/Encrypted payload]',
      timestamp: originalMessage.timestamp
    });
  }
}

export const antiRevokeHandler = new AntiRevokeHandler();
