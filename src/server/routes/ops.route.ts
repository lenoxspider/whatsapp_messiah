import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { backupService } from '../../services/backup.service.js';

export const opsRouter = express.Router();

const uploadsDir = path.resolve('data', 'backups', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max archive upload
});

// 1. List available local backups
opsRouter.get('/backups', (req, res) => {
  try {
    const backups = backupService.listBackups();
    res.json({ success: true, backups });
  } catch (err: any) {
    console.error('[OpsRoute] Failed to list backups:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Generate a new backup archive
opsRouter.post('/backups/generate', async (req, res) => {
  try {
    const { label, includeMedia } = req.body || {};
    const result = await backupService.createBackup({
      label: typeof label === 'string' ? label : undefined,
      includeMedia: includeMedia !== false
    });

    res.json({
      success: true,
      backup: {
        filename: result.filename,
        sizeBytes: result.sizeBytes,
        formattedSize: backupService.formatBytes(result.sizeBytes),
        manifest: result.manifest
      }
    });
  } catch (err: any) {
    console.error('[OpsRoute] Failed to generate backup:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Download a backup archive
opsRouter.get('/backups/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    // Security check: strictly match valid backup filename format
    if (!/^[a-zA-Z0-9._-]+$/.test(filename) || !filename.endsWith('.zip')) {
      return res.status(400).json({ success: false, error: 'Invalid archive filename.' });
    }

    const filePath = path.resolve('data', 'backups', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Backup archive not found.' });
    }

    res.download(filePath, filename);
  } catch (err: any) {
    console.error('[OpsRoute] Download error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Restore from uploaded backup archive
opsRouter.post('/backups/restore', upload.single('backup'), async (req, res) => {
  const uploadedFile = req.file;
  if (!uploadedFile) {
    return res.status(400).json({ success: false, error: 'No backup file uploaded.' });
  }

  try {
    const result = await backupService.restoreBackup(uploadedFile.path);

    // Clean up uploaded temp file
    if (fs.existsSync(uploadedFile.path)) {
      try { fs.unlinkSync(uploadedFile.path); } catch {}
    }

    res.json({
      success: true,
      message: 'Restore completed successfully. All database records and WhatsApp session keys restored.',
      restoredFilesCount: result.restoredFiles.length,
      manifest: result.manifest
    });
  } catch (err: any) {
    console.error('[OpsRoute] Restore error:', err);
    if (fs.existsSync(uploadedFile.path)) {
      try { fs.unlinkSync(uploadedFile.path); } catch {}
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Delete an old backup archive
opsRouter.delete('/backups/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9._-]+$/.test(filename) || !filename.endsWith('.zip')) {
      return res.status(400).json({ success: false, error: 'Invalid archive filename.' });
    }

    const filePath = path.resolve('data', 'backups', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return res.json({ success: true, message: `Backup ${filename} deleted.` });
    } else {
      return res.status(404).json({ success: false, error: 'Backup not found.' });
    }
  } catch (err: any) {
    console.error('[OpsRoute] Delete backup error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
