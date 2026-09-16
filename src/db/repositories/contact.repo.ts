import { getDatabase } from '../client.js';
import { ContactTier, type ContactRecord } from '../../types/contact.js';

export class ContactRepository {
  private db = getDatabase();

  getContact(jid: string): ContactRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM contacts WHERE jid = ?`);
    const row = stmt.get(jid) as unknown as ContactRecord | undefined;
    return row || null;
  }

  upsertContact(jid: string, phone: string, name?: string | null, tier: ContactTier = ContactTier.TIER4_STRANGER): ContactRecord {
    const existing = this.getContact(jid);
    const now = Date.now();

    if (existing) {
      const updateStmt = this.db.prepare(`
        UPDATE contacts
        SET name = COALESCE(?, name), last_interaction = ?
        WHERE jid = ?
      `);
      updateStmt.run(name ?? null, now, jid);
      return { ...existing, name: name ?? existing.name, last_interaction: now };
    }

    const insertStmt = this.db.prepare(`
      INSERT INTO contacts (jid, phone, name, tier, custom_persona, facts_json, last_interaction, created_at)
      VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)
    `);
    insertStmt.run(jid, phone, name ?? null, tier, now, now);

    return {
      jid,
      phone,
      name: name ?? null,
      tier,
      custom_persona: null,
      facts_json: null,
      last_interaction: now,
      created_at: now
    };
  }

  setContactTier(jid: string, tier: ContactTier): void {
    const stmt = this.db.prepare(`UPDATE contacts SET tier = ? WHERE jid = ?`);
    stmt.run(tier, jid);
  }

  setCustomPersona(jid: string, persona: string | null): void {
    const stmt = this.db.prepare(`UPDATE contacts SET custom_persona = ? WHERE jid = ?`);
    stmt.run(persona, jid);
  }

  addFact(jid: string, fact: string): void {
    const contact = this.getContact(jid);
    if (!contact) return;

    let facts: string[] = [];
    try {
      if (contact.facts_json) facts = JSON.parse(contact.facts_json);
    } catch {
      facts = [];
    }

    facts.push(fact);
    const stmt = this.db.prepare(`UPDATE contacts SET facts_json = ? WHERE jid = ?`);
    stmt.run(JSON.stringify(facts), jid);
  }
}

export const contactRepo = new ContactRepository();
