import type { WASocket } from '@whiskeysockets/baileys';
import type { IncomingMessageContext } from '../../types/message.js';
import { contactRepo } from '../../db/repositories/contact.repo.js';
import { messageRepo } from '../../db/repositories/message.repo.js';
import { selectiveDeafness } from './deafness.js';
import { escalationDetector } from './escalation.js';
import { personaEngine } from './persona.js';
import { presenceSimulator } from './presence.js';
import { openaiService } from '../../services/openai.service.js';
import { env } from '../../config/env.js';

export class MessiahHandler {
  async handleContactMessage(sock: WASocket, message: IncomingMessageContext): Promise<void> {
    const contact = contactRepo.upsertContact(
      message.senderJid,
      message.senderPhone,
      message.raw?.pushName
    );

    // 1. Check for emergency escalation triggers
    const urgencyReason = escalationDetector.checkUrgency(message);
    if (urgencyReason) {
      await escalationDetector.escalate(message, contact.tier, urgencyReason);
      return; // Hold reply for manual attention
    }

    // 2. Selective deafness: determine if blue ticks should be sent
    await selectiveDeafness.applyReadReceipt(sock, message.raw.key, contact.tier);

    // 3. If Ghost-Handler is disabled or OpenAI is not configured, do not auto-reply
    if (!env.ghostHandlerEnabled || !env.openaiApiKey) {
      return;
    }

    // 4. Retrieve recent history for persona context
    const history = messageRepo.getRecentChatHistory(message.chatJid, 6);
    const formattedHistory = history
      .map(m => `${m.from_me ? 'Me' : contact.name || 'Them'}: ${m.content || '[Media]'}`)
      .join('\n');

    // 5. Build tier-specific system prompt
    const systemPrompt = personaEngine.buildSystemPrompt(contact, formattedHistory);
    if (!systemPrompt) {
      return; // IGNORE tier or prompt suppressed
    }

    try {
      const historyContext = history.map(h => ({
        role: (h.from_me ? 'assistant' : 'user') as 'user' | 'assistant',
        content: h.content || ''
      }));

      const reply = await openaiService.generateChatReply(
        systemPrompt,
        message.text,
        historyContext
      );

      if (reply) {
        await presenceSimulator.simulateTypingAndSend(sock, message.chatJid, reply);
      }
    } catch (err) {
      console.error(`[MessiahHandler] Failed to generate/send reply to ${message.senderPhone}:`, err);
    }
  }
}

export const messiahHandler = new MessiahHandler();
