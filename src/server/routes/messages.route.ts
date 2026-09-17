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
        m.media_path,
        m.media_mimetype,
        m.is_view_once,
        c.name as contact_name,
        c.tier as contact_tier
      FROM messages m
      LEFT JOIN contacts c ON m.sender_jid = c.jid
      WHERE m.is_revoked = 1 OR m.is_view_once = 1
      ORDER BY m.timestamp DESC
      LIMIT 100
    `).all();

    // Map media_path to web-accessible filename
    const sanitized = revokedMessages.map((row: any) => ({
      ...row,
      media_file: row.media_path ? row.media_path.split(/[\\/]/).pop() : null
    }));

    res.json({
      totalRevoked: totalRow?.total || 0,
      topDeleters,
      messages: sanitized
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

messagesRouter.get('/calls', (req, res) => {
  const db = getDatabase();
  try {
    const calls = db.prepare(`
      SELECT c.*, ct.name as caller_name, ct.tier as caller_tier
      FROM calls c
      LEFT JOIN contacts ct ON c.caller_jid = ct.jid
      ORDER BY c.timestamp DESC
      LIMIT 50
    `).all();

    res.json({ calls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

