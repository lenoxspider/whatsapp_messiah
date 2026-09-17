import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { dossierService } from '../../../services/dossier.service.js';
import { contactRepo } from '../../../db/repositories/contact.repo.js';

export const dossierCommand: CommandHandler = {
  name: 'dossier',
  description: 'AI Contact Dossier: Synthesize executive summary, commitments, and communication tone',
  usage: '!dossier [phone or reply to message] [--refresh]',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    const rawMsg = message.raw.message;
    const contextInfo =
      rawMsg?.extendedTextMessage?.contextInfo ||
      rawMsg?.imageMessage?.contextInfo ||
      rawMsg?.videoMessage?.contextInfo ||
      rawMsg?.documentMessage?.contextInfo;

    let targetJid = '';
    const forceRefresh = fullArgs.includes('--refresh');
    const cleanArgs = fullArgs.replace('--refresh', '').trim();

    // 1. Quoted message
    if (contextInfo?.participant) {
      targetJid = contextInfo.participant;
    }

    // 2. Argument (phone number or name search)
    if (!targetJid && cleanArgs) {
      const cleanDigits = cleanArgs.replace(/[^0-9]/g, '');
      if (cleanDigits.length >= 7) {
        targetJid = `${cleanDigits}@s.whatsapp.net`;
      } else {
        const found = contactRepo.searchContact(cleanArgs);
        if (found) {
          targetJid = found.jid;
        }
      }
    }

    // 3. Current DM
    if (!targetJid && !message.isGroup && !message.chatJid.includes('@broadcast')) {
      targetJid = message.chatJid;
    }

    if (!targetJid) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ Usage: Reply to any message with `!dossier`, or type `!dossier +233XXXXXXXXX`'
      });
      return;
    }

    const contact = contactRepo.getContact(targetJid);
    const contactName = contact?.name || targetJid.split('@')[0];
    const phone = targetJid.split('@')[0].replace(/[^0-9]/g, '');

    await sock.sendMessage(message.chatJid, {
      text: `⏳ *Synthesizing Intelligence Dossier for ${contactName}...*`
    });

    try {
      const dossier = await dossierService.getOrGenerateDossier(targetJid, forceRefresh);
      const card = dossierService.formatDossierForChat(dossier, contactName, phone);
      await sock.sendMessage(message.chatJid, { text: card });
    } catch (err: any) {
      await sock.sendMessage(message.chatJid, {
        text: `⚠️ Failed to generate dossier: ${err.message}`
      });
    }
  }
};
