import { getDatabase } from '../client.js';

export interface ContactFactRecord {
  id: number;
  jid: string;
  fact: string;
  category: string;
  confidence: number;
  source_msg_id: string | null;
  created_at: number;
  superseded_by: number | null;
}

export class ContactFactRepository {
  private db = getDatabase();

  addFact(
    jid: string,
    fact: string,
    category: string = 'general',
    confidence: number = 1.0,
    sourceMsgId?: string | null
  ): ContactFactRecord {
    const now = Date.now();
    const cleanFact = fact.trim();

    // Deduplicate: check if active fact already exists with similar content
    const existing = this.db.prepare(`
      SELECT id FROM contact_facts
      WHERE jid = ? AND superseded_by IS NULL AND LOWER(fact) = LOWER(?)
    `).get(jid, cleanFact) as { id: number } | undefined;

    if (existing) {
      return this.getFactById(existing.id)!;
    }

    const stmt = this.db.prepare(`
      INSERT INTO contact_facts (jid, fact, category, confidence, source_msg_id, created_at, superseded_by)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `);

    const info = stmt.run(jid, cleanFact, category, confidence, sourceMsgId || null, now);
    return {
      id: Number(info.lastInsertRowid),
      jid,
      fact: cleanFact,
      category,
      confidence,
      source_msg_id: sourceMsgId || null,
      created_at: now,
      superseded_by: null
    };
  }

  getActiveFacts(jid: string, limit: number = 20): ContactFactRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM contact_facts
      WHERE jid = ? AND superseded_by IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(jid, limit) as unknown as ContactFactRecord[];
  }

  getAllFactsForContact(jid: string): ContactFactRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM contact_facts
      WHERE jid = ?
      ORDER BY created_at DESC
    `);
    return stmt.all(jid) as unknown as ContactFactRecord[];
  }

  supersedeFact(oldId: number, newId: number): void {
    const stmt = this.db.prepare(`UPDATE contact_facts SET superseded_by = ? WHERE id = ?`);
    stmt.run(newId, oldId);
  }

  getFactById(id: number): ContactFactRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM contact_facts WHERE id = ?`);
    const row = stmt.get(id) as unknown as ContactFactRecord | undefined;
    return row || null;
  }

  deleteFact(id: number): void {
    const stmt = this.db.prepare(`DELETE FROM contact_facts WHERE id = ?`);
    stmt.run(id);
  }
}

export const contactFactRepo = new ContactFactRepository();
