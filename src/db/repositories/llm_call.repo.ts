import { getDatabase } from '../client.js';

export interface LLMCallRecord {
  id: number;
  model: string;
  purpose: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  timestamp: number;
}

export class LLMCallRepository {
  private db = getDatabase();

  logCall(call: {
    model: string;
    purpose: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    latencyMs?: number;
  }): LLMCallRecord {
    const now = Date.now();
    const pTokens = call.promptTokens || 0;
    const cTokens = call.completionTokens || 0;
    const tTokens = call.totalTokens || (pTokens + cTokens);
    const cost = call.costUsd || 0.0;
    const latency = call.latencyMs || 0;

    const stmt = this.db.prepare(`
      INSERT INTO llm_calls (model, purpose, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(call.model, call.purpose, pTokens, cTokens, tTokens, cost, latency, now);

    return {
      id: Number(info.lastInsertRowid),
      model: call.model,
      purpose: call.purpose,
      prompt_tokens: pTokens,
      completion_tokens: cTokens,
      total_tokens: tTokens,
      cost_usd: cost,
      latency_ms: latency,
      timestamp: now
    };
  }

  getStats(): {
    totalCostUsd: number;
    totalTokens: number;
    totalCalls: number;
    todayCostUsd: number;
    todayTokens: number;
    byPurpose: Record<string, number>;
    byModel: Record<string, number>;
  } {
    const totalRow = this.db.prepare(`
      SELECT 
        COUNT(*) as total_calls,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost
      FROM llm_calls
    `).get() as { total_calls: number; total_tokens: number; total_cost: number };

    // Start of today UTC
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const todayTimestamp = startOfToday.getTime();

    const todayRow = this.db.prepare(`
      SELECT 
        COALESCE(SUM(total_tokens), 0) as today_tokens,
        COALESCE(SUM(cost_usd), 0) as today_cost
      FROM llm_calls
      WHERE timestamp >= ?
    `).get(todayTimestamp) as { today_tokens: number; today_cost: number };

    const purposeRows = this.db.prepare(`
      SELECT purpose, COUNT(*) as count
      FROM llm_calls
      GROUP BY purpose
    `).all() as Array<{ purpose: string; count: number }>;

    const modelRows = this.db.prepare(`
      SELECT model, COUNT(*) as count
      FROM llm_calls
      GROUP BY model
    `).all() as Array<{ model: string; count: number }>;

    const byPurpose: Record<string, number> = {};
    for (const r of purposeRows) byPurpose[r.purpose] = r.count;

    const byModel: Record<string, number> = {};
    for (const r of modelRows) byModel[r.model] = r.count;

    return {
      totalCostUsd: Number((totalRow?.total_cost || 0).toFixed(4)),
      totalTokens: totalRow?.total_tokens || 0,
      totalCalls: totalRow?.total_calls || 0,
      todayCostUsd: Number((todayRow?.today_cost || 0).toFixed(4)),
      todayTokens: todayRow?.today_tokens || 0,
      byPurpose,
      byModel
    };
  }

  getRecentCalls(limit: number = 30): LLMCallRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM llm_calls
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit) as unknown as LLMCallRecord[];
  }
}

export const llmCallRepo = new LLMCallRepository();
