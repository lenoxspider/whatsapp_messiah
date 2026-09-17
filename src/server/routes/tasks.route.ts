import { Router } from 'express';
import { agentTaskRepo } from '../../db/repositories/agent_task.repo.js';
import { contactRepo } from '../../db/repositories/contact.repo.js';

export const tasksRouter = Router();

// GET /api/tasks - List all agent tasks
tasksRouter.get('/', (req, res) => {
  const status = req.query.status ? String(req.query.status) : 'all';
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const tasks = agentTaskRepo.listTasks(status, limit);
  res.json({ tasks });
});

// POST /api/tasks - Create a new delegated task
tasksRouter.post('/', (req, res) => {
  const { contactJid, goal, scheduledAt, recurrence } = req.body;

  if (!contactJid || !goal) {
    return res.status(400).json({ error: 'contactJid and goal are required' });
  }

  const contact = contactRepo.getContact(contactJid);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const task = agentTaskRepo.createTask(
    contactJid,
    goal,
    scheduledAt ? Number(scheduledAt) : Date.now(),
    recurrence || null
  );

  res.status(201).json({ task });
});

// POST /api/tasks/:id/cancel - Cancel task
tasksRouter.post('/:id/cancel', (req, res) => {
  const id = Number(req.params.id);
  const task = agentTaskRepo.getTaskById(id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  agentTaskRepo.updateTaskStatus(id, 'cancelled', 'Cancelled from Web Dashboard');
  res.json({ success: true });
});

// POST /api/tasks/:id/complete - Mark task complete
tasksRouter.post('/:id/complete', (req, res) => {
  const id = Number(req.params.id);
  const task = agentTaskRepo.getTaskById(id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const summary = req.body.summary || 'Manually completed from Web Dashboard';
  agentTaskRepo.updateTaskStatus(id, 'completed', summary);
  res.json({ success: true });
});

// DELETE /api/tasks/:id - Delete task
tasksRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const success = agentTaskRepo.deleteTask(id);
  res.json({ success });
});
