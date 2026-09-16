import type { WASocket } from '@whiskeysockets/baileys';
import { env } from '../../config/env.js';
import { SYSTEM_CONSTANTS } from '../../config/constants.js';

export class PresenceSimulator {
  calculateTypingDelay(textLength: number): number {
    const baseDelay = textLength * env.typingSpeedMs;
    // Add realistic thinking jitter (500ms - 1500ms)
    const jitter = Math.floor(Math.random() * 1000) + 500;
    const total = baseDelay + jitter;

    return Math.min(
      Math.max(total, SYSTEM_CONSTANTS.DEFAULT_MIN_TYPING_DELAY_MS),
      env.maxTypingDelayMs
    );
  }

  async simulateTypingAndSend(
    sock: WASocket,
    chatJid: string,
    replyText: string
  ): Promise<void> {
    const delay = this.calculateTypingDelay(replyText.length);

    try {
      // Send 'composing' presence
      await sock.sendPresenceUpdate('composing', chatJid);
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Send message
      await sock.sendMessage(chatJid, { text: replyText });
    } finally {
      // Revert presence to 'paused'
      await sock.sendPresenceUpdate('paused', chatJid);
    }
  }
}

export const presenceSimulator = new PresenceSimulator();
