import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { noteRepo } from '../../../db/repositories/note.repo.js';
import { reminderRepo } from '../../../db/repositories/reminder.repo.js';

export const digestCommand: CommandHandler = {
  name: 'digest',
  description: 'Display your recent captures and pending reminders',
  usage: '!digest',

  async execute({ sock, message }: CommandContext): Promise<void> {
    const recentNotes = noteRepo.getRecentNotes(5);
    const pendingReminders = reminderRepo.getPendingReminders();

    let text = `🧠 *MESSIAH SECOND BRAIN DIGEST*\n\n`;

    text += `📌 *Pending Reminders (${pendingReminders.length}):*\n`;
    if (pendingReminders.length === 0) {
      text += `_No pending reminders._\n`;
    } else {
      pendingReminders.forEach((r) => {
        const time = new Date(r.trigger_at).toLocaleString();
        text += `• [#${r.id}] ${r.task} — _${time}_\n`;
      });
    }

    text += `\n📝 *Recent Captures (${recentNotes.length}):*\n`;
    if (recentNotes.length === 0) {
      text += `_No notes recorded yet._\n`;
    } else {
      recentNotes.forEach((n) => {
        text += `• \`#${n.tag}\`: ${n.content.slice(0, 80)}${n.content.length > 80 ? '...' : ''}\n`;
      });
    }

    await sock.sendMessage(message.chatJid, { text });
  }
};
