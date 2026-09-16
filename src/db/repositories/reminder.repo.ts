import { getDatabase } from '../client.js';

export interface ReminderRecord {
  id: number;
  task: string;
  trigger_at: number;
  status: 'pending' | 'completed' | 'cancelled';
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

  getDueReminders(now: number = Date.now()): ReminderRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM reminders
      WHERE status = 'pending' AND trigger_at <= ?
      ORDER BY trigger_at ASC
    `);
    return stmt.all(now) as unknown as ReminderRecord[];
  }

  getPendingReminders(): ReminderRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM reminders
      WHERE status = 'pending'
      ORDER BY trigger_at ASC
    `);
    return stmt.all() as unknown as ReminderRecord[];
  }

  markCompleted(id: number): void {
    const stmt = this.db.prepare(`UPDATE reminders SET status = 'completed' WHERE id = ?`);
    stmt.run(id);
  }
}

export const reminderRepo = new ReminderRepository();
