import { Router } from 'express';
import { contactRepo } from '../../db/repositories/contact.repo.js';
import { contactFactRepo } from '../../db/repositories/contact_fact.repo.js';
import { messageRepo } from '../../db/repositories/message.repo.js';
import { getDatabase } from '../../db/client.js';
import { dossierService } from '../../services/dossier.service.js';
import { resurrectionService } from '../../services/resurrection.service.js';

export const contactsRouter = Router();

contactsRouter.get('/', (req, res) => {
  const db = getDatabase();
  const search = req.query.q ? String(req.query.q).trim() : '';
  const tier = req.query.tier ? Number(req.query.tier) : null;

  let query = `
    SELECT c.*, 
      (SELECT COUNT(*) FROM contact_facts WHERE jid = c.jid AND superseded_by IS NULL) as facts_count,
      (SELECT COUNT(*) FROM messages WHERE sender_jid = c.jid AND is_revoked = 1) as revoked_count
    FROM contacts c
    WHERE 1=1
  `;
  const params: any[] = [];

  if (tier) {
    query += ` AND c.tier = ?`;
    params.push(tier);
  }

  if (search) {
    query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.jid LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  query += ` ORDER BY c.last_interaction DESC LIMIT 200`;

  const rows = db.prepare(query).all(...params);
  res.json({ contacts: rows });
});

contactsRouter.get('/:jid/details', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const contact = contactRepo.getContact(jid);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const db = getDatabase();
  const facts = contactFactRepo.getAllFactsForContact(jid);
  const recentMessages = messageRepo.getRecentChatHistory(jid, 25);
  const calls = db.prepare('SELECT * FROM calls WHERE caller_jid = ? ORDER BY timestamp DESC LIMIT 10').all(jid);
  const statsRow = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM messages WHERE chat_jid = ? OR sender_jid = ?) as total_messages,
      (SELECT COUNT(*) FROM messages WHERE sender_jid = ? AND is_revoked = 1) as revoked_count,
      (SELECT COUNT(*) FROM calls WHERE caller_jid = ?) as total_calls
  `).get(jid, jid, jid, jid) as any;

  res.json({
    contact,
    facts,
    recentMessages,
    calls,
    stats: {
      totalMessages: statsRow?.total_messages || 0,
      revokedCount: statsRow?.revoked_count || 0,
      totalCalls: statsRow?.total_calls || 0
    }
  });
});

contactsRouter.post('/:jid/facts', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const { fact, category } = req.body;
  if (!fact || !String(fact).trim()) {
    return res.status(400).json({ error: 'Fact content is required' });
  }

  const created = contactFactRepo.addFact(jid, String(fact).trim(), category ? String(category).trim() : 'general');
  res.json({ success: true, fact: created });
});

contactsRouter.delete('/facts/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Valid fact ID required' });
  }

  contactFactRepo.deleteFact(id);
  res.json({ success: true, id });
});

contactsRouter.put('/:jid', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const { name, phone, tier, custom_persona, facts_json } = req.body;

  const updates: { name?: string | null; phone?: string; tier?: number; custom_persona?: string | null; facts_json?: string | null } = {};

  if (name !== undefined) {
    updates.name = name ? String(name).trim() : null;
  }

  if (phone !== undefined) {
    updates.phone = String(phone).replace(/[^0-9]/g, '');
  }

  if (tier !== undefined) {
    const numTier = Number(tier);
    if (!numTier || numTier < 1 || numTier > 5) {
      return res.status(400).json({ error: 'Tier must be between 1 and 5.' });
    }
    updates.tier = numTier;
  }

  if (custom_persona !== undefined) {
    updates.custom_persona = custom_persona ? String(custom_persona).trim() : null;
  }

  if (facts_json !== undefined) {
    updates.facts_json = facts_json ? String(facts_json).trim() : null;
  }

  contactRepo.updateContact(jid, updates);
  res.json({ success: true, jid, ...updates });
});

contactsRouter.put('/:jid/tier', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const tier = Number(req.body.tier);

  if (!tier || tier < 1 || tier > 5) {
    return res.status(400).json({ error: 'Tier must be between 1 and 5.' });
  }

  contactRepo.updateContact(jid, { tier });
  res.json({ success: true, jid, tier });
});

contactsRouter.put('/:jid/persona', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const { persona } = req.body;

  contactRepo.setCustomPersona(jid, persona ? String(persona).trim() : null);
  res.json({ success: true, jid });
});

contactsRouter.post('/:jid/autopilot', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const { enabled } = req.body;

  contactRepo.setAutopilot(jid, Boolean(enabled));
  res.json({ success: true, jid, autopilot_enabled: enabled ? 1 : 0 });
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

contactsRouter.get('/dormant', (req, res) => {
  const minDays = Math.max(Number(req.query.days) || 14, 1);
  const maxTier = Number(req.query.tier) || 2;
  const dormantContacts = resurrectionService.findDormantThreads(minDays, maxTier);
  res.json({ dormantContacts, minDays, maxTier });
});

contactsRouter.get('/:jid/dossier', async (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  try {
    const dossier = await dossierService.getOrGenerateDossier(jid, false);
    res.json({ success: true, dossier });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

contactsRouter.post('/:jid/dossier/refresh', async (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  try {
    const dossier = await dossierService.getOrGenerateDossier(jid, true);
    res.json({ success: true, dossier });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

contactsRouter.post('/import', (req, res) => {
  const { vcf, contacts } = req.body;
  let importedCount = 0;

  if (Array.isArray(contacts)) {
    for (const c of contacts) {
      if (c.phone) {
        const cleanPhone = String(c.phone).replace(/[^0-9]/g, '');
        if (cleanPhone.length >= 7) {
          const jid = `${cleanPhone}@s.whatsapp.net`;
          contactRepo.upsertContact(jid, cleanPhone, c.name ? String(c.name).trim() : null, c.tier || 3);
          importedCount++;
        }
      }
    }
  }

  if (typeof vcf === 'string' && vcf.trim()) {
    // Parse vCard standard format (VCF from Google Contacts, Apple Contacts, or phone export)
    const cards = vcf.split(/BEGIN:VCARD/i);
    for (const card of cards) {
      if (!card.includes('END:VCARD')) continue;

      let name = '';
      const fnMatch = card.match(/^FN.*?:([^\r\n]+)/im);
      if (fnMatch) {
        name = fnMatch[1].trim();
      } else {
        const nMatch = card.match(/^N.*?:([^\r\n]+)/im);
        if (nMatch) {
          name = nMatch[1].split(';').filter(Boolean).reverse().join(' ').trim();
        }
      }

      // Find all telephone numbers
      const telMatches = card.matchAll(/^TEL.*?:([^\r\n]+)/gim);
      for (const telMatch of telMatches) {
        const rawPhone = telMatch[1];
        const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
        if (cleanPhone.length >= 7) {
          const jid = `${cleanPhone}@s.whatsapp.net`;
          contactRepo.upsertContact(jid, cleanPhone, name || null, 3);
          importedCount++;
        }
      }
    }
  }

  res.json({ success: true, imported: importedCount });
});

