import { initializeDatabaseSchema } from './db/schema.js';
import { startWhatsAppSocket, getActiveSocket } from './core/connection.js';
import { routeIncomingMessage } from './engine/router.js';
import { schedulerService } from './services/scheduler.service.js';
import { startDashboardServer } from './server/app.js';
import { env } from './config/env.js';

async function bootstrap() {
  console.log('=============================================================');
  console.log('              WHATSAPP MESSIAH DAEMON STARTING               ');
  console.log('=============================================================');
  console.log(`• Mode: Second Brain + Messiah Ghost-Handler`);
  console.log(`• Pairing Method: ${env.pairingMethod.toUpperCase()}`);
  console.log(`• Database: ${env.databasePath}`);
  console.log(`• OpenAI Configured: ${env.openaiApiKey ? 'YES' : 'NO'}`);
  console.log(`• Discord Webhook Configured: ${env.discordWebhookUrl ? 'YES' : 'NO'}`);
  console.log('=============================================================\n');

  // 1. Initialize SQLite tables & full-text search
  initializeDatabaseSchema();
  console.log('✅ [Database] SQLite schemas initialized.');

  // 2. Start background cron engine
  schedulerService.setSocketProvider(() => getActiveSocket());
  schedulerService.start();

  // 3. Start Web Dashboard control plane
  const port = Number(process.env.PORT) || 3000;
  await startDashboardServer(port);

  // 4. Launch Baileys Multi-Device connection
  await startWhatsAppSocket({
    onReady: (sock) => {
      console.log(`🚀 [Ready] Listening for commands and contact messages.`);
    },
    onMessageUpsert: async (sock, upsert) => {
      await routeIncomingMessage(sock, upsert);
    }
  });
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n[Messiah] Stopping daemon cleanly...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Messiah] Received SIGTERM. Shutting down...');
  process.exit(0);
});

bootstrap().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
