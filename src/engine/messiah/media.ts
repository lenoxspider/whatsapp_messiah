import fs from 'node:fs';
import path from 'node:path';
import { downloadMediaMessage, type WAMessage } from '@whiskeysockets/baileys';
import pino from 'pino';

const MEDIA_DIR = path.resolve(process.cwd(), 'data', 'media');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

export interface ExtractedMedia {
  filePath: string;
  fileName: string;
  mimeType: string;
  isViewOnce: boolean;
  buffer: Buffer;
  caption?: string;
}

export class MediaExtractor {
  getMediaDir(): string {
    return MEDIA_DIR;
  }

  isViewOnceMessage(msg: WAMessage): boolean {
    const { isViewOnce } = this.unwrapMessage(msg);
    return isViewOnce;
  }

  unwrapMessage(msg: WAMessage): { innerMessage: any; isViewOnce: boolean } {
    let m = msg.message;
    let isViewOnce = false;

    if (m?.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
    }

    if (m?.viewOnceMessage?.message) {
      isViewOnce = true;
      m = m.viewOnceMessage.message;
    } else if (m?.viewOnceMessageV2?.message) {
      isViewOnce = true;
      m = m.viewOnceMessageV2.message;
    } else if (m?.viewOnceMessageV2Extension?.message) {
      isViewOnce = true;
      m = m.viewOnceMessageV2Extension.message;
    }

    if (m?.documentWithCaptionMessage?.message) {
      m = m.documentWithCaptionMessage.message;
    }

    // Modern WhatsApp flags viewOnce inside imageMessage, videoMessage, audioMessage
    if (
      Boolean(m?.imageMessage?.viewOnce) ||
      Boolean(m?.videoMessage?.viewOnce) ||
      Boolean(m?.audioMessage?.viewOnce) ||
      Boolean((m as any)?.viewOnce)
    ) {
      isViewOnce = true;
    }

    return { innerMessage: m, isViewOnce };
  }

  async extractAndSaveMedia(msg: WAMessage): Promise<ExtractedMedia | null> {
    try {
      const { innerMessage, isViewOnce } = this.unwrapMessage(msg);
      if (!innerMessage) return null;

      const mediaPayload =
        innerMessage.imageMessage ||
        innerMessage.videoMessage ||
        innerMessage.audioMessage ||
        innerMessage.documentMessage ||
        innerMessage.stickerMessage;

      if (!mediaPayload) return null;

      const rawMime: string = mediaPayload.mimetype || '';
      let ext = 'bin';
      let mimeType = rawMime;

      if (innerMessage.imageMessage) {
        ext = rawMime.includes('png') ? 'png' : 'jpg';
        mimeType = mimeType || 'image/jpeg';
      } else if (innerMessage.videoMessage) {
        ext = 'mp4';
        mimeType = mimeType || 'video/mp4';
      } else if (innerMessage.audioMessage) {
        ext = 'ogg';
        mimeType = mimeType || 'audio/ogg';
      } else if (innerMessage.stickerMessage) {
        ext = 'webp';
        mimeType = 'image/webp';
      } else if (innerMessage.documentMessage) {
        const originalName = mediaPayload.fileName || '';
        if (originalName.includes('.')) {
          ext = originalName.split('.').pop() || 'bin';
        } else if (rawMime.includes('pdf')) {
          ext = 'pdf';
        }
      }

      const msgId = msg.key.id || `media_${Date.now()}`;
      const fileName = `${msgId}.${ext}`;
      const filePath = path.join(MEDIA_DIR, fileName);

      // Construct a synthetic WAMessage targeting the extracted inner message for Baileys
      const targetMessage: WAMessage = {
        key: msg.key,
        message: innerMessage,
        messageTimestamp: msg.messageTimestamp
      };

      const buffer = (await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        {
          logger: pino({ level: 'silent' }) as any,
          reuploadRequest: async (m: any) => m
        }
      )) as Buffer;

      if (!buffer || buffer.length === 0) {
        return null;
      }

      // Save buffer to disk
      await fs.promises.writeFile(filePath, buffer);

      const caption =
        innerMessage.imageMessage?.caption ||
        innerMessage.videoMessage?.caption ||
        innerMessage.documentMessage?.caption ||
        undefined;

      return {
        filePath,
        fileName,
        mimeType,
        isViewOnce,
        buffer,
        caption
      };
    } catch (err: any) {
      console.warn(`[MediaExtractor] Failed to download media for ${msg.key.id}: ${err.message}`);
      return null;
    }
  }
}

export const mediaExtractor = new MediaExtractor();
