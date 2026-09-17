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

  private deepCheckViewOnce(obj: any, depth = 0): boolean {
    if (!obj || typeof obj !== 'object' || depth > 10) return false;
    if (obj.viewOnce === true || obj.viewOnce === 'true' || obj.viewOnce === 1) return true;
    if (obj.isViewOnce === true) return true;

    for (const key of Object.keys(obj)) {
      if (/viewonce/i.test(key) && Boolean(obj[key])) return true;
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (this.deepCheckViewOnce(obj[key], depth + 1)) return true;
      }
    }
    return false;
  }

  unwrapMessage(msg: WAMessage): { innerMessage: any; isViewOnce: boolean; caption?: string } {
    let m = msg.message;
    let isViewOnce = this.deepCheckViewOnce(m);
    let caption = '';

    // Recursively unwrap up to 12 container levels (handles WhatsApp Business, ephemeral, bot invokes, deviceSent, etc.)
    for (let i = 0; i < 12; i++) {
      if (!m || typeof m !== 'object') break;

      if (m.viewOnceMessage?.message) {
        isViewOnce = true;
        m = m.viewOnceMessage.message;
        continue;
      }
      if (m.viewOnceMessageV2?.message) {
        isViewOnce = true;
        m = m.viewOnceMessageV2.message;
        continue;
      }
      if (m.viewOnceMessageV2Extension?.message) {
        isViewOnce = true;
        m = m.viewOnceMessageV2Extension.message;
        continue;
      }
      if (m.ephemeralMessage?.message) {
        m = m.ephemeralMessage.message;
        continue;
      }
      if (m.documentWithCaptionMessage?.message) {
        m = m.documentWithCaptionMessage.message;
        continue;
      }
      if (m.deviceSentMessage?.message) {
        m = m.deviceSentMessage.message;
        continue;
      }
      if (m.botInvokeMessage?.message) {
        m = m.botInvokeMessage.message;
        continue;
      }
      if (m.associatedChildMessage?.message) {
        m = m.associatedChildMessage.message;
        continue;
      }
      if (m.groupMentionedMessage?.message) {
        m = m.groupMentionedMessage.message;
        continue;
      }
      if (m.editedMessage?.message) {
        m = m.editedMessage.message;
        continue;
      }

      // WhatsApp Business / Interactive messages
      if (m.interactiveMessage) {
        const hdr = m.interactiveMessage.header;
        if (m.interactiveMessage.body?.text) {
          caption = caption || m.interactiveMessage.body.text;
        }
        if (hdr?.imageMessage) {
          m = { imageMessage: hdr.imageMessage };
          continue;
        }
        if (hdr?.videoMessage) {
          m = { videoMessage: hdr.videoMessage };
          continue;
        }
        if (hdr?.documentMessage) {
          m = { documentMessage: hdr.documentMessage };
          continue;
        }
      }

      // WhatsApp Business Template & Button messages
      if (m.templateMessage) {
        const tm = m.templateMessage.hydratedTemplate ||
                   m.templateMessage.fourRowTemplate ||
                   m.templateMessage.hydratedFourRowTemplate;
        if (tm?.imageMessage) {
          m = { imageMessage: tm.imageMessage };
          continue;
        }
        if (tm?.videoMessage) {
          m = { videoMessage: tm.videoMessage };
          continue;
        }
        if (tm?.documentMessage) {
          m = { documentMessage: tm.documentMessage };
          continue;
        }
      }

      if (m.buttonsMessage) {
        if (m.buttonsMessage.imageMessage) {
          m = { imageMessage: m.buttonsMessage.imageMessage };
          continue;
        }
        if (m.buttonsMessage.videoMessage) {
          m = { videoMessage: m.buttonsMessage.videoMessage };
          continue;
        }
        if (m.buttonsMessage.documentMessage) {
          m = { documentMessage: m.buttonsMessage.documentMessage };
          continue;
        }
      }

      break;
    }

    // Check media-level viewOnce flags
    if (
      Boolean(m?.imageMessage?.viewOnce) ||
      Boolean(m?.videoMessage?.viewOnce) ||
      Boolean(m?.audioMessage?.viewOnce) ||
      Boolean((m as any)?.viewOnce)
    ) {
      isViewOnce = true;
    }

    return { innerMessage: m, isViewOnce, caption };
  }

  async extractAndSaveMedia(msg: WAMessage): Promise<ExtractedMedia | null> {
    try {
      const { innerMessage, isViewOnce, caption: unwrappedCaption } = this.unwrapMessage(msg);
      if (!innerMessage) return null;

      let mediaPayload: any =
        innerMessage.imageMessage ||
        innerMessage.videoMessage ||
        innerMessage.audioMessage ||
        innerMessage.documentMessage ||
        innerMessage.stickerMessage;

      let mediaTypeKey: 'imageMessage' | 'videoMessage' | 'audioMessage' | 'documentMessage' | 'stickerMessage' | null = null;
      let downloadType: 'image' | 'video' | 'audio' | 'document' | 'sticker' = 'image';

      if (innerMessage.imageMessage) {
        mediaTypeKey = 'imageMessage';
        downloadType = 'image';
      } else if (innerMessage.videoMessage) {
        mediaTypeKey = 'videoMessage';
        downloadType = 'video';
      } else if (innerMessage.audioMessage) {
        mediaTypeKey = 'audioMessage';
        downloadType = 'audio';
      } else if (innerMessage.documentMessage) {
        mediaTypeKey = 'documentMessage';
        downloadType = 'document';
      } else if (innerMessage.stickerMessage) {
        mediaTypeKey = 'stickerMessage';
        downloadType = 'sticker';
      }

      // Deep search fallback if mediaPayload wasn't on the top level
      if (!mediaPayload && typeof innerMessage === 'object') {
        for (const [key, typeName] of [
          ['imageMessage', 'image'],
          ['videoMessage', 'video'],
          ['audioMessage', 'audio'],
          ['documentMessage', 'document'],
          ['stickerMessage', 'sticker']
        ] as const) {
          if (innerMessage[key]) {
            mediaPayload = innerMessage[key];
            mediaTypeKey = key;
            downloadType = typeName;
            break;
          }
        }
      }

      if (!mediaPayload) return null;

      const rawMime: string = mediaPayload.mimetype || '';
      let ext = 'bin';
      let mimeType = rawMime;

      if (downloadType === 'image') {
        ext = rawMime.includes('png') ? 'png' : 'jpg';
        mimeType = mimeType || 'image/jpeg';
      } else if (downloadType === 'video') {
        ext = 'mp4';
        mimeType = mimeType || 'video/mp4';
      } else if (downloadType === 'audio') {
        ext = 'ogg';
        mimeType = mimeType || 'audio/ogg';
      } else if (downloadType === 'sticker') {
        ext = 'webp';
        mimeType = 'image/webp';
      } else if (downloadType === 'document') {
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

      // 1. Primary download attempt using Baileys downloadMediaMessage
      let buffer: Buffer | null = null;
      try {
        const targetMessage: WAMessage = {
          key: msg.key,
          message: mediaTypeKey ? { [mediaTypeKey]: mediaPayload } : innerMessage,
          messageTimestamp: msg.messageTimestamp
        };

        buffer = (await downloadMediaMessage(
          targetMessage,
          'buffer',
          {},
          {
            logger: pino({ level: 'silent' }) as any,
            reuploadRequest: async (m: any) => m
          }
        )) as Buffer;
      } catch (primaryErr: any) {
        console.warn(`[MediaExtractor] downloadMediaMessage attempt failed for ${msgId} (${primaryErr.message}). Trying direct stream decryption...`);
      }

      // 2. Resilient fallback: direct cryptographic decryption via downloadContentFromMessage
      if (!buffer || buffer.length === 0) {
        try {
          const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
          const stream = await downloadContentFromMessage(mediaPayload, downloadType);
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          if (chunks.length > 0) {
            buffer = Buffer.concat(chunks);
            console.log(`[MediaExtractor] Successfully recovered ${buffer.length} bytes via direct stream decryption for ${msgId}.`);
          }
        } catch (streamErr: any) {
          console.error(`[MediaExtractor] Direct stream decryption also failed for ${msgId}:`, streamErr.message);
        }
      }

      if (!buffer || buffer.length === 0) {
        return null;
      }

      // Save buffer to disk
      await fs.promises.writeFile(filePath, buffer);

      const caption =
        mediaPayload.caption ||
        unwrappedCaption ||
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

  async extractQuotedStatus(quotedMessage: any, stanzaId?: string): Promise<ExtractedMedia | null> {
    if (!quotedMessage) return null;
    const syntheticMsg: WAMessage = {
      key: {
        id: stanzaId || `status_${Date.now()}`,
        remoteJid: 'status@broadcast',
        fromMe: false
      },
      message: quotedMessage,
      messageTimestamp: Math.floor(Date.now() / 1000)
    };
    return await this.extractAndSaveMedia(syntheticMsg);
  }
}

export const mediaExtractor = new MediaExtractor();
