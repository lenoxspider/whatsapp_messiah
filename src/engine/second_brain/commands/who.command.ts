import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { identityService } from '../../../services/identity.service.js';

export const whoCommand: CommandHandler = {
  name: 'who',
  description: 'Identity & shared group resolver: look up any number or quoted message',
  usage: '!who [phone number or reply to message]',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    const rawMsg = message.raw.message;
    const contextInfo =
      rawMsg?.extendedTextMessage?.contextInfo ||
      rawMsg?.imageMessage?.contextInfo ||
      rawMsg?.videoMessage?.contextInfo ||
      rawMsg?.documentMessage?.contextInfo;

    let targetJid = '';

    // 1. Check if user quoted someone's message
    if (contextInfo?.participant) {
      targetJid = contextInfo.participant;
    }

    // 2. Check if user passed a phone number in arguments
    if (!targetJid && fullArgs.trim()) {
      const cleanDigits = fullArgs.replace(/[^0-9]/g, '');
      if (cleanDigits.length >= 7) {
        targetJid = `${cleanDigits}@s.whatsapp.net`;
      }
    }

    // 3. If in a direct DM (not self-chat) and no args, resolve current chat partner
    if (!targetJid && !message.isGroup && !message.chatJid.includes('@broadcast')) {
      targetJid = message.chatJid;
    }

    if (!targetJid) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ Usage: Reply to any message with `!who`, or type `!who +233XXXXXXXXX`'
      });
      return;
    }

    try {
      const profile = await identityService.resolveIdentity(sock, targetJid);
      const card = identityService.formatIdentityCard(profile);
      await sock.sendMessage(message.chatJid, { text: card });
    } catch (err: any) {
      await sock.sendMessage(message.chatJid, {
        text: `⚠️ Failed to resolve identity: ${err.message}`
      });
    }
  }
};
