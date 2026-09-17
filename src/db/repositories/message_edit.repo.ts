import { getDatabase } from '../client.js';

export interface MessageEditRecord {
  id: number;
  message_id: string;
  chat_jid: string;
  sender_jid: string;
  original_content: string | null;
  edited_content: string | null;
  timestamp: number;
}

export class MessageEditRepo {
  recordEdit(data: {
    messageId: string;
    chatJid: string;
    senderJid: string;
    originalContent?: string | null;
    editedContent?: string | null;
    timestamp: number;
  }): number {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO message_edits (
        message_id, chat_jid, sender_jid, original_content, edited_content, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.messageId,
      data.chatJid,
      data.senderJid,
      data.originalContent || null,
      data.editedContent || null,
      data.timestamp
    );

    return Number(info.lastInsertRowid);
  }

  getEditsForMessage(messageId: string): MessageEditRecord[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM message_edits
      WHERE message_id = ?
      ORDER BY timestamp ASC
    `).all(messageId);

    return rows as unknown as MessageEditRecord[];
  }

  getRecentEdits(limit: number = 20): MessageEditRecord[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM message_edits
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);

    return rows as unknown as MessageEditRecord[];
  }
}

export const messageEditRepo = new MessageEditRepo();
