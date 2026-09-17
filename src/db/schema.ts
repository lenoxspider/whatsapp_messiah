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

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      caller_jid TEXT NOT NULL,
      is_video INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL,
      action_taken TEXT NOT NULL DEFAULT 'rejected'
    );

    CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON calls(timestamp);

    CREATE TABLE IF NOT EXISTS contact_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jid TEXT NOT NULL,
      fact TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      confidence REAL DEFAULT 1.0,
      source_msg_id TEXT,
      created_at INTEGER NOT NULL,
      superseded_by INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_contact_facts_jid ON contact_facts(jid);

    CREATE TABLE IF NOT EXISTS llm_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      purpose TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0.0,
      latency_ms INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_llm_calls_timestamp ON llm_calls(timestamp);

    CREATE TABLE IF NOT EXISTS captured_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status_id TEXT,
      contact_jid TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      contact_name TEXT,
      content TEXT,
      media_path TEXT,
      media_type TEXT,
      mime_type TEXT,
      timestamp INTEGER NOT NULL,
      discord_sent INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_captured_statuses_timestamp ON captured_statuses(timestamp);

    CREATE TABLE IF NOT EXISTS message_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      sender_jid TEXT NOT NULL,
      original_content TEXT,
      edited_content TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_message_edits_msg_id ON message_edits(message_id);
    CREATE INDEX IF NOT EXISTS idx_message_edits_timestamp ON message_edits(timestamp);

    CREATE TABLE IF NOT EXISTS contact_dossiers (
      jid TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      open_commitments_json TEXT,
      tone_profile TEXT,
      topics_json TEXT,
      message_count_analyzed INTEGER NOT NULL,
      generated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_contact_dossiers_expires ON contact_dossiers(expires_at);

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_jid TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_at INTEGER NOT NULL,
      recurrence TEXT,
      summary TEXT,
      last_action_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_tasks_contact ON agent_tasks(contact_jid, status);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_scheduled ON agent_tasks(scheduled_at, status);

    CREATE TABLE IF NOT EXISTS status_targets (
      phone TEXT PRIMARY KEY,
      name TEXT,
      added_at INTEGER NOT NULL
    );
  `);

  // Safe migration for existing SQLite database
  const columns = db.prepare(`PRAGMA table_info(messages)`).all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map(c => c.name));

  if (!columnNames.has('media_path')) {
    db.exec(`ALTER TABLE messages ADD COLUMN media_path TEXT;`);
  }
  if (!columnNames.has('media_mimetype')) {
    db.exec(`ALTER TABLE messages ADD COLUMN media_mimetype TEXT;`);
  }
  if (!columnNames.has('is_view_once')) {
    db.exec(`ALTER TABLE messages ADD COLUMN is_view_once INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!columnNames.has('embedding')) {
    db.exec(`ALTER TABLE messages ADD COLUMN embedding BLOB;`);
  }

  const noteCols = db.prepare(`PRAGMA table_info(notes)`).all() as Array<{ name: string }>;
  const noteColNames = new Set(noteCols.map(c => c.name));
  if (!noteColNames.has('embedding')) {
    db.exec(`ALTER TABLE notes ADD COLUMN embedding BLOB;`);
  }

  const contactCols = db.prepare(`PRAGMA table_info(contacts)`).all() as Array<{ name: string }>;
  const contactColNames = new Set(contactCols.map(c => c.name));
  if (!contactColNames.has('autopilot_enabled')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN autopilot_enabled INTEGER NOT NULL DEFAULT 0;`);
  }
}

export function purgeAllData(): void {
  const db = getDatabase();
  db.exec(`
    DELETE FROM messages;
    DELETE FROM notes;
    DELETE FROM notes_fts;
    DELETE FROM reminders;
    DELETE FROM calls;
    DELETE FROM contact_facts;
    DELETE FROM llm_calls;
    DELETE FROM message_edits;
    DELETE FROM contact_dossiers;
    DELETE FROM captured_statuses;
    DELETE FROM agent_tasks;
    DELETE FROM contacts;
  `);
  try {
    db.exec(`PRAGMA wal_checkpoint(TRUNCATE);`);
  } catch {}
}


