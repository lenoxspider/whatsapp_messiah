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
  typingSpeedMs: number;
  maxTypingDelayMs: number;
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
  const typingSpeedMs = Number(process.env.TYPING_SPEED_MS) || 45;
  const maxTypingDelayMs = Number(process.env.MAX_TYPING_DELAY_MS) || 8000;

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
    typingSpeedMs,
    maxTypingDelayMs
  };
}

export const env = parseEnv();
