import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { contactRepo } from '../../../db/repositories/contact.repo.js';

export const contactsCommand: CommandHandler = {
  name: 'contacts',
  description: 'List synced contacts and check address book sync status',
  usage: '!contacts [optional tier: 1-5]',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    const totalCount = contactRepo.getContactCount();
    const tierFilter = parseInt(fullArgs.trim(), 10);
    const validTier = !isNaN(tierFilter) && tierFilter >= 1 && tierFilter <= 5 ? tierFilter : undefined;

    const list = contactRepo.listContacts(20, validTier);

    if (totalCount === 0) {
      await sock.sendMessage(message.chatJid, {
        text: '📭 *No Contacts Synced Yet*\n\nWhatsApp address book sync runs when the session connects. If Messiah just connected, contacts will appear shortly as WhatsApp pushes them or as messages arrive.\n\nYou can also view contacts on the Web Dashboard at `/contacts.html`.'
      });
      return;
    }

    const tierBadges: Record<number, string> = {
      1: '⭐ VIP (Tier 1)',
      2: '⚡ Priority (Tier 2)',
      3: '👥 Regular (Tier 3)',
      4: '🔇 Stranger (Tier 4)',
      5: '👻 Ghost (Tier 5)'
    };

    let reply = `👥 *SYNCED CONTACTS DIRECTORY*\n\n`;
    reply += `• *Total Synced in SQLite:* ${totalCount} contacts\n`;
    if (validTier) {
      reply += `• *Filter:* Tier ${validTier}\n`;
    }
    reply += `\n`;

    const lines = list.map((c, i) => {
      const displayName = c.name || `[Unknown Name]`;
      const autoBadge = c.autopilot_enabled === 1 ? ' 🤖[AUTO]' : '';
      return `${i + 1}. *${displayName}* (+${c.phone}) - Tier ${c.tier}${autoBadge}`;
    });

    reply += lines.join('\n');

    if (totalCount > list.length) {
      reply += `\n\n_Showing top ${list.length} of ${totalCount}. View full interactive directory at \`/contacts.html\`._`;
    }

    await sock.sendMessage(message.chatJid, { text: reply });
  }
};
