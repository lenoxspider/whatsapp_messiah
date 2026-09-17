import { Router } from 'express';
import fs from 'node:fs';
import { dashboardState } from '../state.js';
import { getDatabase } from '../../db/client.js';
import { env } from '../../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  let lastMessageTimestamp: number | null = null;
  const reminderBreakdown = { pending: 0, claimed: 0, sent: 0, failed: 0 };
  let dbSizeBytes = 0;
  const llmMetrics = { totalCalls: 0, totalCostUsd: 0, totalTokens: 0, avgLatencyMs: 0 };

  try {
    const db = getDatabase();

    // 1. Last received message timestamp
    const lastMsg = db.prepare('SELECT MAX(timestamp) as last_ts FROM messages WHERE from_me = 0').get() as { last_ts: number | null };
    lastMessageTimestamp = lastMsg?.last_ts || null;

    // 2. Reminder queue breakdown
    const remRows = db.prepare('SELECT status, COUNT(*) as count FROM reminders GROUP BY status').all() as Array<{ status: string; count: number }>;
    for (const r of remRows) {
      if (r.status in reminderBreakdown) {
        (reminderBreakdown as any)[r.status] = r.count;
      }
    }

    // 3. Disk space & SQLite DB byte size
    if (fs.existsSync(env.databasePath)) {
      dbSizeBytes = fs.statSync(env.databasePath).size;
    }

    // 4. OpenAI LLM Call Metrics
    const llmRow = db.prepare(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(cost_usd) as total_cost,
        SUM(total_tokens) as total_tokens,
        AVG(latency_ms) as avg_latency
      FROM llm_calls
    `).get() as { total_calls: number; total_cost: number | null; total_tokens: number | null; avg_latency: number | null };

    if (llmRow) {
      llmMetrics.totalCalls = llmRow.total_calls || 0;
      llmMetrics.totalCostUsd = parseFloat((llmRow.total_cost || 0).toFixed(4));
      llmMetrics.totalTokens = llmRow.total_tokens || 0;
      llmMetrics.avgLatencyMs = Math.round(llmRow.avg_latency || 0);
    }
  } catch (err: any) {
    console.warn('[HealthRoute] Failed to query DB metrics:', err.message);
  }

  const socketState = dashboardState.getState().status;
  const isHealthy = socketState === 'connected' || socketState === 'connecting';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    socket: {
      state: socketState,
      phoneNumber: env.phoneNumber || null
    },
    lastMessageReceivedIso: lastMessageTimestamp ? new Date(lastMessageTimestamp).toISOString() : null,
    reminders: reminderBreakdown,
    storage: {
      dbSizeBytes,
      dbSizeFormatted: (dbSizeBytes / (1024 * 1024)).toFixed(2) + ' MB'
    },
    llm: llmMetrics,
    memoryUsageMb: {
      rss: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      heapUsed: Math.round(process.memoryUsage().heapUsed / (1024 * 1024))
    }
  });
});
