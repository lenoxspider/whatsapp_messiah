import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export interface AppConfig {
  pairingMethod: 'code' | 'qr';
  phoneNumber: string;
  ownerJid: string;
  databasePath: string;
  sessionsDir: string;
  openaiApiKey: string;
  openaiModel: string;
  discordWebhookUrl: string;
  ghostHandlerEnabled: boolean;
  autonomousGhost: boolean;
  dashboardPassword: string;
  typingSpeedMs: number;
  maxTypingDelayMs: number;
  autoRejectCalls: boolean;
  forwardMediaToDiscord: boolean;
  statusStealerTrigger: string;
  statusStealerAutoDelete: boolean;
  statusStealerDiscord: boolean;
}

function parseEnv(): AppConfig {
  const pairingMethod = (process.env.PAIRING_METHOD?.toLowerCase() === 'qr') ? 'qr' : 'code';
  const phoneNumber = (process.env.PHONE_NUMBER || '').replace(/[^0-9]/g, '');
  const ownerJid = process.env.OWNER_JID || (phoneNumber ? `${phoneNumber}@s.whatsapp.net` : '');
  const databasePath = process.env.DATABASE_PATH || './data/messiah.db';
  const sessionsDir = process.env.SESSIONS_DIR || './sessions';
  const openaiApiKey = process.env.OPENAI_API_KEY || '';
  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
  const ghostHandlerEnabled = process.env.GHOST_HANDLER_ENABLED !== '0';
  const autonomousGhost = process.env.AUTONOMOUS_GHOST === '1' || process.env.AUTONOMOUS_GHOST === 'true';
  const dashboardPassword = process.env.DASHBOARD_PASSWORD || '';
  const typingSpeedMs = Number(process.env.TYPING_SPEED_MS) || 45;
  const maxTypingDelayMs = Number(process.env.MAX_TYPING_DELAY_MS) || 8000;
  const autoRejectCalls = process.env.AUTO_REJECT_CALLS !== '0' && process.env.AUTO_REJECT_CALLS !== 'false';
  const forwardMediaToDiscord = process.env.FORWARD_MEDIA_TO_DISCORD !== '0' && process.env.FORWARD_MEDIA_TO_DISCORD !== 'false';
  const statusStealerTrigger = process.env.STATUS_STEALER_TRIGGER || '!😶🌫️';
  const statusStealerAutoDelete = process.env.STATUS_STEALER_AUTO_DELETE !== '0' && process.env.STATUS_STEALER_AUTO_DELETE !== 'false';
  const statusStealerDiscord = process.env.STATUS_STEALER_DISCORD !== '0' && process.env.STATUS_STEALER_DISCORD !== 'false';

  return {
    pairingMethod,
    phoneNumber,
    ownerJid,
    databasePath: path.resolve(databasePath),
    sessionsDir: path.resolve(sessionsDir),
    openaiApiKey,
    openaiModel,
    discordWebhookUrl,
    ghostHandlerEnabled,
    autonomousGhost,
    dashboardPassword,
    typingSpeedMs,
    maxTypingDelayMs,
    autoRejectCalls,
    forwardMediaToDiscord,
    statusStealerTrigger,
    statusStealerAutoDelete,
    statusStealerDiscord
  };
}

export const env = parseEnv();
