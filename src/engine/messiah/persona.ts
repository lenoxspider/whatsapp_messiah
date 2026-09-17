import { ContactTier, type ContactRecord } from '../../types/contact.js';
import { contactFactRepo } from '../../db/repositories/contact_fact.repo.js';

export class PersonaEngine {
  buildSystemPrompt(
    contact: ContactRecord, 
    chatHistoryFormatted: string,
    vaultContext: string = '',
    revokedCount: number = 0,
    voiceProfile: string = ''
  ): string | null {
    if (contact.tier === ContactTier.IGNORE) {
      return null; // Never reply
    }

    if (contact.custom_persona) {
      return contact.custom_persona;
    }

    // Pull living facts from contact_facts repository
    const activeFacts = contactFactRepo.getActiveFacts(contact.jid, 10);
    let factsSection = '';
    if (activeFacts.length > 0) {
      factsSection = `\nKnown personal facts & memories about ${contact.name || 'this contact'}:\n` +
        activeFacts.map(f => `• [${f.category}] ${f.fact}`).join('\n');
    } else if (contact.facts_json) {
      try {
        const facts = JSON.parse(contact.facts_json);
        if (Array.isArray(facts) && facts.length > 0) {
          factsSection = `\nKnown facts about this person:\n` + facts.map(f => `• ${f}`).join('\n');
        }
      } catch {}
    }

    const intelSection = revokedCount > 0 
      ? `\nForensic Intel: This person recently revoked/deleted ${revokedCount} message(s) in your chat.`
      : '';

    const vaultSection = vaultContext
      ? `\nRelevant background context from your personal notes (use naturally only if directly relevant, do not recite like a robot):\n${vaultContext}`
      : '';

    const voiceSection = voiceProfile
      ? `\nOPERATOR'S PERSONAL TEXTING FINGERPRINT:\n${voiceProfile}\nFollow this exact cadence, slang, and casing rhythm strictly.`
      : '';

    const baseDirectives = `
CORE HUMAN TEXTING RULES:
- Write exactly like a real person texting from their phone: casual, concise, natural lowercase, occasional contractions.
- NEVER start with AI clichés ("Certainly!", "Sure thing!", "I hope this helps", "Hello there!").
- Keep replies to 1-3 short sentences. Match their texting energy.
${voiceSection}${factsSection}${intelSection}${vaultSection}`;

    switch (contact.tier) {
      case ContactTier.TIER1_INNER:
        return `You are replying directly as the user to a close friend or family member on WhatsApp.${baseDirectives}
Recent chat history:
${chatHistoryFormatted}`;

      case ContactTier.TIER2_ACQUAINTANCE:
        return `You are replying as the user to an acquaintance on WhatsApp.
Style Guidelines:
- Friendly, casual, but non-committal.
- If they ask to meet or call, casually deflect: busy with work or projects, will catch up later.
- Do not make firm promises or leak private details.
1-2 sentences max.${baseDirectives}`;

      case ContactTier.TIER3_BUSINESS:
        return `You are replying as the user to a business or professional contact on WhatsApp.
Style Guidelines:
- Courteous, brief, and professional.
- Acknowledge their message and mention you are away from desk and will review properly when free.
1-2 sentences max.${baseDirectives}`;

      case ContactTier.TIER4_STRANGER:
      default:
        return `You are replying as the user to an unknown number.
Style Guidelines:
- Guarded and brief.
- Ask "Hey, who is this?" or keep it strictly minimal.${baseDirectives}`;
    }
  }
}

export const personaEngine = new PersonaEngine();
