import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/client.js';
import { env } from '../config/env.js';

export interface BackupManifest {
  version: string;
  appName: string;
  timestamp: string;
  createdAt: number;
  databaseSizeBytes: number;
  sessionFilesCount: number;
  mediaFilesCount: number;
  archiveSizeBytes?: number;
  sha256Checksum?: string;
  includesMedia: boolean;
}

export interface BackupFileInfo {
  filename: string;
  filePath: string;
  sizeBytes: number;
  formattedSize: string;
  createdAt: number;
  createdIso: string;
}

export class BackupService {
  private backupsDir = path.resolve('data', 'backups');

  constructor() {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  /**
   * Creates a complete, self-contained disaster recovery and VPS migration archive (.zip).
   * Atomically snapshots the SQLite database (committing WAL journal pages),
   * packages Baileys session authentication credentials, media vault assets, and .env.
   */
  async createBackup(options: { label?: string; includeMedia?: boolean } = {}): Promise<{
    filename: string;
    filePath: string;
    sizeBytes: number;
    manifest: BackupManifest;
  }> {
    const includeMedia = options.includeMedia !== false;
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const labelSuffix = options.label ? `-${options.label.toLowerCase().replace(/[^a-z0-9_-]/g, '')}` : '';
    const archiveFilename = `messiah-backup-${timestampStr}${labelSuffix}.zip`;
    const archiveFilePath = path.join(this.backupsDir, archiveFilename);

    // 1. Ensure backup directory exists
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }

    // 2. Safe SQLite Atomic Point-in-Time Snapshot
    // VACUUM INTO commits any un-checkpointed WAL frames into a pristine standalone DB file
    const tempDbSnapshotPath = path.join(this.backupsDir, `temp_snap_${Date.now()}.db`);
    if (fs.existsSync(tempDbSnapshotPath)) {
      try { fs.unlinkSync(tempDbSnapshotPath); } catch {}
    }

    let databaseSizeBytes = 0;
    try {
      const db = getDatabase();
      // SQLite requires single quotes around the file path
      const escapedPath = tempDbSnapshotPath.replace(/'/g, "''");
      db.exec(`VACUUM INTO '${escapedPath}';`);
      if (fs.existsSync(tempDbSnapshotPath)) {
        databaseSizeBytes = fs.statSync(tempDbSnapshotPath).size;
      }
    } catch (err) {
      console.warn('[BackupService] VACUUM INTO failed, falling back to direct copy:', err);
      if (fs.existsSync(env.databasePath)) {
        fs.copyFileSync(env.databasePath, tempDbSnapshotPath);
        databaseSizeBytes = fs.statSync(tempDbSnapshotPath).size;
      }
    }

    // 3. Assemble Zip Archive using AdmZip
    const zip = new AdmZip();

    // A. Add SQLite snapshot as data/messiah.db
    if (fs.existsSync(tempDbSnapshotPath)) {
      zip.addLocalFile(tempDbSnapshotPath, 'data', 'messiah.db');
    }

    // B. Add Baileys session keys (sessions/)
    let sessionFilesCount = 0;
    const sessionsDir = path.resolve(env.sessionsDir);
    if (fs.existsSync(sessionsDir)) {
      const sessionFiles = fs.readdirSync(sessionsDir);
      sessionFilesCount = sessionFiles.length;
      zip.addLocalFolder(sessionsDir, 'sessions');
    }

    // C. Add decrypted media files (data/media/)
    let mediaFilesCount = 0;
    const mediaDir = path.resolve('data', 'media');
    if (includeMedia && fs.existsSync(mediaDir)) {
      const mediaFiles = fs.readdirSync(mediaDir);
      mediaFilesCount = mediaFiles.length;
      if (mediaFilesCount > 0) {
        zip.addLocalFolder(mediaDir, 'data/media');
      }
    }

    // D. Add .env configuration file if present
    const envPath = path.resolve('.env');
    if (fs.existsSync(envPath)) {
      zip.addLocalFile(envPath, '', '.env');
    }

    // E. Build Manifest
    const manifest: BackupManifest = {
      version: '1.0.0',
      appName: 'whatsapp_messiah',
      timestamp: new Date().toISOString(),
      createdAt: Date.now(),
      databaseSizeBytes,
      sessionFilesCount,
      mediaFilesCount,
      includesMedia: includeMedia
    };

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

    // Write zip to disk
    zip.writeZip(archiveFilePath);

    // Clean up temporary database snapshot
    if (fs.existsSync(tempDbSnapshotPath)) {
      try { fs.unlinkSync(tempDbSnapshotPath); } catch {}
    }

    // Calculate final archive size and sha256 checksum safely via stream
    const archiveStat = fs.statSync(archiveFilePath);
    const sha256 = await new Promise<string>((resolve) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(archiveFilePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', () => resolve(''));
    });

    manifest.archiveSizeBytes = archiveStat.size;
    manifest.sha256Checksum = sha256;

    console.log(`[BackupService] Created backup: ${archiveFilename} (${this.formatBytes(archiveStat.size)})`);

    // Retain only latest 5 backups
    this.cleanupOldBackups(5);

    return {
      filename: archiveFilename,
      filePath: archiveFilePath,
      sizeBytes: archiveStat.size,
      manifest
    };
  }

  /**
   * Restores all four pillars from a Messiah backup archive (.zip).
   */
  async restoreBackup(archivePath: string): Promise<{
    success: boolean;
    manifest: BackupManifest | null;
    restoredFiles: string[];
  }> {
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Backup archive does not exist at ${archivePath}`);
    }

    const zip = new AdmZip(archivePath);
    const entries = zip.getEntries();
    const entryNames = entries.map(e => e.entryName);

    // 1. Read & Validate Manifest
    const manifestEntry = zip.getEntry('manifest.json');
    let manifest: BackupManifest | null = null;
    if (manifestEntry) {
      try {
        manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
      } catch (err) {
        console.warn('[BackupService] Failed to parse manifest.json from backup archive:', err);
      }
    }

    // Basic structure check: must have either data/messiah.db or sessions/
    const hasDb = entryNames.some(name => name.includes('messiah.db'));
    const hasSessions = entryNames.some(name => name.startsWith('sessions'));
    if (!hasDb && !hasSessions) {
      throw new Error('Invalid Messiah backup archive: Missing database and session keys.');
    }

    // 2. Create Safety Snapshot of Current State Before Overwriting
    const safetyTimestamp = Date.now();
    const safetyDir = path.join(this.backupsDir, 'pre-restore-safety');
    if (!fs.existsSync(safetyDir)) {
      fs.mkdirSync(safetyDir, { recursive: true });
    }
    if (fs.existsSync(env.databasePath)) {
      try {
        fs.copyFileSync(env.databasePath, path.join(safetyDir, `messiah_pre_${safetyTimestamp}.db`));
      } catch {}
    }

    // 3. Extract Files
    const restoredFiles: string[] = [];
    const rootDir = path.resolve('.');

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      // Restrict path traversal security
      const sanitizedName = path.normalize(entry.entryName).replace(/^(\.\.(\/|\\|$))+/, '');
      const targetPath = path.join(rootDir, sanitizedName);
      const targetDir = path.dirname(targetPath);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.writeFileSync(targetPath, entry.getData());
      restoredFiles.push(sanitizedName);
    }

    // 4. Verify Database Integrity if restored
    if (fs.existsSync(env.databasePath)) {
      try {
        const verifyDb = new DatabaseSync(env.databasePath);
        const checkResult = verifyDb.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
        verifyDb.close();
        if (checkResult && checkResult.integrity_check !== 'ok') {
          console.warn('[BackupService] Restored database integrity check warning:', checkResult);
        } else {
          console.log('[BackupService] Restored database verified successfully (PRAGMA integrity_check = ok).');
        }
      } catch (err) {
        console.warn('[BackupService] Could not run PRAGMA integrity check on restored DB:', err);
      }
    }

    console.log(`[BackupService] Restore complete! Restored ${restoredFiles.length} files.`);
    return {
      success: true,
      manifest,
      restoredFiles
    };
  }

  /**
   * Lists all available local backup files in data/backups/ sorted descending by timestamp.
   */
  listBackups(): BackupFileInfo[] {
    if (!fs.existsSync(this.backupsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.backupsDir)
      .filter(f => f.startsWith('messiah-backup-') && f.endsWith('.zip'));

    return files.map(filename => {
      const filePath = path.join(this.backupsDir, filename);
      const stat = fs.statSync(filePath);
      return {
        filename,
        filePath,
        sizeBytes: stat.size,
        formattedSize: this.formatBytes(stat.size),
        createdAt: stat.mtimeMs,
        createdIso: stat.mtime.toISOString()
      };
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Keeps only the latest `keepMax` backup archives, deleting older ones.
   */
  cleanupOldBackups(keepMax = 5): number {
    const backups = this.listBackups();
    if (backups.length <= keepMax) {
      return 0;
    }

    const toDelete = backups.slice(keepMax);
    let deletedCount = 0;
    for (const b of toDelete) {
      try {
        if (fs.existsSync(b.filePath)) {
          fs.unlinkSync(b.filePath);
          deletedCount++;
        }
      } catch (err) {
        console.error(`[BackupService] Failed to remove old backup ${b.filename}:`, err);
      }
    }
    return deletedCount;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const backupService = new BackupService();
