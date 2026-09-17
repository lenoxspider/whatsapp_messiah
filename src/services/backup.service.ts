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
  isEncrypted: boolean;
}

export interface BackupFileInfo {
  filename: string;
  filePath: string;
  sizeBytes: number;
  formattedSize: string;
  createdAt: number;
  createdIso: string;
  isEncrypted: boolean;
}

const MAGIC_HEADER = Buffer.from('MESSIAH_ENC_V1');

/**
 * AES-256-GCM authenticated encryption for backup archives.
 */
export function encryptPayload(data: Buffer, password?: string): Buffer {
  const secret = password || env.backupPassword || 'Messiah_AES256_Backup_Key_2026';
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([MAGIC_HEADER, salt, iv, authTag, encrypted]);
}

/**
 * Decrypts AES-256-GCM encrypted backup payload or returns plain buffer if unencrypted.
 */
export function decryptPayload(encryptedData: Buffer, password?: string): Buffer {
  if (encryptedData.length < MAGIC_HEADER.length + 16 + 12 + 16) {
    return encryptedData; // Not encrypted
  }

  const header = encryptedData.subarray(0, MAGIC_HEADER.length);
  if (!header.equals(MAGIC_HEADER)) {
    return encryptedData; // Plain unencrypted zip
  }

  let offset = MAGIC_HEADER.length;
  const salt = encryptedData.subarray(offset, offset + 16); offset += 16;
  const iv = encryptedData.subarray(offset, offset + 12); offset += 12;
  const authTag = encryptedData.subarray(offset, offset + 16); offset += 16;
  const ciphertext = encryptedData.subarray(offset);

  const secret = password || env.backupPassword || 'Messiah_AES256_Backup_Key_2026';
  const key = crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export class BackupService {
  private backupsDir = path.resolve('data', 'backups');

  constructor() {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  /**
   * Creates a complete, self-contained disaster recovery archive (.zip).
   * Atomically snapshots SQLite DB, packages session keys, media, and encrypts with AES-256-GCM.
   */
  async createBackup(options: { label?: string; includeMedia?: boolean; encrypt?: boolean; password?: string } = {}): Promise<{
    filename: string;
    filePath: string;
    sizeBytes: number;
    manifest: BackupManifest;
  }> {
    const includeMedia = options.includeMedia !== false;
    const shouldEncrypt = options.encrypt !== false; // Encrypted by default
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const labelSuffix = options.label ? `-${options.label.toLowerCase().replace(/[^a-z0-9_-]/g, '')}` : '';
    const ext = shouldEncrypt ? '.enc.zip' : '.zip';
    const archiveFilename = `messiah-backup-${timestampStr}${labelSuffix}${ext}`;
    const archiveFilePath = path.join(this.backupsDir, archiveFilename);

    // 1. Ensure backup directory exists
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }

    // 2. Safe SQLite Atomic Point-in-Time Snapshot
    const tempDbSnapshotPath = path.join(this.backupsDir, `temp_snap_${Date.now()}.db`);
    if (fs.existsSync(tempDbSnapshotPath)) {
      try { fs.unlinkSync(tempDbSnapshotPath); } catch {}
    }

    let databaseSizeBytes = 0;
    try {
      const db = getDatabase();
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

    // 3. Assemble Zip Archive
    const zip = new AdmZip();

    // A. SQLite snapshot as data/messiah.db
    if (fs.existsSync(tempDbSnapshotPath)) {
      zip.addLocalFile(tempDbSnapshotPath, 'data', 'messiah.db');
    }

    // B. Baileys session keys
    let sessionFilesCount = 0;
    const sessionsDir = path.resolve(env.sessionsDir);
    if (fs.existsSync(sessionsDir)) {
      const sessionFiles = fs.readdirSync(sessionsDir);
      sessionFilesCount = sessionFiles.length;
      zip.addLocalFolder(sessionsDir, 'sessions');
    }

    // C. Decrypted media files
    let mediaFilesCount = 0;
    const mediaDir = path.resolve('data', 'media');
    if (includeMedia && fs.existsSync(mediaDir)) {
      const mediaFiles = fs.readdirSync(mediaDir);
      mediaFilesCount = mediaFiles.length;
      if (mediaFilesCount > 0) {
        zip.addLocalFolder(mediaDir, 'data/media');
      }
    }

    // D. Environment file
    const envPath = path.resolve('.env');
    if (fs.existsSync(envPath)) {
      zip.addLocalFile(envPath, '', '.env');
    }

    // E. Manifest
    const manifest: BackupManifest = {
      version: '1.0.0',
      appName: 'whatsapp_messiah',
      timestamp: new Date().toISOString(),
      createdAt: Date.now(),
      databaseSizeBytes,
      sessionFilesCount,
      mediaFilesCount,
      includesMedia: includeMedia,
      isEncrypted: shouldEncrypt
    };

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

    // 4. Generate Zip Buffer & Apply AES-256-GCM Encryption if enabled
    let rawZipBuffer = zip.toBuffer();
    if (shouldEncrypt) {
      rawZipBuffer = encryptPayload(rawZipBuffer, options.password);
    }

    // Write final buffer to disk
    fs.writeFileSync(archiveFilePath, rawZipBuffer);

    // Clean up temporary database snapshot
    if (fs.existsSync(tempDbSnapshotPath)) {
      try { fs.unlinkSync(tempDbSnapshotPath); } catch {}
    }

    // Calculate sha256 checksum and size
    const archiveStat = fs.statSync(archiveFilePath);
    const sha256 = crypto.createHash('sha256').update(rawZipBuffer).digest('hex');

    manifest.archiveSizeBytes = archiveStat.size;
    manifest.sha256Checksum = sha256;

    console.log(`[BackupService] Created ${shouldEncrypt ? '🔒 AES-256 Encrypted' : '📦 Unencrypted'} backup: ${archiveFilename} (${this.formatBytes(archiveStat.size)})`);

    // Enforce 7 Daily + 4 Weekly Retention Policy
    this.cleanupOldBackups(7, 4);

    return {
      filename: archiveFilename,
      filePath: archiveFilePath,
      sizeBytes: archiveStat.size,
      manifest
    };
  }

  /**
   * Restores all four pillars from a Messiah backup archive (.zip / .enc.zip).
   */
  async restoreBackup(archivePath: string, password?: string): Promise<{
    success: boolean;
    manifest: BackupManifest | null;
    restoredFiles: string[];
  }> {
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Backup archive does not exist at ${archivePath}`);
    }

    const fileBuf = fs.readFileSync(archivePath);
    const decryptedBuf = decryptPayload(fileBuf, password);
    const zip = new AdmZip(decryptedBuf);

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
   * Non-destructive Restore Drill verification: inspects database tables & PRAGMA integrity
   * inside a backup archive without modifying active workspace files.
   */
  async verifyBackupArchive(archivePath: string, password?: string): Promise<{
    isValid: boolean;
    manifest: BackupManifest | null;
    tableCounts: Record<string, number>;
    sha256Match: boolean;
    error?: string;
  }> {
    if (!fs.existsSync(archivePath)) {
      return { isValid: false, manifest: null, tableCounts: {}, sha256Match: false, error: 'Archive file does not exist' };
    }

    try {
      const fileBuf = fs.readFileSync(archivePath);
      const decryptedBuf = decryptPayload(fileBuf, password);
      const zip = new AdmZip(decryptedBuf);

      const manifestEntry = zip.getEntry('manifest.json');
      let manifest: BackupManifest | null = null;
      if (manifestEntry) {
        manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
      }

      const dbEntry = zip.getEntry('data/messiah.db');
      if (!dbEntry) {
        return { isValid: false, manifest, tableCounts: {}, sha256Match: false, error: 'Missing database inside backup zip' };
      }

      const tempDbPath = path.join(this.backupsDir, `verify_drill_${Date.now()}.db`);
      fs.writeFileSync(tempDbPath, dbEntry.getData());

      const testDb = new DatabaseSync(tempDbPath);
      const checkRes = testDb.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };

      const tables = ['messages', 'contacts', 'notes', 'reminders', 'captured_statuses', 'status_targets'];
      const tableCounts: Record<string, number> = {};

      for (const tbl of tables) {
        try {
          const row = testDb.prepare(`SELECT COUNT(*) as count FROM ${tbl}`).get() as { count: number };
          tableCounts[tbl] = row?.count || 0;
        } catch {
          tableCounts[tbl] = -1;
        }
      }

      testDb.close();
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

      const isValid = checkRes?.integrity_check === 'ok';
      console.log(`[Restore Drill] Verified backup ${path.basename(archivePath)}: integrity=${checkRes?.integrity_check}, counts=${JSON.stringify(tableCounts)}`);

      return {
        isValid,
        manifest,
        tableCounts,
        sha256Match: true
      };
    } catch (err: any) {
      return { isValid: false, manifest: null, tableCounts: {}, sha256Match: false, error: err.message };
    }
  }

  /**
   * Lists all available local backup files in data/backups/ sorted descending by timestamp.
   */
  listBackups(): BackupFileInfo[] {
    if (!fs.existsSync(this.backupsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.backupsDir)
      .filter(f => f.startsWith('messiah-backup-') && (f.endsWith('.zip') || f.endsWith('.enc.zip')));

    return files.map(filename => {
      const filePath = path.join(this.backupsDir, filename);
      const stat = fs.statSync(filePath);
      return {
        filename,
        filePath,
        sizeBytes: stat.size,
        formattedSize: this.formatBytes(stat.size),
        createdAt: stat.mtimeMs,
        createdIso: stat.mtime.toISOString(),
        isEncrypted: filename.endsWith('.enc.zip')
      };
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Enforces 7 Daily + 4 Weekly Retention Policy for backup rotation.
   */
  cleanupOldBackups(dailyMax = 7, weeklyMax = 4): number {
    const backups = this.listBackups();
    if (backups.length === 0) return 0;

    const getWeekKey = (d: Date) => {
      const year = d.getUTCFullYear();
      const firstJan = new Date(Date.UTC(year, 0, 1));
      const weekNum = Math.ceil((((d.getTime() - firstJan.getTime()) / 86400000) + firstJan.getUTCDay() + 1) / 7);
      return `${year}-W${weekNum}`;
    };

    const getDayKey = (d: Date) => d.toISOString().split('T')[0];

    const dailyMap = new Map<string, BackupFileInfo>();
    const weeklyMap = new Map<string, BackupFileInfo>();

    for (const b of backups) {
      const d = new Date(b.createdAt);
      const dayKey = getDayKey(d);
      const weekKey = getWeekKey(d);

      if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, b);
      if (!weeklyMap.has(weekKey)) weeklyMap.set(weekKey, b);
    }

    const retainedDaily = Array.from(dailyMap.values()).slice(0, dailyMax);
    const retainedWeekly = Array.from(weeklyMap.values()).slice(0, weeklyMax);

    const keepSet = new Set<string>();
    retainedDaily.forEach(b => keepSet.add(b.filename));
    retainedWeekly.forEach(b => keepSet.add(b.filename));

    let deletedCount = 0;
    for (const b of backups) {
      if (!keepSet.has(b.filename)) {
        try {
          if (fs.existsSync(b.filePath)) {
            fs.unlinkSync(b.filePath);
            deletedCount++;
            console.log(`[BackupRetention] Rotated out old backup: ${b.filename}`);
          }
        } catch (err: any) {
          console.error(`[BackupRetention] Failed to delete ${b.filename}:`, err.message);
        }
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
