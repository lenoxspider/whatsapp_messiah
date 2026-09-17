import makeWASocket, {
  type WASocket,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { initAuthState } from './auth.js';
import { handlePairing } from './pairing.js';
import { evaluateDisconnect } from './reconnect.js';
import { dashboardState } from '../server/state.js';
import { systemLogger } from '../server/logger.js';
import { env } from '../config/env.js';
import { messageRepo } from '../db/repositories/message.repo.js';
import { contactRepo } from '../db/repositories/contact.repo.js';
import { discordService } from '../services/discord.service.js';

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

  if (activeSocket) {
    try {
      activeSocket.ev.removeAllListeners('connection.update');
      activeSocket.ev.removeAllListeners('creds.update');
      activeSocket.ev.removeAllListeners('messages.upsert');
      activeSocket.end(undefined);
    } catch {}
    activeSocket = null;
  }

  const { state, saveCreds } = await initAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    generateHighQualityLinkPreview: true,
    browser: Browsers.ubuntu('Chrome')
  });

  activeSocket = sock;

  // Provide direct socket triggers to dashboard
  dashboardState.requestPairingCodeFn = async (phone: string) => {
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
    const isRegistered = Boolean(state.creds.registered);

    // Handle QR code
    await handlePairing(sock, update, isRegistered);

    if (connection === 'close') {
      const decision = evaluateDisconnect(lastDisconnect?.error, isRegistered);
      dashboardState.setStatus('disconnected', decision.reason);
      systemLogger.warn('Connection', `Socket closed: ${decision.reason}. ${decision.shouldReconnect ? 'Reconnecting...' : 'Idle'}`);

      if (decision.shouldReconnect) {
        setTimeout(() => startWhatsAppSocket(callbacks), 4000);
      }
    } else if (connection === 'open') {
      state.creds.registered = true;
      const phone = sock.user?.id?.split(':')[0]?.replace(/[^0-9]/g, '') || null;
      if (phone) {
        env.phoneNumber = phone;
        env.ownerJid = `${phone}@s.whatsapp.net`;
        dashboardState.setPairedPhone(phone);
        console.log(`\n✅ [Connection] Connected as Owner: +${phone} (${env.ownerJid})`);
        systemLogger.success('Connection', `Connected as Owner +${phone}`);
      } else {
        console.log('\n✅ [Connection] WhatsApp Messiah is connected and listening.');
        systemLogger.success('Connection', 'WhatsApp Messiah connected and listening.');
      }
      dashboardState.setStatus('connected');
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

  // Stealth Call Rejection & Telemetry loop
  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status === 'offer') {
        const callerPhone = call.from.split('@')[0];
        const isVideo = Boolean(call.isVideo);
        const timestamp = Number(call.date) * 1000 || Date.now();

        console.log(`[Call Inbound] Incoming ${isVideo ? 'video' : 'voice'} call from +${callerPhone}`);

        if (env.autoRejectCalls) {
          try {
            await sock.rejectCall(call.id, call.from);
            console.log(`[Call Rejecter] Silently declined call ${call.id} from +${callerPhone}`);
          } catch (err: any) {
            console.warn(`[Call Rejecter] Failed to decline call: ${err.message}`);
          }

          messageRepo.saveCall({
            id: call.id,
            callerJid: call.from,
            isVideo,
            timestamp,
            actionTaken: 'rejected'
          });

          const contact = contactRepo.getContact(call.from);
          await discordService.sendCallAlert({
            callerPhone,
            callerName: contact?.name || null,
            isVideo,
            timestamp,
            actionTaken: 'rejected'
          });
        }
      }
    }
  });

  return sock;
}
