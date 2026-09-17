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

// Reconnect counters & circuit breaker state
let consecutiveFailures = 0;
let consecutiveReplaced = 0;
const MAX_CIRCUIT_BREAKER_FAILURES = 10;

export function resetRestartCounter() {
  consecutiveFailures = 0;
  consecutiveReplaced = 0;
}

export function evaluateDisconnect(error: unknown, isRegistered: boolean = false): ReconnectDecision {
  const isBoom = error instanceof Boom;
  const statusCode = isBoom ? error.output.statusCode : undefined;

  consecutiveFailures++;

  // Circuit Breaker: If 10 consecutive connection attempts fail without a successful connection, halt.
  if (consecutiveFailures > MAX_CIRCUIT_BREAKER_FAILURES) {
    console.error(`\n🚨 [Circuit Breaker] Reconnected ${consecutiveFailures} times without success. Halting auto-reconnect to prevent ban loops.\n`);
    discordService.sendHealthAlert(`Circuit Breaker Tripped: Failed to reconnect after ${consecutiveFailures} attempts. Auto-reconnect halted.`);
    return { shouldReconnect: false, reason: 'Circuit Breaker Tripped' };
  }

  switch (statusCode) {
    case DisconnectReason.loggedOut:
    case 401:
      // If never registered, this was an expired pairing handshake!
      if (!isRegistered) {
        console.log('[Connection] Pairing session timed out. Resetting session...');
        try {
          if (fs.existsSync(env.sessionsDir)) {
            fs.rmSync(env.sessionsDir, { recursive: true, force: true });
            fs.mkdirSync(env.sessionsDir, { recursive: true });
          }
        } catch {}
        consecutiveFailures = 0;
        return { shouldReconnect: true, reason: 'Pairing reset', delayMs: 2000 };
      }

      // Terminal 401 logged out state: HALT immediately to prevent account ban
      discordService.sendHealthAlert('WhatsApp session was logged out or unlinked by Meta. Auto-reconnect HALTED.');
      console.error('\n🚫 [Connection] Device was logged out (401). Auto-reconnect halted to prevent account flag. Please re-pair.\n');
      return { shouldReconnect: false, reason: 'Logged out (Terminal)' };

    case DisconnectReason.connectionReplaced:
    case 440:
      consecutiveReplaced++;
      if (consecutiveReplaced > 1) {
        console.warn('⚠️ [Connection] Connection replaced again by another active session. Halting auto-reconnect.');
        discordService.sendHealthAlert('WhatsApp connection replaced by another device session. Auto-reconnect halted.');
        return { shouldReconnect: false, reason: 'Connection replaced (Collision)' };
      }
      console.warn('⚠️ [Connection] Connection replaced: another session connected. Attempting single retry in 5s...');
      return { shouldReconnect: true, reason: 'Connection replaced', delayMs: 5000 };

    case DisconnectReason.restartRequired:
    case 428:
    case 515: // Stream / Experimental Error
    case DisconnectReason.timedOut:
    case DisconnectReason.connectionLost:
    case DisconnectReason.connectionClosed: {
      // Exponential backoff with random jitter (base 3s, max 30s)
      const baseDelay = Math.min(3000 * Math.pow(1.5, Math.min(consecutiveFailures - 1, 6)), 30000);
      const jitter = Math.floor(baseDelay * (0.8 + Math.random() * 0.4)); // +/- 20% jitter

      console.log(`[Connection] Temporary disconnect (${statusCode || 'drop'}). Reconnecting in ${(jitter / 1000).toFixed(1)}s (Attempt ${consecutiveFailures}/${MAX_CIRCUIT_BREAKER_FAILURES})...`);
      return { shouldReconnect: true, reason: 'Temporary drop', delayMs: jitter };
    }

    default: {
      const delayMs = Math.min(4000 * consecutiveFailures, 20000);
      console.log(`[Connection] Disconnected with status code ${statusCode}. Reconnecting in ${delayMs / 1000}s...`);
      return { shouldReconnect: true, reason: `Status Code ${statusCode}`, delayMs };
    }
  }
}
