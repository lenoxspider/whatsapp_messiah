import type { WASocket } from '@whiskeysockets/baileys';
import { env } from '../../config/env.js';
import { SYSTEM_CONSTANTS } from '../../config/constants.js';

export class PresenceSimulator {
  calculateReadingLatency(inboundLength: number = 20): number {
    // Human reading latency before picking up phone and typing (2.5s - 8s)
    const base = 2500;
    const readingTime = Math.min(inboundLength * 35, 4000);
    const jitter = Math.floor(Math.random() * 2000);
    return base + readingTime + jitter;
  }

  calculateTypingDelay(textLength: number): number {
    const baseDelay = textLength * env.typingSpeedMs;
    // Add realistic thinking jitter (600ms - 1800ms)
    const jitter = Math.floor(Math.random() * 1200) + 600;
    const total = baseDelay + jitter;

    return Math.min(
      Math.max(total, SYSTEM_CONSTANTS.DEFAULT_MIN_TYPING_DELAY_MS),
      env.maxTypingDelayMs
    );
  }

  async simulateTypingAndSend(
    sock: WASocket,
    chatJid: string,
    replyText: string,
    inboundTextLength: number = 20
  ): Promise<void> {
    // HARD SAFETY CHOKE POINT: Block autonomous replies to WhatsApp Group JIDs (@g.us)
    if (chatJid.endsWith('@g.us') || chatJid.includes('@g.us')) {
      console.error(`[Ghost Safety Choke] ⛔ BLOCKED autonomous reply attempt to group JID: ${chatJid}`);
      throw new Error(`Send-Layer Blocked: Autonomous replies to group JID ${chatJid} are strictly prohibited.`);
    }

    // 1. Initial human reflection latency (phone idle before noticing/reading)
    const readingLatency = this.calculateReadingLatency(inboundTextLength);
    await new Promise((resolve) => setTimeout(resolve, readingLatency));

    const totalTypingDelay = this.calculateTypingDelay(replyText.length);

    try {
      // 2. Start typing indicator
      await sock.sendPresenceUpdate('composing', chatJid);

      // If reply is long, simulate a natural mid-typing pause
      if (replyText.length > 50 && totalTypingDelay > 3000) {
        const halfDelay = Math.floor(totalTypingDelay / 2);
        await new Promise((resolve) => setTimeout(resolve, halfDelay));

        // Brief pause in typing (800ms)
        await sock.sendPresenceUpdate('paused', chatJid);
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Resume typing second half
        await sock.sendPresenceUpdate('composing', chatJid);
        await new Promise((resolve) => setTimeout(resolve, halfDelay));
      } else {
        await new Promise((resolve) => setTimeout(resolve, totalTypingDelay));
      }

      // 3. Dispatch the message
      await sock.sendMessage(chatJid, { text: replyText });
    } finally {
      // Reset presence to paused
      await sock.sendPresenceUpdate('paused', chatJid);
    }
  }
}

export const presenceSimulator = new PresenceSimulator();
