import { getDatabase } from '../client.js';

export interface ContactDossierRecord {
  jid: string;
  summary: string;
  open_commitments: string[];
  tone_profile: string;
  topics: string[];
  message_count_analyzed: number;
  generated_at: number;
  expires_at: number;
}

export class DossierRepo {
  saveDossier(data: {
    jid: string;
    summary: string;
    openCommitments: string[];
    toneProfile: string;
    topics: string[];
    messageCountAnalyzed: number;
    ttlDays?: number;
  }): void {
    const db = getDatabase();
    const now = Date.now();
    const ttlDays = data.ttlDays ?? 7;
    const expiresAt = now + (ttlDays * 24 * 60 * 60 * 1000);

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO contact_dossiers (
        jid, summary, open_commitments_json, tone_profile, topics_json,
        message_count_analyzed, generated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.jid,
      data.summary,
      JSON.stringify(data.openCommitments || []),
      data.toneProfile || 'Neutral',
      JSON.stringify(data.topics || []),
      data.messageCountAnalyzed,
      now,
      expiresAt
    );
  }

  getDossier(jid: string, checkExpiration: boolean = true): ContactDossierRecord | null {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT * FROM contact_dossiers WHERE jid = ?`);
    const row = stmt.get(jid) as any;

    if (!row) return null;

    if (checkExpiration && row.expires_at < Date.now()) {
      return null; // Expired cache
    }

    return {
      jid: row.jid,
      summary: row.summary,
      open_commitments: JSON.parse(row.open_commitments_json || '[]'),
      tone_profile: row.tone_profile,
      topics: JSON.parse(row.topics_json || '[]'),
      message_count_analyzed: row.message_count_analyzed,
      generated_at: row.generated_at,
      expires_at: row.expires_at
    };
  }

  deleteDossier(jid: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare(`DELETE FROM contact_dossiers WHERE jid = ?`);
    const info = stmt.run(jid);
    return info.changes > 0;
  }
}

export const dossierRepo = new DossierRepo();
