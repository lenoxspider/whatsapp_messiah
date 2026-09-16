import { Router } from 'express';
import { dashboardState } from '../state.js';
import { getDatabase } from '../../db/client.js';

export const statusRouter = Router();

statusRouter.get('/', (req, res) => {
  const state = dashboardState.getState();

  let messageCount = 0;
  let notesCount = 0;
  let remindersCount = 0;

  try {
    const db = getDatabase();
    const msgRow = db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    const noteRow = db.prepare('SELECT COUNT(*) as count FROM notes').get() as { count: number };
    const remRow = db.prepare('SELECT COUNT(*) as count FROM reminders WHERE status = "pending"').get() as { count: number };

    messageCount = msgRow?.count || 0;
    notesCount = noteRow?.count || 0;
    remindersCount = remRow?.count || 0;
  } catch {
    // Database may not have tables yet if not launched
  }

  res.json({
    ...state,
    uptimeSeconds: Math.floor(process.uptime()),
    stats: {
      messagesLogged: messageCount,
      notesSaved: notesCount,
      pendingReminders: remindersCount
    }
  });
});
