import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { contactRepo } from '../../../db/repositories/contact.repo.js';

export const nameCommand: CommandHandler = {
  name: 'name',
  description: 'Assign or update a friendly saved name for a contact in Messiah',
  usage: '!name <phone/name or reply to message> <New Saved Name>',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    const rawMsg = message.raw.message;
    const contextInfo =
      rawMsg?.extendedTextMessage?.contextInfo ||
      rawMsg?.imageMessage?.contextInfo ||
      rawMsg?.videoMessage?.contextInfo ||
      rawMsg?.documentMessage?.contextInfo;

    let targetJid = '';
    let newName = '';

    // 1. If user replied to someone's message
    if (contextInfo?.participant) {
      targetJid = contextInfo.participant;
      newName = fullArgs.trim();
    } else {
      // 2. Parse from arguments: e.g. "!name 1234567890 John Doe" or "!name Alex Alexander Smith"
      const parts = fullArgs.trim().split(/\s+/);
      if (parts.length >= 2) {
        const query = parts[0];
        newName = parts.slice(1).join(' ').trim();

        const contact = contactRepo.searchContact(query);
        if (contact) {
          targetJid = contact.jid;
        } else {
          const cleanDigits = query.replace(/[^0-9]/g, '');
          if (cleanDigits.length >= 7) {
            targetJid = `${cleanDigits}@s.whatsapp.net`;
            // Upsert if doesn't exist
            contactRepo.upsertContact(targetJid, cleanDigits, newName);
          }
        }
      }
    }

    if (!targetJid || !newName) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ Usage:\n• Reply to a message with: `!name <Real Name>`\n• Or type: `!name <phone or current name> <Real Name>`\n\nExample: `!name 233541234567 Alex Mercer`'
      });
      return;
    }

    const cleanPhone = targetJid.split('@')[0].replace(/[^0-9]/g, '');
    contactRepo.upsertContact(targetJid, cleanPhone, newName);

    await sock.sendMessage(message.chatJid, {
      text: `✅ *Contact Renamed*\n\n• *Name:* ${newName}\n• *Phone:* +${cleanPhone}\n• *JID:* \`${targetJid}\`\n\n_This name will now appear on your Executive Dossier and Web Dashboard._`
    });
  }
};
