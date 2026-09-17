import { getDatabase } from '../client.js';
import { ContactTier, type ContactRecord } from '../../types/contact.js';

export class ContactRepository {
  private db = getDatabase();

  getContact(jid: string): ContactRecord | null {
    let row = this.db.prepare(`SELECT * FROM contacts WHERE jid = ?`).get(jid) as unknown as ContactRecord | undefined;
    if (!row && jid) {
      const clean = jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (clean) {
        const standard = `${clean}@s.whatsapp.net`;
        row = this.db.prepare(`SELECT * FROM contacts WHERE jid = ? OR phone = ?`).get(standard, clean) as unknown as ContactRecord | undefined;
      }
    }
    return row || null;
  }

  upsertContact(jid: string, phone: string, name?: string | null, tier: ContactTier = ContactTier.TIER4_STRANGER): ContactRecord {
    const existing = this.getContact(jid);
    const now = Date.now();

    if (existing) {
      // Don't overwrite an existing name with a fallback pushName if existing name was already customized
      const effectiveName = existing.name ? (name && existing.name === existing.phone ? name : existing.name) : (name ?? null);
      const updateStmt = this.db.prepare(`
        UPDATE contacts
        SET name = ?, last_interaction = ?
        WHERE jid = ?
      `);
      updateStmt.run(effectiveName, now, jid);
      return { ...existing, name: effectiveName, last_interaction: now };
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

  updateContact(jid: string, updates: { name?: string | null; phone?: string; tier?: ContactTier; custom_persona?: string | null; facts_json?: string | null; autopilot_enabled?: number }): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      values.push(updates.name);
    }
    if (updates.phone !== undefined) {
      sets.push('phone = ?');
      values.push(updates.phone);
    }
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
    if (updates.autopilot_enabled !== undefined) {
      sets.push('autopilot_enabled = ?');
      values.push(updates.autopilot_enabled);
    }

    if (sets.length === 0) return;
    values.push(jid);
    const stmt = this.db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE jid = ?`);
    stmt.run(...values);
  }

  setAutopilot(jid: string, enabled: boolean): void {
    const stmt = this.db.prepare(`UPDATE contacts SET autopilot_enabled = ? WHERE jid = ?`);
    stmt.run(enabled ? 1 : 0, jid);
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

  listContacts(limit: number = 50, tier?: number): ContactRecord[] {
    if (tier) {
      const stmt = this.db.prepare(`SELECT * FROM contacts WHERE tier = ? ORDER BY last_interaction DESC LIMIT ?`);
      return stmt.all(tier, limit) as unknown as ContactRecord[];
    }
    const stmt = this.db.prepare(`SELECT * FROM contacts ORDER BY last_interaction DESC LIMIT ?`);
    return stmt.all(limit) as unknown as ContactRecord[];
  }

  getContactCount(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM contacts`);
    const row = stmt.get() as { count: number };
    return row?.count || 0;
  }
}

export const contactRepo = new ContactRepository();
