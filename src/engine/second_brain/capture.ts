import type { WASocket } from '@whiskeysockets/baileys';
import type { IncomingMessageContext } from '../../types/message.js';
import { noteRepo } from '../../db/repositories/note.repo.js';

export class AutoCapture {
  async handleForwardOrText(sock: WASocket, message: IncomingMessageContext): Promise<void> {
    const text = message.text.trim();
    if (!text) return;

    // Detect if text contains a URL
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    const url = urlMatch ? urlMatch[0] : null;
    const tag = url ? 'link' : 'inbox';

    const saved = noteRepo.saveNote(text, tag, url);

    // Provide a subtle feedback reaction to the message
    try {
      await sock.sendMessage(message.chatJid, {
        react: {
          text: '📥',
          key: message.raw.key
        }
      });
    } catch {
      // Fallback: send brief confirmation if reaction is unsupported
      await sock.sendMessage(message.chatJid, {
        text: `📥 Captured to \`#${tag}\` [#${saved.id}]`
      });
    }
  }
}

export const autoCapture = new AutoCapture();
