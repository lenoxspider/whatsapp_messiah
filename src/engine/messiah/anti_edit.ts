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
    if (!newContent) return;

    const originalMessage = messageRepo.getMessageById(targetKey);
    const existingEdits = messageEditRepo.getEditsForMessage(targetKey);

    // Determine current effective content before this edit (from prior edit step or original DB record)
    const previousContent = existingEdits.length > 0
      ? (existingEdits[existingEdits.length - 1].edited_content || '')
      : (originalMessage?.content || '');

    if (previousContent === newContent) {
      console.log(`[Anti-Edit] ℹ️ Edit content identical to latest state for ${targetKey}, skipping duplicate.`);
      return;
    }

    const editTimestamp = Number(protocolMessage.timestamp) * 1000 || Date.now();
    const senderPhone = senderJid.split('@')[0].replace(/[^0-9]/g, '');
    const contact = contactRepo.getContact(senderJid);

    console.log(`[Anti-Edit] ✏️ Intercepted edit for ${targetKey} from +${senderPhone} (seq=${existingEdits.length + 1}).`);
    console.log(`[Anti-Edit] Previous: "${previousContent}" -> Edited: "${newContent}"`);

    // Record append-only audit entry in message_edits table
    messageEditRepo.recordEdit({
      messageId: targetKey,
      chatJid,
      senderJid,
      originalContent: previousContent,
      editedContent: newContent,
      timestamp: editTimestamp
    });

    // Handle out-of-order deliveries: resolve the newest edit by timestamp ASC
    const allEdits = messageEditRepo.getEditsForMessage(targetKey);
    const latestEdit = allEdits[allEdits.length - 1];

    if (latestEdit && latestEdit.edited_content) {
      messageRepo.updateContent(targetKey, latestEdit.edited_content);
    }

    // Forward diff alert to Discord
    await discordService.sendMessageEditAlert({
      senderPhone,
      senderName: contact?.name || null,
      originalContent: previousContent,
      editedContent: newContent,
      timestamp: editTimestamp
    });
  }
}

export const antiEditHandler = new AntiEditHandler();
