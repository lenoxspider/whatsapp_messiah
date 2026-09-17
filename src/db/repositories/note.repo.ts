import { getDatabase } from '../client.js';

export interface NoteRecord {
  id: number;
  tag: string;
  content: string;
  url: string | null;
  created_at: number;
}

export class NoteRepository {
  private db = getDatabase();

  saveNote(content: string, tag: string = 'inbox', url?: string | null): NoteRecord {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO notes (tag, content, url, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(tag, content, url ?? null, now);
    return {
      id: Number(info.lastInsertRowid),
      tag,
      content,
      url: url ?? null,
      created_at: now
    };
  }

  searchNotes(query: string, limit: number = 10): NoteRecord[] {
    // Sanitize query for FTS5 prefix match
    const sanitized = query.replace(/[^\w\s]/g, '').trim();
    if (!sanitized) return [];

    const ftsQuery = `${sanitized}*`;
    const stmt = this.db.prepare(`
      SELECT n.id, n.tag, n.content, n.url, n.created_at
      FROM notes_fts fts
      JOIN notes n ON n.id = fts.rowid
      WHERE notes_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    try {
      return stmt.all(ftsQuery, limit) as unknown as NoteRecord[];
    } catch {
      // Fallback to standard LIKE search if FTS query syntax is invalid
      const fallbackStmt = this.db.prepare(`
        SELECT id, tag, content, url, created_at
        FROM notes
        WHERE content LIKE ? OR tag LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      const likeParam = `%${query}%`;
      return fallbackStmt.all(likeParam, likeParam, limit) as unknown as NoteRecord[];
    }
  }

  getRecentNotes(limit: number = 10): NoteRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, tag, content, url, created_at
      FROM notes
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as unknown as NoteRecord[];
  }

  searchNotesAdvanced(query: string, limit: number = 5): NoteRecord[] {
    const stopwords = new Set([
      'what', 'did', 'i', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'about', 'to', 'for', 'in', 'on', 'at',
      'of', 'my', 'me', 'we', 'our', 'you', 'your', 'how', 'do', 'can', 'with', 'from', 'by', 'that', 'this',
      'there', 'tell', 'show', 'give', 'know', 'remember', 'recall', 'find'
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopwords.has(w));

    if (words.length > 0) {
      const ftsQuery = words.map(w => `${w}*`).join(' OR ');
      try {
        const stmt = this.db.prepare(`
          SELECT n.id, n.tag, n.content, n.url, n.created_at
          FROM notes_fts fts
          JOIN notes n ON n.id = fts.rowid
          WHERE notes_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
        const results = stmt.all(ftsQuery, limit) as unknown as NoteRecord[];
        if (results && results.length > 0) {
          return results;
        }
      } catch {}

      for (const word of words) {
        try {
          const fallback = this.db.prepare(`
            SELECT id, tag, content, url, created_at
            FROM notes
            WHERE content LIKE ? OR tag LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
          `).all(`%${word}%`, `%${word}%`, limit) as unknown as NoteRecord[];

          if (fallback.length > 0) {
            return fallback;
          }
        } catch {}
      }
    }

    return this.getRecentNotes(limit);
  }
}

export const noteRepo = new NoteRepository();
