import makeWASocket, {
  type WASocket,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { initAuthState } from './auth.js';
import { handlePairing } from './pairing.js';
import { evaluateDisconnect } from './reconnect.js';

export interface ConnectionCallbacks {
  onMessageUpsert: (sock: WASocket, upsert: any) => Promise<void>;
  onReady: (sock: WASocket) => void;
}

let activeSocket: WASocket | null = null;

export function getActiveSocket(): WASocket | null {
  return activeSocket;
}

export async function startWhatsAppSocket(callbacks: ConnectionCallbacks): Promise<WASocket> {
  const { state, saveCreds } = await initAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false, // Handled custom in pairing.ts
    auth: state,
    generateHighQualityLinkPreview: true,
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  activeSocket = sock;

  // Persist credentials whenever updated
  sock.ev.on('creds.update', saveCreds);

  // Connection state events
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    // Handle QR code or 8-digit pairing code
    await handlePairing(sock, update, !!state.creds.registered);

    if (connection === 'close') {
      const decision = evaluateDisconnect(lastDisconnect?.error);
      if (decision.shouldReconnect) {
        setTimeout(() => startWhatsAppSocket(callbacks), 5000);
      }
    } else if (connection === 'open') {
      console.log('\n✅ [Connection] WhatsApp Messiah is connected and listening.');
      callbacks.onReady(sock);
    }
  });

  // Message event loop
  sock.ev.on('messages.upsert', async (upsert) => {
    try {
      await callbacks.onMessageUpsert(sock, upsert);
    } catch (err) {
      console.error('[Connection] Error handling messages.upsert:', err);
    }
  });

  return sock;
}
