import { getDatabase } from '../client.js';
import type { StoredMessage } from '../../types/message.js';

export class MessageRepository {
  private db = getDatabase();

  saveMessage(msg: {
    id: string;
    chatJid: string;
    senderJid: string;
    fromMe: boolean;
    messageType: string;
    content: string | null;
    rawPayload: any;
    timestamp: number;
    mediaPath?: string | null;
    mediaMimetype?: string | null;
    isViewOnce?: boolean;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, chat_jid, sender_jid, from_me, message_type, content, raw_payload_json, timestamp, is_revoked, media_path, media_mimetype, is_view_once
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);

    stmt.run(
      msg.id,
      msg.chatJid,
      msg.senderJid,
      msg.fromMe ? 1 : 0,
      msg.messageType,
      msg.content,
      JSON.stringify(msg.rawPayload),
      msg.timestamp,
      msg.mediaPath || null,
      msg.mediaMimetype || null,
      msg.isViewOnce ? 1 : 0
    );
  }

  updateMedia(id: string, mediaPath: string, mediaMimetype: string, isViewOnce: boolean = false): void {
    const stmt = this.db.prepare(`
      UPDATE messages
      SET media_path = ?, media_mimetype = ?, is_view_once = ?
      WHERE id = ?
    `);
    stmt.run(mediaPath, mediaMimetype, isViewOnce ? 1 : 0, id);
  }

  markAsRevoked(id: string, revokedAt: number = Date.now()): StoredMessage | null {
    const stmt = this.db.prepare(`
      UPDATE messages
      SET is_revoked = 1, revoked_at = ?
      WHERE id = ?
    `);
    stmt.run(revokedAt, id);

    return this.getMessageById(id);
  }

  updateContent(id: string, content: string): void {
    const stmt = this.db.prepare(`
      UPDATE messages
      SET content = ?
      WHERE id = ?
    `);
    stmt.run(content, id);
  }

  searchRevoked(query?: string, limit: number = 5): any[] {
    if (query && query.trim()) {
      const q = `%${query.trim()}%`;
      const stmt = this.db.prepare(`
        SELECT m.id, m.chat_jid, m.sender_jid, m.content, m.timestamp, m.is_view_once, m.media_path,
               c.name as contact_name, c.tier as contact_tier
        FROM messages m
        LEFT JOIN contacts c ON m.sender_jid = c.jid
        WHERE (m.is_revoked = 1 OR m.is_view_once = 1)
          AND (m.content LIKE ? OR c.name LIKE ? OR m.sender_jid LIKE ?)
        ORDER BY m.timestamp DESC
        LIMIT ?
      `);
      return stmt.all(q, q, q, limit);
    }

    const stmt = this.db.prepare(`
      SELECT m.id, m.chat_jid, m.sender_jid, m.content, m.timestamp, m.is_view_once, m.media_path,
             c.name as contact_name, c.tier as contact_tier
      FROM messages m
      LEFT JOIN contacts c ON m.sender_jid = c.jid
      WHERE m.is_revoked = 1 OR m.is_view_once = 1
      ORDER BY m.timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  getMessageById(id: string): StoredMessage | null {
    const stmt = this.db.prepare(`SELECT * FROM messages WHERE id = ?`);
    const row = stmt.get(id) as unknown as StoredMessage | undefined;
    return row || null;
  }

  getRecentChatHistory(chatJid: string, limit: number = 20): StoredMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE chat_jid = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(chatJid, limit) as unknown as StoredMessage[];
    return rows.reverse();
  }

  saveCall(call: {
    id: string;
    callerJid: string;
    isVideo: boolean;
    timestamp: number;
    actionTaken?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO calls (id, caller_jid, is_video, timestamp, action_taken)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      call.id,
      call.callerJid,
      call.isVideo ? 1 : 0,
      call.timestamp,
      call.actionTaken || 'rejected'
    );
  }

  getRecentCalls(limit: number = 50): any[] {
    const stmt = this.db.prepare(`
      SELECT c.*, ct.name as caller_name, ct.tier as caller_tier
      FROM calls c
      LEFT JOIN contacts ct ON c.caller_jid = ct.jid
      ORDER BY c.timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
}

export const messageRepo = new MessageRepository();
