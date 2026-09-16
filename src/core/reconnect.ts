import { DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { discordService } from '../services/discord.service.js';

export interface ReconnectDecision {
  shouldReconnect: boolean;
  reason: string;
}

export function evaluateDisconnect(error: unknown): ReconnectDecision {
  const isBoom = error instanceof Boom;
  const statusCode = isBoom ? error.output.statusCode : undefined;

  switch (statusCode) {
    case DisconnectReason.loggedOut:
      discordService.sendHealthAlert('WhatsApp session was logged out or unlinked by Meta. Re-pairing required.');
      console.error('\n[Connection] Device was logged out. Please delete the sessions/ folder and re-pair.\n');
      return { shouldReconnect: false, reason: 'Logged out' };

    case DisconnectReason.connectionClosed:
    case DisconnectReason.connectionLost:
    case DisconnectReason.timedOut:
    case DisconnectReason.restartRequired:
      console.log(`[Connection] Temporary disconnect (${statusCode}). Reconnecting...`);
      return { shouldReconnect: true, reason: 'Temporary drop' };

    default:
      console.log(`[Connection] Disconnected with status code ${statusCode}. Attempting reconnect.`);
      return { shouldReconnect: true, reason: 'Unknown' };
  }
}
