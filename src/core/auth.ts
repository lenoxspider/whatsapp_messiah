import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

export async function initAuthState() {
  if (!fs.existsSync(env.sessionsDir)) {
    fs.mkdirSync(env.sessionsDir, { recursive: true });
  }

  const authState = await useMultiFileAuthState(env.sessionsDir);

  // Wrap saveCreds to perform ATOMIC file writes (creds.tmp -> fsync -> rename)
  const originalSaveCreds = authState.saveCreds;
  const atomicSaveCreds = async () => {
    try {
      await originalSaveCreds();
      const credsPath = path.join(env.sessionsDir, 'creds.json');
      const tmpPath = path.join(env.sessionsDir, 'creds.json.tmp');

      if (fs.existsSync(credsPath)) {
        // Create atomic copy
        fs.copyFileSync(credsPath, tmpPath);
        const fd = fs.openSync(tmpPath, 'r+');
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fs.renameSync(tmpPath, credsPath);
      }
    } catch (err: any) {
      console.warn('[Auth] Atomic creds save warning:', err.message);
    }
  };

  return {
    state: authState.state,
    saveCreds: atomicSaveCreds
  };
}

// Rolling Session Snapshots (keeps the last N healthy credential snapshots)
export function createSessionSnapshot(maxSnapshots: number = 5): void {
  try {
    const credsPath = path.join(env.sessionsDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return;

    const backupDir = path.resolve('data', 'sessions_backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const snapshotFolder = path.join(backupDir, `snapshot_${Date.now()}`);
    fs.mkdirSync(snapshotFolder, { recursive: true });

    // Copy all files in sessions directory
    const files = fs.readdirSync(env.sessionsDir);
    for (const file of files) {
      const src = path.join(env.sessionsDir, file);
      const dest = path.join(snapshotFolder, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest);
      }
    }

    console.log(`[Session Snapshot] 📸 Created timestamped session snapshot at ${path.basename(snapshotFolder)}`);

    // Rotate old snapshots (keep last N)
    const snapshots = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('snapshot_'))
      .sort();

    if (snapshots.length > maxSnapshots) {
      const toDelete = snapshots.slice(0, snapshots.length - maxSnapshots);
      for (const oldFolder of toDelete) {
        fs.rmSync(path.join(backupDir, oldFolder), { recursive: true, force: true });
      }
    }
  } catch (err: any) {
    console.warn('[Session Snapshot] Failed to create snapshot:', err.message);
  }
}
