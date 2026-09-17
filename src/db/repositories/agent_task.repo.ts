import { getDatabase } from '../client.js';

export interface AgentTask {
  id: number;
  contact_jid: string;
  goal: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  scheduled_at: number;
  recurrence?: string | null;
  summary?: string | null;
  last_action_at?: number | null;
  created_at: number;
}

export class AgentTaskRepository {
  createTask(
    contactJid: string,
    goal: string,
    scheduledAt: number = Date.now(),
    recurrence: string | null = null
  ): AgentTask {
    const db = getDatabase();
    const now = Date.now();
    const result = db.prepare(`
      INSERT INTO agent_tasks (contact_jid, goal, status, scheduled_at, recurrence, created_at)
      VALUES (?, ?, 'pending', ?, ?, ?)
    `).run(contactJid, goal, scheduledAt, recurrence, now);

    return this.getTaskById(Number(result.lastInsertRowid))!;
  }

  getTaskById(id: number): AgentTask | null {
    const db = getDatabase();
    return (db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get(id) as unknown as AgentTask) || null;
  }

  getActiveTaskForContact(contactJid: string): AgentTask | null {
    const db = getDatabase();
    return (db.prepare(`
      SELECT * FROM agent_tasks
      WHERE contact_jid = ? AND status IN ('pending', 'in_progress')
      ORDER BY scheduled_at ASC LIMIT 1
    `).get(contactJid) as unknown as AgentTask) || null;
  }

  getDueTasks(now: number = Date.now()): AgentTask[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM agent_tasks
      WHERE status = 'pending' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
    `).all(now) as unknown as AgentTask[];
  }

  updateTaskStatus(
    id: number,
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled',
    summary?: string | null
  ): void {
    const db = getDatabase();
    const now = Date.now();
    if (summary !== undefined) {
      db.prepare(`
        UPDATE agent_tasks
        SET status = ?, summary = ?, last_action_at = ?
        WHERE id = ?
      `).run(status, summary, now, id);
    } else {
      db.prepare(`
        UPDATE agent_tasks
        SET status = ?, last_action_at = ?
        WHERE id = ?
      `).run(status, now, id);
    }
  }

  listTasks(statusFilter?: string, limit: number = 50): Array<AgentTask & { contact_name?: string | null; contact_phone?: string }> {
    const db = getDatabase();
    let query = `
      SELECT t.*, c.name as contact_name, c.phone as contact_phone
      FROM agent_tasks t
      LEFT JOIN contacts c ON t.contact_jid = c.jid
    `;
    const params: any[] = [];

    if (statusFilter && statusFilter !== 'all') {
      query += ` WHERE t.status = ?`;
      params.push(statusFilter);
    }

    query += ` ORDER BY t.created_at DESC LIMIT ?`;
    params.push(limit);

    return db.prepare(query).all(...params) as any[];
  }

  deleteTask(id: number): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM agent_tasks WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

export const agentTaskRepo = new AgentTaskRepository();
