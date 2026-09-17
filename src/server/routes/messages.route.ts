import { Router } from 'express';
import { getDatabase } from '../../db/client.js';
import { systemLogger } from '../logger.js';

export const messagesRouter = Router();

messagesRouter.get('/live', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const db = getDatabase();

  try {
    const rows = db.prepare(`
      SELECT 
        m.id, 
        m.chat_jid, 
        m.sender_jid, 
        m.from_me, 
        m.message_type, 
        m.content, 
        m.timestamp, 
        m.is_revoked,
        c.name as contact_name,
        c.tier as contact_tier
      FROM messages m
      LEFT JOIN contacts c ON (m.sender_jid = c.jid OR m.chat_jid = c.jid)
      ORDER BY m.timestamp DESC
      LIMIT ?
    `).all(limit);

    res.json({ messages: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

messagesRouter.get('/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  res.json({ logs: systemLogger.getRecentLogs(limit) });
});

messagesRouter.get('/revoked-intel', (req, res) => {
  const db = getDatabase();
  try {
    const totalRow = db.prepare('SELECT COUNT(*) as total FROM messages WHERE is_revoked = 1').get() as { total: number };
    const topDeleters = db.prepare(`
      SELECT 
        m.sender_jid,
        COUNT(*) as revoke_count,
        COALESCE(c.name, m.sender_jid) as label,
        c.tier as contact_tier
      FROM messages m
      LEFT JOIN contacts c ON m.sender_jid = c.jid
      WHERE m.is_revoked = 1
      GROUP BY m.sender_jid
      ORDER BY revoke_count DESC
      LIMIT 5
    `).all();

    const revokedMessages = db.prepare(`
      SELECT 
        m.id, 
        m.chat_jid, 
        m.sender_jid, 
        m.from_me, 
        m.content, 
        m.timestamp, 
        c.name as contact_name,
        c.tier as contact_tier
      FROM messages m
      LEFT JOIN contacts c ON m.sender_jid = c.jid
      WHERE m.is_revoked = 1
      ORDER BY m.timestamp DESC
      LIMIT 100
    `).all();

    res.json({
      totalRevoked: totalRow?.total || 0,
      topDeleters,
      messages: revokedMessages
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
