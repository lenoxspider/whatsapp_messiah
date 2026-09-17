import { getDatabase } from '../client.js';

export interface CapturedStatus {
  id: number;
  status_id: string | null;
  contact_jid: string;
  contact_phone: string;
  contact_name: string | null;
  content: string | null;
  media_path: string | null;
  media_type: string | null;
  mime_type: string | null;
  timestamp: number;
  discord_sent: number;
}

export class StatusStealRepo {
  recordSteal(data: {
    statusId?: string | null;
    contactJid: string;
    contactPhone: string;
    contactName?: string | null;
    content?: string | null;
    mediaPath?: string | null;
    mediaType?: string | null;
    mimeType?: string | null;
    timestamp: number;
    discordSent?: boolean;
  }): number {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO captured_statuses (
        status_id, contact_jid, contact_phone, contact_name, content,
        media_path, media_type, mime_type, timestamp, discord_sent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.statusId || null,
      data.contactJid,
      data.contactPhone,
      data.contactName || null,
      data.content || null,
      data.mediaPath || null,
      data.mediaType || null,
      data.mimeType || null,
      data.timestamp,
      data.discordSent !== false ? 1 : 0
    );

    return Number(info.lastInsertRowid);
  }

  getCapturedStatuses(limit: number = 50, offset: number = 0): CapturedStatus[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM captured_statuses
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    return rows as unknown as CapturedStatus[];
  }

  countCapturedStatuses(): number {
    const db = getDatabase();
    const row = db.prepare(`SELECT COUNT(*) as count FROM captured_statuses`).get() as { count: number };
    return row?.count || 0;
  }

  deleteCapturedStatus(id: number): boolean {
    const db = getDatabase();
    const info = db.prepare(`DELETE FROM captured_statuses WHERE id = ?`).run(id);
    return info.changes > 0;
  }
}

export const statusStealRepo = new StatusStealRepo();
