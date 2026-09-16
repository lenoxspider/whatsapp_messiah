import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import fs from 'node:fs';
import { env } from '../config/env.js';

export async function initAuthState() {
  if (!fs.existsSync(env.sessionsDir)) {
    fs.mkdirSync(env.sessionsDir, { recursive: true });
  }

  return await useMultiFileAuthState(env.sessionsDir);
}
