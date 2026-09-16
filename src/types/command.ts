import type { WASocket } from '@whiskeysockets/baileys';
import type { IncomingMessageContext } from './message.js';

export interface CommandContext {
  sock: WASocket;
  message: IncomingMessageContext;
  args: string[];
  fullArgs: string;
}

export interface CommandHandler {
  name: string;
  description: string;
  usage: string;
  execute(ctx: CommandContext): Promise<void>;
}
