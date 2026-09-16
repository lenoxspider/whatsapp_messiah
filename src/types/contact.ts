export enum ContactTier {
  TIER1_INNER = 1,      // Inner circle (family, closest friends) - auto-replies as you or alerts
  TIER2_ACQUAINTANCE = 2,// Casual friends / acquaintances - deflecting / brief replies
  TIER3_BUSINESS = 3,   // Professional / work - hold messages / escalations
  TIER4_STRANGER = 4,   // Unknown numbers - ignored or single generic deflection
  IGNORE = 5            // Selective deafness - permanently unread, 0 blue ticks
}

export interface ContactRecord {
  jid: string;
  phone: string;
  name: string | null;
  tier: ContactTier;
  custom_persona: string | null;
  facts_json: string | null; // Key-value or list of known facts
  last_interaction: number | null;
  created_at: number;
}
