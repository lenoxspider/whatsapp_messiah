import fs from 'node:fs';
import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { backupService } from '../../../services/backup.service.js';
import { discordService } from '../../../services/discord.service.js';
import { env } from '../../../config/env.js';

export const backupCommand: CommandHandler = {
  name: 'backup',
  description: 'Creates a full zero-downtime VPS migration & disaster recovery archive (.zip)',
  usage: '!backup [optional-label]',

  async execute(ctx: CommandContext): Promise<void> {
    const { sock, message, fullArgs } = ctx;
    const label = fullArgs.trim() || undefined;

    await sock.sendMessage(message.chatJid, {
      text: `⏳ *Initiating Full Disaster Recovery Backup...*\n_Safely snapshotting SQLite WAL, preserving Baileys session keys, and bundling vault media..._`
    });

    try {
      const backupResult = await backupService.createBackup({ label });
      const { filename, filePath, sizeBytes, manifest } = backupResult;
      const formattedSize = backupService.formatBytes(sizeBytes);

      let discordDispatched = false;
      const DISCORD_LIMIT = 25 * 1024 * 1024; // 25MB attachment limit

      if (env.discordWebhookUrl) {
        if (sizeBytes <= DISCORD_LIMIT && fs.existsSync(filePath)) {
          const zipBuffer = fs.readFileSync(filePath);
          const payload = {
            username: 'Messiah Disaster Recovery',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/2885/2885417.png',
            embeds: [
              {
                title: '📦 Full VPS Migration & Disaster Recovery Archive',
                description: 'Point-in-time snapshot completed. Moving this archive to a new VPS guarantees zero-loss migration with **no WhatsApp re-pairing required**.',
                color: 0x00e5ff, // Cyan / Accent Blue
                fields: [
                  { name: 'Archive File', value: `\`${filename}\``, inline: false },
                  { name: 'Total Size', value: formattedSize, inline: true },
                  { name: 'Session Keys', value: `${manifest.sessionFilesCount} keys`, inline: true },
                  { name: 'Vault Media', value: `${manifest.mediaFilesCount} assets`, inline: true },
                  { name: 'Database Snapshot', value: backupService.formatBytes(manifest.databaseSizeBytes), inline: true },
                  { name: 'SHA-256 Checksum', value: `\`${manifest.sha256Checksum?.slice(0, 16)}...\``, inline: false }
                ],
                footer: { text: 'WhatsApp Messiah · Zero-Downtime Migration Engine' },
                timestamp: new Date().toISOString()
              }
            ]
          };

          discordDispatched = await discordService.sendMultipartWebhook(
            payload,
            zipBuffer,
            filename,
            'application/zip'
          );
        } else {
          // File > 25MB: send telemetry alert to Discord without attachment
          await discordService.sendWebhook({
            username: 'Messiah Disaster Recovery',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/2885/2885417.png',
            embeds: [
              {
                title: '📦 Backup Archive Generated (Exceeds Discord 25MB limit)',
                description: `Archive saved locally at \`data/backups/${filename}\`. Download directly from the Web Dashboard.`,
                color: 0xffa500,
                fields: [
                  { name: 'Archive File', value: `\`${filename}\``, inline: false },
                  { name: 'Total Size', value: formattedSize, inline: true },
                  { name: 'Session Keys', value: `${manifest.sessionFilesCount} keys`, inline: true },
                  { name: 'Vault Media', value: `${manifest.mediaFilesCount} assets`, inline: true }
                ],
                timestamp: new Date().toISOString()
              }
            ]
          });
        }
      }

      const responseText = [
        `📦 *MESSIAH BACKUP READY*`,
        ``,
        `• *Archive:* \`${filename}\``,
        `• *Size:* ${formattedSize}`,
        `• *Sessions:* ${manifest.sessionFilesCount} keys preserved _(Zero re-pairing needed)_`,
        `• *Media Vault:* ${manifest.mediaFilesCount} files archived`,
        `• *Discord Delivery:* ${discordDispatched ? '✅ Attached to Discord channel' : (env.discordWebhookUrl ? '⚠️ Telemetry sent (File > 25MB)' : 'Not configured')}`,
        `• *Web Dashboard:* 1-Click download available on Control Plane`,
        ``,
        `💡 _To restore on another VPS, copy this archive and run:_`,
        `\`./scripts/restore.sh ${filename}\``
      ].join('\n');

      await sock.sendMessage(message.chatJid, { text: responseText });
    } catch (err: any) {
      console.error('[BackupCommand] Failed to generate backup:', err);
      await sock.sendMessage(message.chatJid, {
        text: `❌ *Backup Failed:* ${err?.message || 'An unexpected error occurred while creating archive.'}`
      });
    }
  }
};
