import { ContactTier } from '../types/contact.js';

export const SYSTEM_CONSTANTS = {
  DEFAULT_TYPING_SPEED_MS: 45,
  DEFAULT_MAX_TYPING_DELAY_MS: 8000,
  DEFAULT_MIN_TYPING_DELAY_MS: 1500,
  
  DEFAULT_OPENAI_MODEL: 'gpt-4o',
  
  // Contacts in these tiers trigger presence/read receipts according to rules
  DEFAULT_CONTACT_TIER: ContactTier.TIER4_STRANGER,
  
  // Emergency keywords that trigger immediate Discord escalation
  EMERGENCY_KEYWORDS: [
    'emergency',
    'hospital',
    'urgent',
    'accident',
    'police',
    'wire money',
    'call me now',
    'asap'
  ],

  // Second brain command prefix
  COMMAND_PREFIX: '!'
};
