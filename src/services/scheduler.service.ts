import cron from 'node-cron';
import type { WASocket } from '@whiskeysockets/baileys';
import { reminderRepo } from '../db/repositories/reminder.repo.js';
import { env } from '../config/env.js';
import { discordService } from './discord.service.js';
import { backupService } from './backup.service.js';

class SchedulerService {
  private socketProvider: (() => WASocket | null) | null = null;
  private isRunning: boolean = false;

  setSocketProvider(provider: () => WASocket | null): void {
    this.socketProvider = provider;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Check for due reminders every 60 seconds
    cron.schedule('* * * * *', async () => {
      await this.checkDueReminders();
    });

    // Automated Nightly Disaster Recovery Backup at 03:00 AM
    cron.schedule('0 3 * * *', async () => {
      console.log('[SchedulerService] Running scheduled nightly backup...');
      try {
        const result = await backupService.createBackup({ label: 'nightly' });
        console.log(`[SchedulerService] Nightly backup created: ${result.filename} (${backupService.formatBytes(result.sizeBytes)})`);
        if (env.discordWebhookUrl) {
          await discordService.sendWebhook({
            username: 'Messiah Disaster Recovery',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/2885/2885417.png',
            embeds: [
              {
                title: '🌙 Nightly Disaster Recovery Backup Completed',
                description: `Automated 03:00 AM point-in-time snapshot archived safely to \`data/backups/${result.filename}\`.`,
                color: 0x00e5ff,
                fields: [
                  { name: 'Archive', value: `\`${result.filename}\``, inline: false },
                  { name: 'Size', value: backupService.formatBytes(result.sizeBytes), inline: true },
                  { name: 'Sessions', value: `${result.manifest.sessionFilesCount} keys`, inline: true },
                  { name: 'Media Assets', value: `${result.manifest.mediaFilesCount} files`, inline: true }
                ],
                timestamp: new Date().toISOString()
              }
            ]
          });
        }
      } catch (err) {
        console.error('[SchedulerService] Nightly backup failed:', err);
      }
    });

    console.log('[SchedulerService] Background cron initialized (Reminders: 1m, Nightly Backup: 03:00).');
  }

  private async checkDueReminders(): Promise<void> {
    const due = reminderRepo.getDueReminders(Date.now());
    if (due.length === 0) return;

    const sock = this.socketProvider ? this.socketProvider() : null;

    for (const reminder of due) {
      const text = `⏰ *REMINDER:* ${reminder.task}`;

      if (sock && env.ownerJid) {
        try {
          await sock.sendMessage(env.ownerJid, { text });
          reminderRepo.markCompleted(reminder.id);
          console.log(`[SchedulerService] Dispatched reminder #${reminder.id}`);
        } catch (err) {
          console.error(`[SchedulerService] Failed to send reminder #${reminder.id}:`, err);
        }
      } else {
        // Fallback: Notify Discord if WhatsApp socket is offline
        await discordService.sendHealthAlert(`WhatsApp socket offline. Missed reminder: "${reminder.task}"`);
      }
    }
  }
}

export const schedulerService = new SchedulerService();
