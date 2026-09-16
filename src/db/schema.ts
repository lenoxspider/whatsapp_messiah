import { getDatabase } from './client.js';

export function initializeDatabaseSchema(): void {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      sender_jid TEXT NOT NULL,
      from_me INTEGER NOT NULL DEFAULT 0,
      message_type TEXT NOT NULL,
      content TEXT,
      raw_payload_json TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      is_revoked INTEGER NOT NULL DEFAULT 0,
      revoked_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_jid ON messages(chat_jid);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS contacts (
      jid TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      name TEXT,
      tier INTEGER NOT NULL DEFAULT 4,
      custom_persona TEXT,
      facts_json TEXT,
      last_interaction INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT DEFAULT 'inbox',
      content TEXT NOT NULL,
      url TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      content,
      tag,
      content='notes',
      content_rowid='id'
    );

    -- Triggers to keep FTS index synced with notes
    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, content, tag) VALUES (new.id, new.content, new.tag);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, content, tag) VALUES('delete', old.id, old.content, old.tag);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, content, tag) VALUES('delete', old.id, old.content, old.tag);
      INSERT INTO notes_fts(rowid, content, tag) VALUES (new.id, new.content, new.tag);
    END;

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task TEXT NOT NULL,
      trigger_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      recurrence TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reminders_trigger_status ON reminders(trigger_at, status);
  `);
}
