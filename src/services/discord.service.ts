import fs from 'node:fs';
import { env } from '../config/env.js';

export class DiscordService {
  async sendWebhook(payload: any): Promise<boolean> {
    if (!env.discordWebhookUrl) {
      return false;
    }

    try {
      const res = await fetch(env.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch (err) {
      console.error('[DiscordService] Failed to dispatch webhook alert:', err);
      return false;
    }
  }

  async sendMultipartWebhook(
    payloadJson: any,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<boolean> {
    if (!env.discordWebhookUrl) {
      return false;
    }

    try {
      // 25MB max size limit for standard Discord webhooks
      if (fileBuffer.length > 25 * 1024 * 1024) {
        console.warn(`[DiscordService] Media file ${fileName} exceeds 25MB, falling back to text telemetry.`);
        return await this.sendWebhook(payloadJson);
      }

      const formData = new FormData();
      formData.append('payload_json', JSON.stringify(payloadJson));

      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append('files[0]', blob, fileName);

      const res = await fetch(env.discordWebhookUrl, {
        method: 'POST',
        body: formData
      });

      return res.ok;
    } catch (err) {
      console.error('[DiscordService] Failed to dispatch multipart webhook:', err);
      return false;
    }
  }

  async sendEscalationAlert(details: {
    senderPhone: string;
    senderName?: string | null;
    tier: number;
    messageText: string;
    reason: string;
  }): Promise<void> {
    await this.sendWebhook({
      username: 'Messiah Sentinel',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
      embeds: [
        {
          title: '🚨 WhatsApp Escalation Triggered',
          color: 0xff3333, // Red
          fields: [
            { name: 'Contact', value: `${details.senderName || 'Unknown'} (+${details.senderPhone})`, inline: true },
            { name: 'Tier', value: `Tier ${details.tier}`, inline: true },
            { name: 'Reason', value: details.reason, inline: false },
            { name: 'Message Content', value: details.messageText || '[Media/Non-text]', inline: false }
          ],
          timestamp: new Date().toISOString()
        }
      ]
    });
  }

  async sendAntiRevokeAlert(details: {
    senderPhone: string;
    senderName?: string | null;
    messageText: string;
    timestamp: number;
    filePath?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
  }): Promise<void> {
    const isImage = details.mimeType?.startsWith('image/');
    const fileName = details.fileName || 'evidence.bin';

    const payload: any = {
      username: 'Messiah Vault (Anti-Revoke)',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/1161/1161388.png',
      embeds: [
        {
          title: '🛡️ Message Revocation Blocked (Anti-Revoke)',
          color: 0xffaa00, // Amber
          description: `A contact attempted to delete this message for everyone:`,
          fields: [
            { name: 'Sender', value: `${details.senderName || 'Unknown'} (+${details.senderPhone})`, inline: true },
            { name: 'Sent At', value: new Date(details.timestamp).toLocaleString(), inline: true },
            { name: 'Preserved Content', value: details.messageText || '[Media Preserved]', inline: false }
          ],
          ...(isImage ? { image: { url: `attachment://${fileName}` } } : {}),
          timestamp: new Date().toISOString()
        }
      ]
    };

    if (details.filePath && fs.existsSync(details.filePath)) {
      try {
        const buffer = await fs.promises.readFile(details.filePath);
        await this.sendMultipartWebhook(payload, buffer, fileName, details.mimeType || 'application/octet-stream');
        return;
      } catch (err) {
        console.error('[DiscordService] Failed to read media for anti-revoke alert:', err);
      }
    }

    await this.sendWebhook(payload);
  }

  async sendViewOnceAlert(details: {
    senderPhone: string;
    senderName?: string | null;
    caption?: string;
    timestamp: number;
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<void> {
    const isImage = details.mimeType.startsWith('image/');
    const isAudio = details.mimeType.startsWith('audio/');

    const payload: any = {
      username: 'Messiah Interceptor (Anti-ViewOnce)',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/2875/2875394.png',
      embeds: [
        {
          title: '👁️ Ephemeral View-Once Captured & Preserved',
          color: 0x7f77dd, // Purple
          description: `A contact sent an ephemeral View-Once media message. Messiah has permanently decrypted and stored it.`,
          fields: [
            { name: 'Sender', value: `${details.senderName || 'Unknown'} (+${details.senderPhone})`, inline: true },
            { name: 'Media Type', value: isImage ? '🖼️ Photo' : (isAudio ? '🎙️ Voice Note' : '📹 Video/File'), inline: true },
            { name: 'Caption', value: details.caption || '[No caption]', inline: false }
          ],
          ...(isImage ? { image: { url: `attachment://${details.fileName}` } } : {}),
          timestamp: new Date().toISOString()
        }
      ]
    };

    await this.sendMultipartWebhook(payload, details.buffer, details.fileName, details.mimeType);
  }

  async sendIncomingMediaAlert(details: {
    senderPhone: string;
    senderName?: string | null;
    caption?: string;
    timestamp: number;
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<void> {
    const isImage = details.mimeType.startsWith('image/');
    const isAudio = details.mimeType.startsWith('audio/');
    const isVideo = details.mimeType.startsWith('video/');

    const payload: any = {
      username: 'Messiah Sentinel (Media Telemetry)',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/3342/3342137.png',
      embeds: [
        {
          title: `📥 Inbound ${isImage ? 'Photo' : (isAudio ? 'Voice Note' : (isVideo ? 'Video' : 'Document'))} Captured`,
          color: 0x1d9e75, // Green
          description: `Captured media received and archived from contact.`,
          fields: [
            { name: 'Sender', value: `${details.senderName || 'Unknown'} (+${details.senderPhone})`, inline: true },
            { name: 'Media Type', value: isImage ? '🖼️ Photo' : (isAudio ? '🎙️ Audio' : (isVideo ? '📹 Video' : '📎 Document')), inline: true },
            { name: 'Caption', value: details.caption || '[No caption]', inline: false }
          ],
          ...(isImage ? { image: { url: `attachment://${details.fileName}` } } : {}),
          timestamp: new Date().toISOString()
        }
      ]
    };

    await this.sendMultipartWebhook(payload, details.buffer, details.fileName, details.mimeType);
  }

  async sendCallAlert(details: {
    callerPhone: string;
    callerName?: string | null;
    isVideo: boolean;
    timestamp: number;
    actionTaken: string;
  }): Promise<void> {
    await this.sendWebhook({
      username: 'Messiah Sentinel (Call Rejecter)',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/3616/3616223.png',
      embeds: [
        {
          title: `📞 Inbound WhatsApp ${details.isVideo ? 'Video' : 'Voice'} Call ${details.actionTaken === 'rejected' ? 'Blocked' : 'Detected'}`,
          color: 0xd85a30, // Coral
          fields: [
            { name: 'Caller', value: `${details.callerName || 'Unknown'} (+${details.callerPhone})`, inline: true },
            { name: 'Call Type', value: details.isVideo ? '📹 Video Call' : '📞 Voice Call', inline: true },
            { name: 'Action Taken', value: details.actionTaken.toUpperCase(), inline: true },
            { name: 'Timestamp', value: new Date(details.timestamp).toLocaleString(), inline: false }
          ],
          timestamp: new Date().toISOString()
        }
      ]
    });
  }

  async sendStatusStealAlert(details: {
    contactPhone: string;
    contactName?: string | null;
    caption?: string;
    textContent?: string;
    timestamp: number;
    buffer?: Buffer | null;
    fileName?: string | null;
    mimeType?: string | null;
  }): Promise<boolean> {
    const hasMedia = Boolean(details.buffer && details.fileName && details.mimeType);
    const isImage = Boolean(details.mimeType?.startsWith('image/'));
    const isVideo = Boolean(details.mimeType?.startsWith('video/'));
    const isAudio = Boolean(details.mimeType?.startsWith('audio/'));

    const typeLabel = isImage ? '🖼️ Photo Status' : isVideo ? '📹 Video Status' : isAudio ? '🎙️ Audio Status' : '📝 Text Status';

    const payload: any = {
      username: 'Messiah Status Stealer (Ghost Capture)',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/3281/3281329.png',
      embeds: [
        {
          title: '🌫️ WhatsApp Status Exfiltrated & Captured',
          color: 0x38bdf8, // Sky Blue
          description: `Captured contact status update via Ghost Stealer.`,
          fields: [
            { name: 'Contact', value: `${details.contactName || 'Unknown'} (+${details.contactPhone})`, inline: true },
            { name: 'Type', value: typeLabel, inline: true },
            { name: 'Posted At', value: new Date(details.timestamp).toLocaleString(), inline: true },
            ...(details.caption ? [{ name: 'Caption', value: details.caption, inline: false }] : []),
            ...(details.textContent ? [{ name: 'Status Content', value: details.textContent, inline: false }] : [])
          ],
          ...(isImage && details.fileName ? { image: { url: `attachment://${details.fileName}` } } : {}),
          timestamp: new Date().toISOString()
        }
      ]
    };

    if (hasMedia && details.buffer && details.fileName && details.mimeType) {
      return await this.sendMultipartWebhook(payload, details.buffer, details.fileName, details.mimeType);
    } else {
      return await this.sendWebhook(payload);
    }
  }

  async sendHealthAlert(statusText: string): Promise<void> {
    await this.sendWebhook({
      username: 'Messiah Daemon Monitor',
      content: `⚠️ **Daemon Status Update:** ${statusText}`
    });
  }
}

export const discordService = new DiscordService();

