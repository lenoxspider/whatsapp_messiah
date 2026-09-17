import { DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'node:fs';
import { discordService } from '../services/discord.service.js';
import { env } from '../config/env.js';

export interface ReconnectDecision {
  shouldReconnect: boolean;
  reason: string;
}

export function evaluateDisconnect(error: unknown, isRegistered: boolean = false): ReconnectDecision {
  const isBoom = error instanceof Boom;
  const statusCode = isBoom ? error.output.statusCode : undefined;

  switch (statusCode) {
    case DisconnectReason.loggedOut:
      // If never registered, this was just an expired pairing handshake!
      if (!isRegistered) {
        console.log('[Connection] Pairing session timed out. Cleaning stale session and resetting socket...');
        try {
          if (fs.existsSync(env.sessionsDir)) {
            fs.rmSync(env.sessionsDir, { recursive: true, force: true });
            fs.mkdirSync(env.sessionsDir, { recursive: true });
          }
        } catch {}
        return { shouldReconnect: true, reason: 'Pairing reset' };
      }

      discordService.sendHealthAlert('WhatsApp session was logged out or unlinked by Meta. Re-pairing required.');
      console.error('\n[Connection] Device was logged out. Please delete the sessions/ folder and re-pair.\n');
      return { shouldReconnect: false, reason: 'Logged out' };

    case DisconnectReason.connectionClosed:
    case DisconnectReason.connectionLost:
    case DisconnectReason.timedOut:
    case DisconnectReason.restartRequired:
      console.log(`[Connection] Temporary disconnect (${statusCode}). Reconnecting...`);
      return { shouldReconnect: true, reason: 'Temporary drop' };

    case DisconnectReason.connectionReplaced:
      console.warn('[Connection] Connection replaced: another session took over. Halting auto-reconnect to avoid collision.');
      return { shouldReconnect: false, reason: 'Connection replaced' };

    default:
      console.log(`[Connection] Disconnected with status code ${statusCode}. Attempting reconnect.`);
      return { shouldReconnect: true, reason: 'Unknown' };
  }
}
