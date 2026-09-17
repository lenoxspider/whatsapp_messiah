import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { mediaExtractor } from '../../engine/messiah/media.js';

export const mediaRouter = Router();

mediaRouter.get('/:filename', (req, res) => {
  const fileName = req.params.filename;
  // Security check: prevent path traversal
  const safeName = path.basename(fileName);
  const mediaDir = mediaExtractor.getMediaDir();
  const filePath = path.join(mediaDir, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Media file not found' });
  }

  // Determine content type by extension
  const ext = path.extname(safeName).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf'
  };

  const contentType = mimeMap[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24h

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});
