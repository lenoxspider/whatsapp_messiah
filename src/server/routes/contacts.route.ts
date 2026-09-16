import { Router } from 'express';
import { contactRepo } from '../../db/repositories/contact.repo.js';
import { getDatabase } from '../../db/client.js';

export const contactsRouter = Router();

contactsRouter.get('/', (req, res) => {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM contacts
    ORDER BY last_interaction DESC
    LIMIT 100
  `).all();

  res.json({ contacts: rows });
});

contactsRouter.put('/:jid/tier', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const tier = Number(req.body.tier);

  if (!tier || tier < 1 || tier > 5) {
    return res.status(400).json({ error: 'Tier must be between 1 and 5.' });
  }

  contactRepo.setContactTier(jid, tier);
  res.json({ success: true, jid, tier });
});

contactsRouter.put('/:jid/persona', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const { persona } = req.body;

  contactRepo.setCustomPersona(jid, persona ? String(persona).trim() : null);
  res.json({ success: true, jid });
});

contactsRouter.get('/revoked', (req, res) => {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT m.*, c.name as contact_name
    FROM messages m
    LEFT JOIN contacts c ON m.sender_jid = c.jid
    WHERE m.is_revoked = 1
    ORDER BY m.revoked_at DESC
    LIMIT 50
  `).all();

  res.json({ revokedMessages: rows });
});
