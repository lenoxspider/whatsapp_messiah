import cron from 'node-cron';
import type { WASocket } from '@whiskeysockets/baileys';
import { reminderRepo } from '../db/repositories/reminder.repo.js';
import { agentTaskRunner } from './agent_task_runner.service.js';
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

    // 1. On startup: re-queue any stale 'claimed' reminders from previous daemon crash
    reminderRepo.requeueStaleClaims();

    // 2. Check for due reminders and due agent tasks every 30 seconds
    cron.schedule('*/30 * * * * *', async () => {
      await this.checkDueReminders();
      const sock = this.socketProvider ? this.socketProvider() : null;
      if (sock) {
        await agentTaskRunner.processDueTasks(sock);
      }
    });

    // 3. Automated Nightly Disaster Recovery Backup at 03:00 AM
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

    console.log('[SchedulerService] Background cron initialized (Reminders: 30s atomic claim, Nightly Backup: 03:00).');
  }

  private async checkDueReminders(): Promise<void> {
    // Atomically claim due reminders (switches status from 'pending' -> 'claimed')
    const now = Date.now();
    const claimedReminders = reminderRepo.claimDueReminders(now);
    if (claimedReminders.length === 0) return;

    const sock = this.socketProvider ? this.socketProvider() : null;

    for (const reminder of claimedReminders) {
      // Always normalize/render localized time at send time from UTC trigger_at timestamp
      const scheduledTimeStr = new Date(reminder.trigger_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const text = `⏰ *REMINDER:* ${reminder.task} _(scheduled for ${scheduledTimeStr})_`;

      if (sock && env.ownerJid) {
        try {
          await sock.sendMessage(env.ownerJid, { text });
          reminderRepo.markSent(reminder.id);
          console.log(`[SchedulerService] Dispatched reminder #${reminder.id} ("${reminder.task}") to owner (${env.ownerJid})`);
        } catch (err: any) {
          console.error(`[SchedulerService] Failed to send reminder #${reminder.id}:`, err.message);
          reminderRepo.markFailed(reminder.id);
        }
      } else {
        // Fallback: Notify Discord if WhatsApp socket is offline, then mark failed for re-queue
        await discordService.sendHealthAlert(`WhatsApp socket offline. Missed reminder #${reminder.id}: "${reminder.task}"`);
        reminderRepo.markFailed(reminder.id);
      }
    }
  }
}

export const schedulerService = new SchedulerService();
