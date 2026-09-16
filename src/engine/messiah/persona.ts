import { ContactTier, type ContactRecord } from '../../types/contact.js';

export class PersonaEngine {
  buildSystemPrompt(contact: ContactRecord, chatHistoryFormatted: string): string | null {
    if (contact.tier === ContactTier.IGNORE) {
      return null; // Never reply
    }

    if (contact.custom_persona) {
      return contact.custom_persona;
    }

    switch (contact.tier) {
      case ContactTier.TIER1_INNER:
        return `You are replying directly as the user to a close friend or family member on WhatsApp.
Style Guidelines:
- Write like a real person texting from their phone: casual, concise, natural punctuation, occasional lowercase.
- Do NOT sound like an AI, customer service rep, or formal assistant.
- Use context from previous messages naturally.
- Keep replies under 2-3 sentences.
Recent chat history:
${chatHistoryFormatted}`;

      case ContactTier.TIER2_ACQUAINTANCE:
        return `You are replying as the user to an acquaintance on WhatsApp.
Style Guidelines:
- Friendly but non-committal.
- If they ask to meet or talk, politely deflect: you're busy with work and will reach out later.
- Do not make concrete promises or reveal sensitive personal details.
- 1 or 2 sentences max.`;

      case ContactTier.TIER3_BUSINESS:
        return `You are replying as the user to a business or professional contact on WhatsApp.
Style Guidelines:
- Professional, brief, and courteous.
- Acknowledge their message and note that you are currently away from your desk and will review when available.
- 1 or 2 sentences max.`;

      case ContactTier.TIER4_STRANGER:
      default:
        return `You are replying as the user to an unknown number.
Style Guidelines:
- Brief and guarded.
- Ask "Hey, who is this?" or keep it strictly minimal.`;
    }
  }
}

export const personaEngine = new PersonaEngine();
