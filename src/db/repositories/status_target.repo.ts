import { getDatabase } from '../client.js';

export interface StatusTarget {
  phone: string;
  name: string | null;
  added_at: number;
}

export class StatusTargetRepository {
  addTarget(phone: string, name?: string | null): void {
    const clean = phone.replace(/[^0-9]/g, '');
    if (!clean) return;

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO status_targets (phone, name, added_at)
      VALUES (?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        name = COALESCE(excluded.name, status_targets.name)
    `);
    stmt.run(clean, name || null, Date.now());
  }

  removeTarget(phone: string): boolean {
    const clean = phone.replace(/[^0-9]/g, '');
    if (!clean) return false;

    const db = getDatabase();
    const result = db.prepare(`DELETE FROM status_targets WHERE phone = ?`).run(clean);
    return result.changes > 0;
  }

  isTarget(phone: string): boolean {
    const clean = phone.replace(/[^0-9]/g, '');
    if (!clean) return false;

    const db = getDatabase();
    const row = db.prepare(`SELECT phone FROM status_targets WHERE phone = ?`).get(clean);
    return Boolean(row);
  }

  getAllTargets(): StatusTarget[] {
    const db = getDatabase();
    return (db.prepare(`SELECT phone, name, added_at FROM status_targets ORDER BY added_at DESC`).all() as unknown) as StatusTarget[];
  }
}

export const statusTargetRepo = new StatusTargetRepository();
