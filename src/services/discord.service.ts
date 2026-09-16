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
            { name: 'Contact', value: `${details.senderName || 'Unknown'} (${details.senderPhone})`, inline: true },
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
  }): Promise<void> {
    await this.sendWebhook({
      username: 'Messiah Vault (Anti-Revoke)',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/1161/1161388.png',
      embeds: [
        {
          title: '🛡️ Message Revocation Blocked (Anti-Revoke)',
          color: 0xffaa00, // Orange
          description: `A contact attempted to delete this message for everyone:`,
          fields: [
            { name: 'Sender', value: `${details.senderName || 'Unknown'} (${details.senderPhone})`, inline: true },
            { name: 'Sent At', value: new Date(details.timestamp).toLocaleString(), inline: true },
            { name: 'Preserved Content', value: details.messageText || '[Media/Non-text]', inline: false }
          ],
          timestamp: new Date().toISOString()
        }
      ]
    });
  }

  async sendHealthAlert(statusText: string): Promise<void> {
    await this.sendWebhook({
      username: 'Messiah Daemon Monitor',
      content: `⚠️ **Daemon Status Update:** ${statusText}`
    });
  }
}

export const discordService = new DiscordService();
