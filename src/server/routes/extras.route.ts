import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import { statusStealRepo } from '../../db/repositories/status_steal.repo.js';
import { discordService } from '../../services/discord.service.js';

export const extrasRouter = Router();

// GET current covert ops / extras config
extrasRouter.get('/config', (req, res) => {
  res.json({
    statusStealerTrigger: env.statusStealerTrigger || '!😶🌫️',
    statusStealerAutoDelete: env.statusStealerAutoDelete,
    statusStealerDiscord: env.statusStealerDiscord,
    discordConfigured: Boolean(env.discordWebhookUrl)
  });
});

// UPDATE covert ops / extras config
extrasRouter.post('/config', (req, res) => {
  const { statusStealerTrigger, statusStealerAutoDelete, statusStealerDiscord } = req.body;

  if (statusStealerTrigger !== undefined && typeof statusStealerTrigger === 'string') {
    env.statusStealerTrigger = statusStealerTrigger.trim() || '!😶🌫️';
  }
  if (statusStealerAutoDelete !== undefined) {
    env.statusStealerAutoDelete = Boolean(statusStealerAutoDelete);
  }
  if (statusStealerDiscord !== undefined) {
    env.statusStealerDiscord = Boolean(statusStealerDiscord);
  }

  // Persist to .env
  try {
    const envPath = path.resolve('.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    const setEnvVar = (key: string, val: string) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    };

    setEnvVar('STATUS_STEALER_TRIGGER', env.statusStealerTrigger);
    setEnvVar('STATUS_STEALER_AUTO_DELETE', env.statusStealerAutoDelete ? '1' : '0');
    setEnvVar('STATUS_STEALER_DISCORD', env.statusStealerDiscord ? '1' : '0');

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
  } catch (err) {
    console.error('[Extras Route] Failed to persist .env file:', err);
  }

  res.json({
    success: true,
    message: 'Covert ops settings updated successfully.',
    config: {
      statusStealerTrigger: env.statusStealerTrigger,
      statusStealerAutoDelete: env.statusStealerAutoDelete,
      statusStealerDiscord: env.statusStealerDiscord
    }
  });
});

// GET captured statuses feed
extrasRouter.get('/statuses', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  const statuses = statusStealRepo.getCapturedStatuses(limit, offset);
  const total = statusStealRepo.countCapturedStatuses();

  res.json({ statuses, total, limit, offset });
});

// DELETE captured status record
extrasRouter.delete('/statuses/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const success = statusStealRepo.deleteCapturedStatus(id);
  res.json({ success });
});

// TEST Discord webhook dispatch
extrasRouter.post('/test-discord', async (req, res) => {
  if (!env.discordWebhookUrl) {
    return res.status(400).json({ error: 'Discord webhook URL is not configured in Config.' });
  }

  const ok = await discordService.sendStatusStealAlert({
    contactPhone: '1234567890',
    contactName: 'Test Sentinel Contact',
    caption: '🧪 Test Status Stealer Dispatch from Messiah Operations Console',
    timestamp: Date.now()
  });

  if (ok) {
    res.json({ success: true, message: 'Test status alert sent to Discord.' });
  } else {
    res.status(500).json({ error: 'Failed to dispatch alert to Discord webhook.' });
  }
});
