import type { WASocket } from '@whiskeysockets/baileys';
import type { IncomingMessageContext } from '../../types/message.js';
import { contactRepo } from '../../db/repositories/contact.repo.js';
import { messageRepo } from '../../db/repositories/message.repo.js';
import { noteRepo } from '../../db/repositories/note.repo.js';
import { getDatabase } from '../../db/client.js';
import { systemLogger } from '../../server/logger.js';
import { ContactTier } from '../../types/contact.js';
import { selectiveDeafness } from './deafness.js';
import { escalationDetector } from './escalation.js';
import { personaEngine } from './persona.js';
import { presenceSimulator } from './presence.js';
import { openaiService } from '../../services/openai.service.js';
import { env } from '../../config/env.js';

import { contactFactRepo } from '../../db/repositories/contact_fact.repo.js';

let cachedVoiceProfile: string = '';
let lastVoiceProfileFetch: number = 0;

export class MessiahHandler {
  private async getVoiceProfile(): Promise<string> {
    const now = Date.now();
    // Cache for 6 hours
    if (cachedVoiceProfile && now - lastVoiceProfileFetch < 6 * 60 * 60 * 1000) {
      return cachedVoiceProfile;
    }

    try {
      const db = getDatabase();
      const rows = db.prepare(`
        SELECT content FROM messages
        WHERE from_me = 1 AND content IS NOT NULL AND content != ''
        ORDER BY timestamp DESC
        LIMIT 35
      `).all() as Array<{ content: string }>;

      if (rows.length >= 5) {
        const samples = rows.map(r => r.content);
        const profile = await openaiService.analyzeVoiceProfile(samples);
        if (profile) {
          cachedVoiceProfile = profile;
          lastVoiceProfileFetch = now;
        }
      }
    } catch {}

    return cachedVoiceProfile;
  }

  async handleContactMessage(sock: WASocket, message: IncomingMessageContext): Promise<void> {
    const contact = contactRepo.upsertContact(
      message.senderJid,
      message.senderPhone,
      message.raw?.pushName
    );

    // 1. Asynchronous Background Fact Extraction (Non-blocking memory consolidation)
    if (openaiService.isConfigured() && contact.tier <= ContactTier.TIER3_BUSINESS && message.text) {
      openaiService.extractFacts(message.text, contact.name).then(facts => {
        if (facts && facts.length > 0) {
          for (const item of facts) {
            contactFactRepo.addFact(contact.jid, item.fact, item.category, 1.0, message.id);
            systemLogger.info('Memory', `Learned fact for ${contact.name || contact.phone}: "${item.fact}" [${item.category}]`);
          }
        }
      }).catch(() => {});
    }

    // 2. Check for emergency escalation triggers across all tiers
    const urgencyReason = escalationDetector.checkUrgency(message);
    if (urgencyReason) {
      systemLogger.warn('Escalation', `Urgent trigger from ${contact.name || contact.phone}: "${message.text}"`);
      await escalationDetector.escalate(message, contact.tier, urgencyReason);
      return; // Hold reply for owner's manual review
    }

    // 3. Selective deafness: control read receipts (blue vs grey ticks)
    await selectiveDeafness.applyReadReceipt(sock, message.raw.key, contact.tier);

    // 4. Autonomous Ghost Switch & LLM Availability
    if (!env.ghostHandlerEnabled || !env.autonomousGhost || !env.openaiApiKey) {
      return; // Autonomous replies disabled or OpenAI key not set
    }

    // 5. Time Awareness & Sleep Simulation:
    // Between 11:30 PM and 7:00 AM, suppress automated replies to acquaintances & strangers
    const currentHour = new Date().getHours();
    const isQuietHours = currentHour >= 23 || currentHour < 7;
    if (isQuietHours && contact.tier > ContactTier.TIER1_INNER) {
      systemLogger.info('Ghost', `Quiet hours (${currentHour}:00). Suppressing reply to Tier ${contact.tier} (${contact.name || contact.phone}).`);
      return;
    }

    // 6. Anti-Revoke Intelligence: Check if contact deleted messages in this chat
    let revokedCount = 0;
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT COUNT(*) as count FROM messages WHERE sender_jid = ? AND is_revoked = 1').get() as { count: number };
      revokedCount = row?.count || 0;
    } catch {}

    // 7. Vault Bridging: Pull user's relevant notes for Inner Circle / Acquaintances
    let vaultContext = '';
    if (contact.tier <= ContactTier.TIER2_ACQUAINTANCE) {
      const relevantNotes = noteRepo.searchNotesAdvanced(message.text, 2);
      if (relevantNotes.length > 0) {
        vaultContext = relevantNotes.map(n => `• (${n.tag}): ${n.content}`).join('\n');
      }
    }

    // 8. Retrieve recent chat history for conversational continuity
    const history = messageRepo.getRecentChatHistory(message.chatJid, 6);
    const formattedHistory = history
      .map(m => `${m.from_me ? 'Me' : contact.name || 'Them'}: ${m.content || '[Media]'}`)
      .join('\n');

    // 9. Fetch Operator's Voice Profile (if available)
    const voiceProfile = await this.getVoiceProfile();

    // 10. Build tier-specific system prompt with active living memory
    const systemPrompt = personaEngine.buildSystemPrompt(contact, formattedHistory, vaultContext, revokedCount, voiceProfile);
    if (!systemPrompt) {
      return; // IGNORE tier or persona suppressed
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
        systemLogger.success('Ghost', `Autonomous reply dispatched to ${contact.name || contact.phone} (Tier ${contact.tier})`);
        await presenceSimulator.simulateTypingAndSend(sock, message.chatJid, reply, message.text.length);
      }
    } catch (err: any) {
      systemLogger.error('Ghost', `Reply error for ${contact.name || contact.phone}: ${err.message}`);
      console.error(`[MessiahHandler] Failed to generate/send reply to ${message.senderPhone}:`, err);
    }
  }
}

export const messiahHandler = new MessiahHandler();
