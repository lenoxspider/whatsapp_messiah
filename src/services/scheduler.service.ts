import cron from 'node-cron';
import type { WASocket } from '@whiskeysockets/baileys';
import { reminderRepo } from '../db/repositories/reminder.repo.js';
import { env } from '../config/env.js';
import { discordService } from './discord.service.js';

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

    console.log('[SchedulerService] Background cron initialized.');
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
