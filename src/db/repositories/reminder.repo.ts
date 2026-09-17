import { getDatabase } from '../client.js';

export interface ReminderRecord {
  id: number;
  task: string;
  trigger_at: number;
  status: 'pending' | 'claimed' | 'sent' | 'failed' | 'completed' | 'cancelled';
  claimed_at?: number | null;
  sent_at?: number | null;
  recurrence: string | null;
  created_at: number;
}

export class ReminderRepository {
  private db = getDatabase();

  createReminder(task: string, triggerAt: number, recurrence?: string | null): ReminderRecord {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO reminders (task, trigger_at, status, recurrence, created_at)
      VALUES (?, ?, 'pending', ?, ?)
    `);
    const info = stmt.run(task, triggerAt, recurrence ?? null, now);
    return {
      id: Number(info.lastInsertRowid),
      task,
      trigger_at: triggerAt,
      status: 'pending',
      recurrence: recurrence ?? null,
      created_at: now
    };
  }

  // Atomically claims due reminders to prevent race conditions or duplicate sends
  claimDueReminders(now: number = Date.now()): ReminderRecord[] {
    const findStmt = this.db.prepare(`
      SELECT id FROM reminders
      WHERE status = 'pending' AND trigger_at <= ?
      ORDER BY trigger_at ASC
    `);
    const rows = findStmt.all(now) as Array<{ id: number }>;

    const claimed: ReminderRecord[] = [];
    const claimStmt = this.db.prepare(`
      UPDATE reminders
      SET status = 'claimed', claimed_at = ?
      WHERE id = ? AND status = 'pending'
    `);
    const fetchStmt = this.db.prepare(`SELECT * FROM reminders WHERE id = ?`);

    for (const r of rows) {
      const res = claimStmt.run(now, r.id);
      if (res.changes > 0) {
        const item = fetchStmt.get(r.id) as unknown as ReminderRecord;
        if (item) claimed.push(item);
      }
    }
    return claimed;
  }

  // On process startup: requeue any 'claimed' row older than 3 minutes (handles daemon crash mid-send)
  requeueStaleClaims(staleThresholdMs: number = 3 * 60 * 1000): number {
    const now = Date.now();
    const cutoff = now - staleThresholdMs;
    const stmt = this.db.prepare(`
      UPDATE reminders
      SET status = 'pending', claimed_at = NULL
      WHERE status = 'claimed' AND (claimed_at IS NULL OR claimed_at < ?)
    `);
    const result = stmt.run(cutoff);
    if (result.changes > 0) {
      console.log(`[ReminderRepo] 🔄 Re-queued ${result.changes} stale claimed reminder(s) from previous daemon crash.`);
    }
    return Number(result.changes);
  }

  markSent(id: number): void {
    const now = Date.now();
    const stmt = this.db.prepare(`UPDATE reminders SET status = 'sent', sent_at = ? WHERE id = ?`);
    stmt.run(now, id);
  }

  markFailed(id: number): void {
    const stmt = this.db.prepare(`UPDATE reminders SET status = 'failed' WHERE id = ?`);
    stmt.run(id);
  }

  getPendingReminders(): ReminderRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM reminders
      WHERE status IN ('pending', 'claimed')
      ORDER BY trigger_at ASC
    `);
    return (stmt.all() as unknown) as ReminderRecord[];
  }

  markCompleted(id: number): void {
    const stmt = this.db.prepare(`UPDATE reminders SET status = 'completed' WHERE id = ?`);
    stmt.run(id);
  }
}

export const reminderRepo = new ReminderRepository();
