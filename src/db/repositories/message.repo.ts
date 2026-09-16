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
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, chat_jid, sender_jid, from_me, message_type, content, raw_payload_json, timestamp, is_revoked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    stmt.run(
      msg.id,
      msg.chatJid,
      msg.senderJid,
      msg.fromMe ? 1 : 0,
      msg.messageType,
      msg.content,
      JSON.stringify(msg.rawPayload),
      msg.timestamp
    );
  }

  markAsRevoked(id: string, revokedAt: number = Date.now()): StoredMessage | null {
    const existing = this.getMessageById(id);
    if (!existing) return null;

    const stmt = this.db.prepare(`
      UPDATE messages
      SET is_revoked = 1, revoked_at = ?
      WHERE id = ?
    `);
    stmt.run(revokedAt, id);

    return {
      ...existing,
      is_revoked: 1,
      revoked_at: revokedAt
    };
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
}

export const messageRepo = new MessageRepository();
