import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { env } from '../../../config/env.js';
import { contactRepo } from '../../../db/repositories/contact.repo.js';
import { getDatabase } from '../../../db/client.js';

export const autopilotCommand: CommandHandler = {
  name: 'autopilot',
  description: 'Manage WhatsApp Agent Autopilot globally or per contact (!autopilot on/off/status, !auto <contact> on/off)',
  usage: '!autopilot [on|off|status] OR !auto <name|phone> [on|off]',

  async execute({ sock, message, args }: CommandContext): Promise<void> {
    const sub = args[0]?.toLowerCase();

    // 1. Global On/Off
    if (sub === 'on') {
      env.autonomousGhost = true;
      await sock.sendMessage(message.chatJid, {
        text: '🤖 *Autopilot Enabled (Global)*\n\nThe WhatsApp Agent is now in active autonomous mode. It will autonomously handle conversations for eligible contacts with humanized delays.'
      });
      return;
    }

    if (sub === 'off') {
      env.autonomousGhost = false;
      await sock.sendMessage(message.chatJid, {
        text: '⏸️ *Autopilot Disabled (Global)*\n\nThe WhatsApp Agent is now in passive monitoring mode. Automated replies are suspended.'
      });
      return;
    }

    // 2. Per-Contact Toggle: !auto <target> on|off OR !autopilot <target> on|off
    if (args.length >= 2 && (args[args.length - 1].toLowerCase() === 'on' || args[args.length - 1].toLowerCase() === 'off')) {
      const stateStr = args[args.length - 1].toLowerCase();
      const targetQuery = args.slice(0, args.length - 1).join(' ');
      const enable = stateStr === 'on';

      const contact = contactRepo.searchContact(targetQuery);
      if (!contact) {
        await sock.sendMessage(message.chatJid, {
          text: `❌ Contact not found matching: "${targetQuery}".`
        });
        return;
      }

      contactRepo.setAutopilot(contact.jid, enable);
      await sock.sendMessage(message.chatJid, {
        text: `🤖 *Contact Autopilot Updated*\n\n` +
              `• Contact: *${contact.name || contact.phone}* (+${contact.phone})\n` +
              `• Autopilot: *${enable ? '✅ ON' : '❌ OFF'}*\n\n` +
              (enable
                ? `The Agent will now autonomously converse with this contact even if global autopilot is off.`
                : `Autopilot disabled for this specific contact.`)
      });
      return;
    }

    // 3. Status Report
    const db = getDatabase();
    const activeContacts = db.prepare(`
      SELECT name, phone, tier FROM contacts
      WHERE autopilot_enabled = 1
      ORDER BY name ASC
    `).all() as Array<{ name: string | null; phone: string; tier: number }>;

    let response = `🎛️ *WhatsApp Agent Autopilot Status*\n\n`;
    response += `• *Global Autopilot:* ${env.autonomousGhost ? '✅ ON' : '⏸️ OFF'}\n`;
    response += `• *Ghost Engine:* ${env.ghostHandlerEnabled ? '🟢 Active' : '🔴 Inactive'}\n\n`;

    if (activeContacts.length > 0) {
      response += `📌 *Contacts with Explicit Autopilot Enabled (${activeContacts.length}):*\n`;
      for (const c of activeContacts) {
        response += `• ${c.name || 'Unknown'} (+${c.phone}) [Tier ${c.tier}]\n`;
      }
    } else {
      response += `📌 *Contacts with Explicit Autopilot:* None (inheriting global status).\n`;
    }

    response += `\n_Usage:_\n`;
    response += `• \`!autopilot on\` / \`!autopilot off\` (Global master)\n`;
    response += `• \`!autopilot <name|phone> on\` / \`off\` (Per-contact)\n`;

    await sock.sendMessage(message.chatJid, { text: response.trim() });
  }
};
