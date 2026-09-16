import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { reminderRepo } from '../../../db/repositories/reminder.repo.js';

export const remindCommand: CommandHandler = {
  name: 'remind',
  description: 'Set a reminder in chat (e.g., !remind in 30m call Kofi)',
  usage: '!remind in <number>(m|h|d) <task>',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    const input = fullArgs.trim();

    // Regex for: "in 15m do something" or "15m do something"
    const match = input.match(/^(?:in\s+)?(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\s+(.+)$/i);

    if (!match) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ Usage: `!remind in 15m Call Kofi` or `!remind 2h Deploy release`'
      });
      return;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const task = match[3].trim();

    let multiplier = 60 * 1000; // default minutes
    if (unit.startsWith('h')) multiplier = 60 * 60 * 1000;
    if (unit.startsWith('d')) multiplier = 24 * 60 * 60 * 1000;

    const triggerAt = Date.now() + (value * multiplier);
    const saved = reminderRepo.createReminder(task, triggerAt);
    const fireDate = new Date(triggerAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    await sock.sendMessage(message.chatJid, {
      text: `⏰ *Reminder set [#${saved.id}]* for *${fireDate}*:\n"${task}"`
    });
  }
};
