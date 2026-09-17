import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env.js';
import { statusStealRepo } from '../../db/repositories/status_steal.repo.js';
import { discordService } from '../../services/discord.service.js';
import { purgeAllData } from '../../db/schema.js';
import { backupService } from '../../services/backup.service.js';
import { getActiveSocket } from '../../core/connection.js';
import { dashboardState } from '../state.js';

import { systemLogger } from '../logger.js';

import { statusTargetRepo } from '../../db/repositories/status_target.repo.js';

const execAsync = promisify(exec);
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

export const extrasRouter = Router();

// GET target contacts list
extrasRouter.get('/targets', (req, res) => {
  const targets = statusTargetRepo.getAllTargets();
  res.json({ success: true, targets });
});

// ADD target contact
extrasRouter.post('/targets', (req, res) => {
  const { phone, name } = req.body || {};
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: 'Phone number is required.' });
  }
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 7) {
    return res.status(400).json({ error: 'Valid phone number with country code is required.' });
  }

  statusTargetRepo.addTarget(clean, name || null);
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  systemLogger.audit('STATUS_TARGET_ADD', clientIp, `Added target +${clean} to status capture list`);

  res.json({ success: true, message: `Target +${clean} added successfully.`, targets: statusTargetRepo.getAllTargets() });
});

// DELETE target contact
extrasRouter.delete('/targets/:phone', (req, res) => {
  const phone = req.params.phone;
  const clean = phone.replace(/[^0-9]/g, '');
  const removed = statusTargetRepo.removeTarget(clean);
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  systemLogger.audit('STATUS_TARGET_REMOVE', clientIp, `Removed target +${clean} from status capture list`);

  res.json({ success: removed, message: removed ? `Target +${clean} removed.` : 'Target not found.' });
});

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

// GET git status & commit version
extrasRouter.get('/git-status', async (req, res) => {
  try {
    const localHash = (await execAsync('git rev-parse --short HEAD')).stdout.trim();
    const branch = (await execAsync('git rev-parse --abbrev-ref HEAD')).stdout.trim();
    const logInfo = (await execAsync('git log -1 --format="%s (%cr)"')).stdout.trim();

    let remoteHash = localHash;
    let isUpToDate = true;
    try {
      await execAsync('git fetch origin main', { timeout: 10000 });
      remoteHash = (await execAsync('git rev-parse --short origin/main')).stdout.trim();
      isUpToDate = localHash === remoteHash;
    } catch {}

    res.json({
      success: true,
      localHash,
      remoteHash,
      branch,
      logInfo,
      isUpToDate
    });
  } catch (err: any) {
    console.error('[ExtrasRoute] Git status check failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST trigger full update: git pull, npm install, build, and restart
extrasRouter.post('/update', async (req, res) => {
  try {
    console.log('[Updater] Starting automated update sequence...');
    const logs: string[] = [];

    // 1. Git pull
    logs.push('📦 [1/3] Pulling latest updates from GitHub (origin/main)...');
    const pullRes = await execAsync('git pull origin main');
    logs.push(pullRes.stdout.trim() || 'Git up to date.');

    // 2. npm install
    logs.push(`📥 [2/3] Installing dependencies (${npmCmd} install)...`);
    const installRes = await execAsync(`${npmCmd} install --silent`);
    if (installRes.stdout) logs.push(installRes.stdout.trim());

    // 3. npm run build
    logs.push(`⚙️ [3/3] Compiling TypeScript (${npmCmd} run build)...`);
    const buildRes = await execAsync(`${npmCmd} run build`);
    if (buildRes.stdout) logs.push(buildRes.stdout.trim());

    logs.push('✅ Build completed successfully!');
    logs.push('🔄 Reloading Messiah daemon under PM2...');

    res.json({
      success: true,
      message: 'Update and compilation completed. Reloading daemon...',
      logs: logs.join('\n')
    });

    // Schedule graceful reload/restart after sending response
    setTimeout(async () => {
      try {
        console.log('[Updater] Triggering PM2 reload/restart...');
        await execAsync('pm2 reload whatsapp-messiah || pm2 restart whatsapp-messiah || pm2 reload messiah || pm2 restart messiah || pm2 restart 0');
      } catch (pm2Err) {
        console.warn('[Updater] PM2 reload failed, triggering process exit for supervisor:', pm2Err);
        process.exit(0);
      }
    }, 1500);
  } catch (err: any) {
    console.error('[Updater] Update failed:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Update failed during execution',
      stderr: err.stderr || ''
    });
  }
});

// POST trigger daemon restart only
extrasRouter.post('/restart', (req, res) => {
  res.json({
    success: true,
    message: 'Daemon restart triggered. Reconnecting socket in ~3 seconds...'
  });

  setTimeout(async () => {
    try {
      console.log('[Daemon] Restart triggered from Dashboard...');
      await execAsync('pm2 restart whatsapp-messiah || pm2 restart messiah || pm2 restart 0');
    } catch (pm2Err) {
      console.warn('[Daemon] PM2 restart failed, triggering process exit for supervisor:', pm2Err);
      process.exit(0);
    }
  }, 1000);
});

// POST trigger full factory reset (purge vault, media, and sessions)
extrasRouter.post('/factory-reset', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  systemLogger.audit('FACTORY_RESET', clientIp, 'Full factory reset initiated from Control Plane');

  try {
    console.log('[Factory Reset] Initiating complete vault & session purge...');

    // 1. Terminate the active WhatsApp socket cleanly FIRST
    // This prevents Baileys from throwing file access errors and prevents auto-reconnect loops while sessions are wiped
    const sock = getActiveSocket();
    if (sock) {
      try {
        sock.ev.removeAllListeners('connection.update');
        sock.ev.removeAllListeners('creds.update');
        sock.ev.removeAllListeners('messages.upsert');
        sock.end(undefined);
      } catch {}
    }

    dashboardState.setStatus('disconnected', 'Factory reset completed');
    dashboardState.setQR(null);
    dashboardState.setPairingCode(null);
    dashboardState.setPairedPhone(null);

    // 2. Create lightweight safety snapshot of database only (never buffers media into RAM)
    try {
      const backupDir = path.resolve('data', 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      if (fs.existsSync(env.databasePath)) {
        const snapPath = path.join(backupDir, `safety_pre_reset_${Date.now()}.db`);
        fs.copyFileSync(env.databasePath, snapPath);
        console.log('[Factory Reset] Pre-reset DB snapshot created at:', snapPath);
      }
    } catch (bErr) {
      console.warn('[Factory Reset] Safety snapshot failed, proceeding with purge:', bErr);
    }

    // 3. Clear all SQLite database tables
    purgeAllData();
    console.log('[Factory Reset] Database tables purged.');

    // 4. Purge decrypted media vault
    const mediaDir = path.resolve('data', 'media');
    if (fs.existsSync(mediaDir)) {
      try {
        fs.rmSync(mediaDir, { recursive: true, force: true });
        fs.mkdirSync(mediaDir, { recursive: true });
        console.log('[Factory Reset] Media vault cleared.');
      } catch (mErr) {
        console.warn('[Factory Reset] Could not clear media vault:', mErr);
      }
    }

    // 5. Purge Baileys sessions directory completely (including creds.json)
    const sDir = path.resolve(env.sessionsDir);
    try {
      // Delete entire dir so no stale creds.json survives, then recreate empty
      if (fs.existsSync(sDir)) {
        fs.rmSync(sDir, { recursive: true, force: true });
      }
      fs.mkdirSync(sDir, { recursive: true });
      console.log('[Factory Reset] Sessions and credentials fully cleared.');
    } catch (sErr) {
      console.warn('[Factory Reset] Could not clear sessions dir:', sErr);
    }

    res.json({
      success: true,
      message: 'Factory reset completed. All messages, notes, media, and WhatsApp sessions have been wiped.'
    });

    // Schedule PM2 restart after 1.5s
    setTimeout(async () => {
      try {
        console.log('[Factory Reset] Restarting daemon after reset...');
        await execAsync('pm2 restart whatsapp-messiah || pm2 restart messiah || pm2 restart 0');
      } catch (pm2Err) {
        console.warn('[Factory Reset] PM2 restart command failed, triggering process.exit(0) for supervisor:', pm2Err);
        process.exit(0);
      }
    }, 1500);
  } catch (err: any) {
    console.error('[Factory Reset] Error during reset:', err);
    res.status(500).json({ success: false, error: err.message || 'Factory reset failed' });
  }
});


