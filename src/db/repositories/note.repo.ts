import { getDatabase } from '../client.js';

export interface NoteRecord {
  id: number;
  tag: string;
  content: string;
  url: string | null;
  created_at: number;
  embedding?: Buffer | null;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class NoteRepository {
  private db = getDatabase();

  saveNote(content: string, tag: string = 'inbox', url?: string | null, embedding?: Float32Array | null): NoteRecord {
    const now = Date.now();
    const embBuf = embedding 
      ? Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)
      : null;

    const stmt = this.db.prepare(`
      INSERT INTO notes (tag, content, url, created_at, embedding)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(tag, content, url ?? null, now, embBuf);
    return {
      id: Number(info.lastInsertRowid),
      tag,
      content,
      url: url ?? null,
      created_at: now,
      embedding: embBuf
    };
  }

  updateEmbedding(id: number, embedding: Float32Array): void {
    const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    const stmt = this.db.prepare(`UPDATE notes SET embedding = ? WHERE id = ?`);
    stmt.run(buf, id);
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

  searchHybrid(query: string, limit: number = 8, queryVector?: Float32Array | null): NoteRecord[] {
    const ftsResults = this.searchNotesAdvanced(query, 15);

    if (!queryVector) {
      return ftsResults.slice(0, limit);
    }

    // Retrieve notes with vector embeddings
    const rows = this.db.prepare(`
      SELECT id, tag, content, url, created_at, embedding
      FROM notes
      WHERE embedding IS NOT NULL
    `).all() as unknown as Array<NoteRecord & { embedding: Buffer }>;

    if (rows.length === 0) {
      return ftsResults.slice(0, limit);
    }

    // Compute cosine similarity
    const vectorCandidates: Array<{ note: NoteRecord; similarity: number }> = [];
    for (const r of rows) {
      if (!r.embedding || r.embedding.length < 100) continue;
      const noteVec = new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4);
      const sim = cosineSimilarity(queryVector, noteVec);
      if (sim > 0.20) {
        vectorCandidates.push({
          note: { id: r.id, tag: r.tag, content: r.content, url: r.url, created_at: r.created_at },
          similarity: sim
        });
      }
    }

    // Sort vector matches descending
    vectorCandidates.sort((a, b) => b.similarity - a.similarity);
    const topVectors = vectorCandidates.slice(0, 15);

    // Reciprocal Rank Fusion (RRF) with constant k=60
    const k = 60;
    const scores = new Map<number, { note: NoteRecord; rrfScore: number }>();

    ftsResults.forEach((note, rank) => {
      const s = 1 / (k + rank + 1);
      scores.set(note.id, { note, rrfScore: s });
    });

    topVectors.forEach((item, rank) => {
      const s = 1 / (k + rank + 1);
      const existing = scores.get(item.note.id);
      if (existing) {
        existing.rrfScore += s;
      } else {
        scores.set(item.note.id, { note: item.note, rrfScore: s });
      }
    });

    return Array.from(scores.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .map(x => x.note)
      .slice(0, limit);
  }
}

export const noteRepo = new NoteRepository();
