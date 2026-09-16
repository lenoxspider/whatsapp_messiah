import type { WASocket } from '@whiskeysockets/baileys';
import { ContactTier } from '../../types/contact.js';

export class SelectiveDeafness {
  shouldMarkAsRead(tier: ContactTier): boolean {
    switch (tier) {
      case ContactTier.TIER1_INNER:
      case ContactTier.TIER2_ACQUAINTANCE:
        return true; // Mark read after delay
      case ContactTier.TIER3_BUSINESS:
        return true;
      case ContactTier.TIER4_STRANGER:
      case ContactTier.IGNORE:
      default:
        // Permanently unread - zero blue ticks
        return false;
    }
  }

  async applyReadReceipt(
    sock: WASocket,
    messageKey: any,
    tier: ContactTier
  ): Promise<void> {
    if (!this.shouldMarkAsRead(tier)) {
      return;
    }

    // Delay read receipt slightly to simulate a human opening the chat
    const delay = Math.floor(Math.random() * 2000) + 1000;
    setTimeout(async () => {
      try {
        await sock.readMessages([messageKey]);
      } catch (err) {
        // Silently catch read failure
      }
    }, delay);
  }
}

export const selectiveDeafness = new SelectiveDeafness();
