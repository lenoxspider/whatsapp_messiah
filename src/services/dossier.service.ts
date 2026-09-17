import OpenAI from 'openai';
import { openaiService, calculateCost } from './openai.service.js';
import { contactRepo } from '../db/repositories/contact.repo.js';
import { messageRepo } from '../db/repositories/message.repo.js';
import { contactFactRepo } from '../db/repositories/contact_fact.repo.js';
import { dossierRepo, type ContactDossierRecord } from '../db/repositories/dossier.repo.js';
import { llmCallRepo } from '../db/repositories/llm_call.repo.js';
import { env } from '../config/env.js';

export interface DossierResult {
  jid: string;
  summary: string;
  openCommitments: string[];
  toneProfile: string;
  topics: string[];
  messageCountAnalyzed: number;
  cached: boolean;
  generatedAt: number;
  expiresAt: number;
}

export class DossierService {
  async getOrGenerateDossier(jid: string, forceRefresh: boolean = false): Promise<DossierResult> {
    const cleanJid = jid.includes('@') ? jid : `${jid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

    // 1. Check SQLite Cache
    if (!forceRefresh) {
      const cached = dossierRepo.getDossier(cleanJid, true);
      if (cached) {
        return {
          jid: cached.jid,
          summary: cached.summary,
          openCommitments: cached.open_commitments,
          toneProfile: cached.tone_profile,
          topics: cached.topics,
          messageCountAnalyzed: cached.message_count_analyzed,
          cached: true,
          generatedAt: cached.generated_at,
          expiresAt: cached.expires_at
        };
      }
    }

    // 2. Fetch Chat History & Living Facts
    const contact = contactRepo.getContact(cleanJid);
    const messages = messageRepo.getRecentChatHistory(cleanJid, 80);
    const facts = contactFactRepo.getActiveFacts(cleanJid);

    const contactName = contact?.name || cleanJid.split('@')[0];

    // If no messages exist in history
    if (messages.length === 0) {
      const fallback: DossierResult = {
        jid: cleanJid,
        summary: `No message history recorded with ${contactName} (+${cleanJid.split('@')[0]}).`,
        openCommitments: [],
        toneProfile: 'Unknown (No interaction recorded)',
        topics: [],
        messageCountAnalyzed: 0,
        cached: false,
        generatedAt: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
      };
      dossierRepo.saveDossier({
        jid: cleanJid,
        summary: fallback.summary,
        openCommitments: fallback.openCommitments,
        toneProfile: fallback.toneProfile,
        topics: fallback.topics,
        messageCountAnalyzed: 0
      });
      return fallback;
    }

    // If OpenAI is not configured, generate a deterministic heuristic dossier
    if (!openaiService.isConfigured()) {
      const fallback: DossierResult = {
        jid: cleanJid,
        summary: `Contact ${contactName} with ${messages.length} messages in vault. Configure OPENAI_API_KEY for AI-powered synthesis.`,
        openCommitments: [],
        toneProfile: 'Active interaction',
        topics: ['Direct Messaging'],
        messageCountAnalyzed: messages.length,
        cached: false,
        generatedAt: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
      };
      dossierRepo.saveDossier({
        jid: cleanJid,
        summary: fallback.summary,
        openCommitments: fallback.openCommitments,
        toneProfile: fallback.toneProfile,
        topics: fallback.topics,
        messageCountAnalyzed: messages.length
      });
      return fallback;
    }

    // 3. Format Transcript for LLM Synthesis
    const transcript = messages
      .filter(m => m.content && m.content.trim().length > 0)
      .map(m => {
        const sender = m.from_me ? 'Owner' : contactName;
        const time = new Date(m.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `[${time}] ${sender}: ${m.content}`;
      })
      .join('\n');

    const factsBlock = facts.length > 0
      ? `Known durable facts about ${contactName}:\n` + facts.map(f => `- [${f.category}] ${f.fact}`).join('\n')
      : '';

    const systemPrompt = `You are the Messiah Intelligence Analyst.
Analyze the following WhatsApp message history between the account Owner and ${contactName}.
Generate a structured JSON dossier summarizing this contact.

Output JSON structure:
{
  "summary": "2-3 crisp sentences detailing who this person is to the owner, the nature of their relationship, and current dynamics.",
  "open_commitments": ["List of unresolved commitments, promises, or pending action items made by either party (e.g. 'Owner promised to review doc by Friday', 'Contact will call next week'). If none, return empty array."],
  "tone_profile": "Concise 1-3 word tone descriptor with explanation (e.g. 'Warm & Professional', 'Casual & Direct', 'Guarded / Minimal').",
  "topics": ["Array of 3-5 main themes, projects, or recurring subjects discussed."]
}
`;

    const client = new OpenAI({ apiKey: env.openaiApiKey });
    const startTime = Date.now();

    try {
      const response = await client.chat.completions.create({
        model: env.openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${factsBlock ? factsBlock + '\n\n' : ''}Transcript:\n${transcript}` }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const latency = Date.now() - startTime;
      const promptTokens = response.usage?.prompt_tokens || 0;
      const completionTokens = response.usage?.completion_tokens || 0;
      const cost = calculateCost(env.openaiModel, promptTokens, completionTokens);

      llmCallRepo.logCall({
        model: env.openaiModel,
        purpose: 'contact_dossier_generation',
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costUsd: cost,
        latencyMs: latency
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');

      const summary = parsed.summary || `Intelligence dossier for ${contactName}.`;
      const openCommitments: string[] = Array.isArray(parsed.open_commitments) ? parsed.open_commitments : [];
      const toneProfile = parsed.tone_profile || 'Neutral';
      const topics: string[] = Array.isArray(parsed.topics) ? parsed.topics : [];

      // Save to SQLite 7-day cache
      dossierRepo.saveDossier({
        jid: cleanJid,
        summary,
        openCommitments,
        toneProfile,
        topics,
        messageCountAnalyzed: messages.length,
        ttlDays: 7
      });

      const cached = dossierRepo.getDossier(cleanJid, false)!;

      return {
        jid: cleanJid,
        summary,
        openCommitments,
        toneProfile,
        topics,
        messageCountAnalyzed: messages.length,
        cached: false,
        generatedAt: cached.generated_at,
        expiresAt: cached.expires_at
      };
    } catch (err: any) {
      console.error(`[DossierService] Failed to synthesize dossier: ${err.message}`);
      throw err;
    }
  }

  formatDossierForChat(dossier: DossierResult, contactName: string, phone: string): string {
    let text = `📋 *EXECUTIVE DOSSIER: ${contactName}*\n`;
    text += `📞 Phone: +${phone}\n`;
    text += `🎭 Communication Tone: *${dossier.toneProfile}*\n\n`;

    text += `📝 *Summary:*\n${dossier.summary}\n\n`;

    if (dossier.openCommitments.length > 0) {
      text += `📌 *Open Commitments & Threads:*\n`;
      dossier.openCommitments.forEach(c => {
        text += `  • ${c}\n`;
      });
      text += `\n`;
    } else {
      text += `📌 *Open Commitments:* None pending\n\n`;
    }

    if (dossier.topics.length > 0) {
      text += `🏷️ *Key Topics:* ${dossier.topics.map(t => `#${t.replace(/\s+/g, '')}`).join(' ')}\n\n`;
    }

    const generatedDate = new Date(dossier.generatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
    text += `_Analyzed ${dossier.messageCountAnalyzed} messages &middot; Generated ${generatedDate} (${dossier.cached ? 'Cached' : 'Fresh'})_`;

    return text.trim();
  }
}

export const dossierService = new DossierService();
