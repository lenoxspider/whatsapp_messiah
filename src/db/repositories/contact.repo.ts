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

  updateContact(jid: string, updates: { tier?: ContactTier; custom_persona?: string | null; facts_json?: string | null }): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.tier !== undefined) {
      sets.push('tier = ?');
      values.push(updates.tier);
    }
    if (updates.custom_persona !== undefined) {
      sets.push('custom_persona = ?');
      values.push(updates.custom_persona);
    }
    if (updates.facts_json !== undefined) {
      sets.push('facts_json = ?');
      values.push(updates.facts_json);
    }

    if (sets.length === 0) return;
    values.push(jid);
    const stmt = this.db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE jid = ?`);
    stmt.run(...values);
  }

  searchContact(query: string): ContactRecord | null {
    const cleanPhone = query.replace(/[^0-9]/g, '');
    const cleanText = query.trim();
    const stmt = this.db.prepare(`
      SELECT * FROM contacts 
      WHERE jid LIKE ? OR phone LIKE ? OR name LIKE ?
      LIMIT 1
    `);
    const row = stmt.get(`%${cleanText}%`, `%${cleanPhone || cleanText}%`, `%${cleanText}%`) as unknown as ContactRecord | undefined;
    return row || null;
  }

  getRecentContacts(limit: number = 10): ContactRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM contacts 
      ORDER BY last_interaction DESC 
      LIMIT ?
    `);
    return stmt.all(limit) as unknown as ContactRecord[];
  }
}

export const contactRepo = new ContactRepository();
