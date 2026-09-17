import { Router } from 'express';
import { llmCallRepo } from '../../db/repositories/llm_call.repo.js';

export const llmRouter = Router();

llmRouter.get('/stats', (_req, res) => {
  try {
    const stats = llmCallRepo.getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

llmRouter.get('/recent', (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const calls = llmCallRepo.getRecentCalls(limit);
    res.json({ calls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
