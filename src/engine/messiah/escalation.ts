import { SYSTEM_CONSTANTS } from '../../config/constants.js';
import { discordService } from '../../services/discord.service.js';
import type { IncomingMessageContext } from '../../types/message.js';

export class EscalationDetector {
  checkUrgency(message: IncomingMessageContext): string | null {
    const text = message.text.toLowerCase();

    for (const keyword of SYSTEM_CONSTANTS.EMERGENCY_KEYWORDS) {
      if (text.includes(keyword)) {
        return `Triggered by emergency keyword: "${keyword}"`;
      }
    }

    return null;
  }

  async escalate(message: IncomingMessageContext, tier: number, reason: string): Promise<void> {
    console.log(`[Escalation] Emergency detected from ${message.senderPhone}. Escalating to Discord.`);
    await discordService.sendEscalationAlert({
      senderPhone: message.senderPhone,
      senderName: message.raw?.pushName,
      tier,
      messageText: message.text,
      reason
    });
  }
}

export const escalationDetector = new EscalationDetector();
