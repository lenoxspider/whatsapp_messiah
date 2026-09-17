import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { resurrectionService } from '../../../services/resurrection.service.js';

export const dormantCommand: CommandHandler = {
  name: 'dormant',
  description: 'Thread Resurrection: Surface VIP and friend connections going cold',
  usage: '!dormant [days silent (default 14)]',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    const daysArg = parseInt(fullArgs.trim(), 10);
    const minDays = !isNaN(daysArg) && daysArg > 0 ? daysArg : 14;

    const dormantThreads = resurrectionService.findDormantThreads(minDays, 2);
    const report = resurrectionService.formatDormantReport(dormantThreads, minDays);

    await sock.sendMessage(message.chatJid, { text: report });
  }
};
