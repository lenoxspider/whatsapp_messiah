import makeWASocket, {
  type WASocket,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { initAuthState } from './auth.js';
import { handlePairing } from './pairing.js';
import { evaluateDisconnect } from './reconnect.js';
import { dashboardState } from '../server/state.js';

export interface ConnectionCallbacks {
  onMessageUpsert: (sock: WASocket, upsert: any) => Promise<void>;
  onReady: (sock: WASocket) => void;
}

let activeSocket: WASocket | null = null;

export function getActiveSocket(): WASocket | null {
  return activeSocket;
}

export async function startWhatsAppSocket(callbacks: ConnectionCallbacks): Promise<WASocket> {
  dashboardState.setStatus('connecting');

  const { state, saveCreds } = await initAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    generateHighQualityLinkPreview: true,
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  activeSocket = sock;

  // Provide socket triggers to dashboard with auto-recovery
  dashboardState.requestPairingCodeFn = async (phone: string) => {
    // If WebSocket is closed or in a bad state, start a fresh socket
    const ws = sock.ws as any;
    if (!ws || (ws.isOpen !== undefined && !ws.isOpen)) {
      console.log('[Pairing] Socket was closed. Booting fresh connection for pairing...');
      const freshSock = await startWhatsAppSocket(callbacks);
      // Wait for socket handshake (max 4s)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3500);
        freshSock.ev.on('connection.update', (u) => {
          if (u.qr || (freshSock.ws as any)?.isOpen) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      return await freshSock.requestPairingCode(phone);
    }

    return await sock.requestPairingCode(phone);
  };

  dashboardState.reconnectFn = async () => {
    try {
      sock.end(undefined);
    } catch {}
    await startWhatsAppSocket(callbacks);
  };

  dashboardState.logoutFn = async () => {
    try {
      await sock.logout();
    } catch {}
    dashboardState.setStatus('disconnected', 'Logged out by user');
  };

  // Persist credentials whenever updated
  sock.ev.on('creds.update', saveCreds);

  // Connection state events
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    // Handle QR code or 8-digit pairing code
    await handlePairing(sock, update, !!state.creds.registered);

    if (connection === 'close') {
      const decision = evaluateDisconnect(lastDisconnect?.error, !!state.creds.registered);
      dashboardState.setStatus('disconnected', decision.reason);

      if (decision.shouldReconnect) {
        setTimeout(() => startWhatsAppSocket(callbacks), 4000);
      }
    } else if (connection === 'open') {
      console.log('\n✅ [Connection] WhatsApp Messiah is connected and listening.');
      const phone = sock.user?.id?.split(':')[0] || null;
      dashboardState.setStatus('connected');
      dashboardState.setPairedPhone(phone);
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
