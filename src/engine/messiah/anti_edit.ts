import { messageRepo } from '../../db/repositories/message.repo.js';
import { messageEditRepo } from '../../db/repositories/message_edit.repo.js';
import { contactRepo } from '../../db/repositories/contact.repo.js';
import { discordService } from '../../services/discord.service.js';
import { extractMessageText } from '../router.js';

export class AntiEditHandler {
  async handleEdit(protocolMessage: any, senderJid: string, chatJid: string): Promise<void> {
    const targetKey = protocolMessage.key?.id;
    if (!targetKey) return;

    const editedPayload = protocolMessage.editedMessage;
    if (!editedPayload) return;

    const newContent = extractMessageText(editedPayload);
    const originalMessage = messageRepo.getMessageById(targetKey);

    const senderPhone = senderJid.split('@')[0].replace(/[^0-9]/g, '');
    const contact = contactRepo.getContact(senderJid);
    const originalContent = originalMessage?.content || '';

    // Ignore if content hasn't actually changed
    if (originalContent === newContent) return;

    console.log(`[Anti-Edit] Intercepted message edit for ${targetKey} from ${senderPhone}.`);
    console.log(`[Anti-Edit] Original: "${originalContent}" -> Edited: "${newContent}"`);

    // Record audit entry
    messageEditRepo.recordEdit({
      messageId: targetKey,
      chatJid,
      senderJid,
      originalContent,
      editedContent: newContent,
      timestamp: Date.now()
    });

    // Update message table with newest content
    messageRepo.updateContent(targetKey, newContent);

    // Forward diff to Discord
    await discordService.sendMessageEditAlert({
      senderPhone,
      senderName: contact?.name || null,
      originalContent,
      editedContent: newContent,
      timestamp: Date.now()
    });
  }
}

export const antiEditHandler = new AntiEditHandler();
