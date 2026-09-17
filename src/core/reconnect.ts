import { DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'node:fs';
import { discordService } from '../services/discord.service.js';
import { env } from '../config/env.js';

export interface ReconnectDecision {
  shouldReconnect: boolean;
  reason: string;
  delayMs?: number;
}

// Track consecutive 428s on unregistered sessions for backoff
let consecutiveRestartRequired = 0;

export function resetRestartCounter() {
  consecutiveRestartRequired = 0;
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
        consecutiveRestartRequired = 0;
        return { shouldReconnect: true, reason: 'Pairing reset', delayMs: 2000 };
      }

      discordService.sendHealthAlert('WhatsApp session was logged out or unlinked by Meta. Re-pairing required.');
      console.error('\n[Connection] Device was logged out. Please delete the sessions/ folder and re-pair.\n');
      return { shouldReconnect: false, reason: 'Logged out' };

    case DisconnectReason.restartRequired:
      if (!isRegistered) {
        // WhatsApp rate-limits unregistered devices with repeated 428s.
        // Apply exponential backoff: 4s, 8s, 16s, 32s max.
        consecutiveRestartRequired++;
        const delayMs = Math.min(4000 * Math.pow(2, consecutiveRestartRequired - 1), 32000);
        if (consecutiveRestartRequired > 2) {
          console.warn(`[Connection] WhatsApp rate-limiting new session (attempt ${consecutiveRestartRequired}). Backing off ${delayMs / 1000}s before retry...`);
        } else {
          console.log(`[Connection] Temporary disconnect (428). Reconnecting in ${delayMs / 1000}s...`);
        }
        return { shouldReconnect: true, reason: 'Temporary drop', delayMs };
      }
      // Registered session: normal reconnect
      consecutiveRestartRequired = 0;
      console.log(`[Connection] Temporary disconnect (428). Reconnecting...`);
      return { shouldReconnect: true, reason: 'Temporary drop', delayMs: 4000 };

    case DisconnectReason.connectionClosed:
    case DisconnectReason.connectionLost:
    case DisconnectReason.timedOut:
      consecutiveRestartRequired = 0;
      console.log(`[Connection] Temporary disconnect (${statusCode}). Reconnecting...`);
      return { shouldReconnect: true, reason: 'Temporary drop', delayMs: 4000 };

    case DisconnectReason.connectionReplaced:
      console.warn('[Connection] Connection replaced: another session took over. Halting auto-reconnect to avoid collision.');
      return { shouldReconnect: false, reason: 'Connection replaced' };

    default:
      console.log(`[Connection] Disconnected with status code ${statusCode}. Attempting reconnect.`);
      return { shouldReconnect: true, reason: 'Unknown', delayMs: 4000 };
  }
}
