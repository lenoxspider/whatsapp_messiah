import type { WASocket } from '@whiskeysockets/baileys';
import type { IncomingMessageContext } from '../../types/message.js';
import type { CommandHandler, CommandContext } from '../../types/command.js';
import { SYSTEM_CONSTANTS } from '../../config/constants.js';
import { autoCapture } from './capture.js';

import { noteCommand } from './commands/note.command.js';
import { findCommand } from './commands/find.command.js';
import { remindCommand } from './commands/remind.command.js';
import { askCommand } from './commands/ask.command.js';
import { digestCommand } from './commands/digest.command.js';

export class SecondBrainDispatcher {
  private commands = new Map<string, CommandHandler>();

  constructor() {
    this.register(noteCommand);
    this.register(findCommand);
    this.register(remindCommand);
    this.register(askCommand);
    this.register(digestCommand);
  }

  private register(command: CommandHandler): void {
    this.commands.set(command.name.toLowerCase(), command);
  }

  async dispatch(sock: WASocket, message: IncomingMessageContext): Promise<void> {
    const text = message.text.trim();

    // If it starts with command prefix '!'
    if (text.startsWith(SYSTEM_CONSTANTS.COMMAND_PREFIX)) {
      const withoutPrefix = text.slice(SYSTEM_CONSTANTS.COMMAND_PREFIX.length).trim();
      const parts = withoutPrefix.split(/\s+/);
      const commandName = parts[0]?.toLowerCase() || '';
      const args = parts.slice(1);
      const fullArgs = withoutPrefix.slice(commandName.length).trim();

      if (commandName === 'help') {
        await this.sendHelp(sock, message.chatJid);
        return;
      }

      const handler = this.commands.get(commandName);
      if (handler) {
        const ctx: CommandContext = { sock, message, args, fullArgs };
        await handler.execute(ctx);
      } else {
        await sock.sendMessage(message.chatJid, {
          text: `❓ Unknown command: \`${commandName}\`. Type \`!help\` to view available commands.`
        });
      }
      return;
    }

    // Otherwise: passive capture
    await autoCapture.handleForwardOrText(sock, message);
  }

  private async sendHelp(sock: WASocket, chatJid: string): Promise<void> {
    let help = `⚡ *MESSIAH SECOND BRAIN COMMANDS*\n\n`;
    for (const cmd of this.commands.values()) {
      help += `• *${cmd.usage}*\n  _${cmd.description}_\n\n`;
    }
    help += `💡 *Tip:* Forward any link, thought, or text to yourself without a prefix to auto-capture it into your vault.`;
    await sock.sendMessage(chatJid, { text: help.trim() });
  }
}

export const secondBrainDispatcher = new SecondBrainDispatcher();
