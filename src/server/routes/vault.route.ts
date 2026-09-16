import { Router } from 'express';
import { noteRepo } from '../../db/repositories/note.repo.js';
import { reminderRepo } from '../../db/repositories/reminder.repo.js';
import { getDatabase } from '../../db/client.js';

export const vaultRouter = Router();

vaultRouter.get('/notes', (req, res) => {
  const query = req.query.q as string | undefined;

  if (query && query.trim()) {
    const results = noteRepo.searchNotes(query.trim(), 50);
    return res.json({ notes: results });
  }

  const recent = noteRepo.getRecentNotes(50);
  res.json({ notes: recent });
});

vaultRouter.post('/notes', (req, res) => {
  const { content, tag, url } = req.body;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required.' });
  }

  const saved = noteRepo.saveNote(content.trim(), tag || 'inbox', url || null);
  res.json({ success: true, note: saved });
});

vaultRouter.get('/reminders', (req, res) => {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM reminders
    ORDER BY trigger_at DESC
    LIMIT 50
  `).all();

  res.json({ reminders: rows });
});

vaultRouter.post('/reminders/:id/complete', (req, res) => {
  const id = Number(req.params.id);
  reminderRepo.markCompleted(id);
  res.json({ success: true, id });
});

vaultRouter.delete('/reminders/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDatabase();
  db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
  res.json({ success: true, id });
});
