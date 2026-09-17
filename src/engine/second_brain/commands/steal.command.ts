import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { statusTargetRepo } from '../../../db/repositories/status_target.repo.js';
import { contactRepo } from '../../../db/repositories/contact.repo.js';

export const stealCommand: CommandHandler = {
  name: 'steal',
  description: 'Manage target contacts for silent stealth status capture (!steal add/remove/list)',
  usage: '!steal <add|remove|list> [phone/name]',

  async execute({ sock, message, args }: CommandContext): Promise<void> {
    const sub = (args[0] || '').toLowerCase();
    const targetInput = args.slice(1).join(' ').trim();

    if (sub === 'list') {
      const targets = statusTargetRepo.getAllTargets();
      if (targets.length === 0) {
        await sock.sendMessage(message.chatJid, {
          text: `🕵️ *[STATUS STEALER TARGETS]*\n\nNo target contacts configured. Use \`!steal add <phone>\` to target contacts.`
        });
        return;
      }

      let text = `🕵️ *[STATUS STEALER TARGETS]* (${targets.length} active)\n\n`;
      targets.forEach((t, i) => {
        text += `${i + 1}. *+${t.phone}* ${t.name ? `(${t.name})` : ''}\n`;
      });
      await sock.sendMessage(message.chatJid, { text });
      return;
    }

    if (sub === 'add') {
      if (!targetInput) {
        await sock.sendMessage(message.chatJid, {
          text: `❌ Please specify a phone number or name. Example: \`!steal add 233541234567\``
        });
        return;
      }

      let phone = targetInput.replace(/[^0-9]/g, '');
      let name: string | null = null;

      // If not pure digits, try searching contact address book by name
      if (phone.length < 7) {
        const found = contactRepo.searchContact(targetInput);
        if (found) {
          phone = found.phone;
          name = found.name;
        } else {
          await sock.sendMessage(message.chatJid, {
            text: `❌ Could not resolve phone number for "${targetInput}". Provide the full phone number with country code.`
          });
          return;
        }
      } else {
        const contact = contactRepo.getContact(`${phone}@s.whatsapp.net`);
        name = contact?.name || null;
      }

      statusTargetRepo.addTarget(phone, name);
      await sock.sendMessage(message.chatJid, {
        text: `🎯 *Target Added for Stealth Status Stealer*\n\nPhone: *+${phone}* ${name ? `(${name})` : ''}\nStatus updates from this contact will now be captured automatically upon receipt.`
      });
      return;
    }

    if (sub === 'remove' || sub === 'delete' || sub === 'rm') {
      if (!targetInput) {
        await sock.sendMessage(message.chatJid, {
          text: `❌ Specify the phone number to remove. Example: \`!steal remove 233541234567\``
        });
        return;
      }

      const phone = targetInput.replace(/[^0-9]/g, '');
      const removed = statusTargetRepo.removeTarget(phone);
      if (removed) {
        await sock.sendMessage(message.chatJid, {
          text: `🗑️ Target *+${phone}* removed from status stealer list.`
        });
      } else {
        await sock.sendMessage(message.chatJid, {
          text: `⚠️ Target *+${phone}* was not found in the stealer list.`
        });
      }
      return;
    }

    await sock.sendMessage(message.chatJid, {
      text: `⚡ *Status Stealer Commands*\n\n` +
        `• \`!steal add <phone|name>\` - Add contact to target list\n` +
        `• \`!steal remove <phone>\` - Remove contact from target list\n` +
        `• \`!steal list\` - Show all status capture targets`
    });
  }
};
