import makeWASocket, {
  type WASocket,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { initAuthState } from './auth.js';
import { handlePairing } from './pairing.js';
import { evaluateDisconnect, resetRestartCounter } from './reconnect.js';
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
let presenceInterval: NodeJS.Timeout | null = null;

export function getActiveSocket(): WASocket | null {
  return activeSocket;
}

export async function startWhatsAppSocket(callbacks: ConnectionCallbacks): Promise<WASocket> {
  dashboardState.setStatus('connecting');

  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }

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

  const isAlreadyRegistered = Boolean(state.creds.registered);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    generateHighQualityLinkPreview: true,
    // macOS Desktop enables full View-Once media delivery from WhatsApp servers.
    // However, it causes 428 rejection on UNREGISTERED (fresh) sessions.
    // Solution: use Ubuntu during pairing, switch to macOS Desktop once registered.
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
    markOnlineOnConnect: false,
    getMessage: async (key) => {
      if (key.id) {
        const msg = messageRepo.getMessageById(key.id);
        if (msg?.raw_payload_json) {
          try {
            const parsed = JSON.parse(msg.raw_payload_json);
            return parsed.message || undefined;
          } catch {}
        }
      }
      return undefined;
    }
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
    try {
      sock.end(undefined);
      const sDir = path.resolve(env.sessionsDir);
      if (fs.existsSync(sDir)) {
        fs.rmSync(sDir, { recursive: true, force: true });
      }
      console.log('[Connection] Sessions directory wiped. Ready for fresh pairing.');
    } catch (cleanErr) {
      console.warn('[Session Wipe] Error cleaning sessions dir:', cleanErr);
    }
    dashboardState.setStatus('disconnected', 'Logged out by user');

    // Automatically boot fresh socket so new pairing code can be requested directly on Web UI
    setTimeout(async () => {
      try {
        await startWhatsAppSocket(callbacks);
      } catch (bootErr) {
        console.error('[Connection] Failed to re-boot fresh socket after unlink:', bootErr);
      }
    }, 1000);
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
      if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
      }
      if (activeSocket && activeSocket !== sock) {
        return;
      }
      const decision = evaluateDisconnect(lastDisconnect?.error, isRegistered);
      dashboardState.setStatus('disconnected', decision.reason);
      systemLogger.warn('Connection', `Socket closed: ${decision.reason}. ${decision.shouldReconnect ? 'Reconnecting...' : 'Idle'}`);

      if (decision.shouldReconnect) {
        setTimeout(() => startWhatsAppSocket(callbacks), decision.delayMs ?? 4000);
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
      resetRestartCounter();
      callbacks.onReady(sock);


      // Explicitly advertise available presence so WhatsApp servers deliver View-Once
      // messages rather than unavailable stubs to the companion device.
      sock.sendPresenceUpdate('available').catch(() => {});
      if (presenceInterval) {
        clearInterval(presenceInterval);
      }
      presenceInterval = setInterval(() => {
        if (activeSocket === sock) {
          sock.sendPresenceUpdate('available').catch(() => {});
        }
      }, 60000);
    }
  });

  // Helper to cleanly extract JID, pure phone number (stripping device suffixes), and name
  const extractContactInfo = (item: any): { jid: string; phone: string; name: string | null } | null => {
    if (!item) return null;
    const rawId = item.jid || item.id || '';
    if (!rawId || typeof rawId !== 'string') return null;

    // Ignore group chats, newsletters, broadcasts, statuses
    if (
      rawId.endsWith('@g.us') ||
      rawId.endsWith('@newsletter') ||
      rawId.includes('broadcast') ||
      rawId === 'status@broadcast'
    ) {
      return null;
    }

    // Strip device suffixes like :1 or :12 before extracting digits
    // Example: 233541234567:2@s.whatsapp.net -> 233541234567
    const userPart = rawId.split('@')[0].split(':')[0];
    const digits = userPart.replace(/[^0-9]/g, '');

    if (digits.length >= 7) {
      const jid = `${digits}@s.whatsapp.net`;
      const name = item.name || item.verifiedName || item.notify || null;
      return { jid, phone: digits, name };
    }

    // Handle LID if phone number is attached
    if (rawId.endsWith('@lid') && item.phone) {
      const phoneDigits = String(item.phone).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (phoneDigits.length >= 7) {
        const name = item.name || item.verifiedName || item.notify || null;
        return { jid: `${phoneDigits}@s.whatsapp.net`, phone: phoneDigits, name };
      }
    }

    return null;
  };

  // Contact address book sync loop: Ingest real names and phone numbers saved on phone
  sock.ev.on('messaging-history.set', ({ contacts, chats, syncType, progress }) => {
    let contactCount = 0;
    if (contacts && Array.isArray(contacts)) {
      for (const c of contacts) {
        const info = extractContactInfo(c);
        if (!info) continue;
        contactRepo.upsertContact(info.jid, info.phone, info.name);
        contactCount++;
      }
    }
    if (chats && Array.isArray(chats)) {
      for (const ch of chats) {
        const info = extractContactInfo(ch);
        if (!info) continue;
        contactRepo.upsertContact(info.jid, info.phone, info.name);
        contactCount++;
      }
    }
    const typeLabel = syncType !== undefined ? ` (syncType: ${syncType}, progress: ${progress ?? 'N/A'}%)` : '';
    console.log(`[AddressBook] Ingested/synced ${contactCount} contacts from phone messaging-history${typeLabel}.`);
  });

  sock.ev.on('chats.upsert', (chats) => {
    for (const ch of chats) {
      const info = extractContactInfo(ch);
      if (info) {
        contactRepo.upsertContact(info.jid, info.phone, info.name);
      }
    }
  });

  sock.ev.on('chats.update', (updates) => {
    for (const u of updates) {
      const info = extractContactInfo(u);
      if (info && info.name) {
        contactRepo.upsertContact(info.jid, info.phone, info.name);
      }
    }
  });

  sock.ev.on('contacts.upsert', (contacts) => {
    let count = 0;
    for (const c of contacts) {
      const info = extractContactInfo(c);
      if (info) {
        contactRepo.upsertContact(info.jid, info.phone, info.name);
        count++;
      }
    }
    console.log(`[AddressBook] Ingested/synced ${count} contacts from WhatsApp phone address book.`);
  });

  sock.ev.on('contacts.update', (updates) => {
    for (const u of updates) {
      const info = extractContactInfo(u);
      if (info) {
        contactRepo.upsertContact(info.jid, info.phone, info.name);
      }
    }
  });

  // Modern WhatsApp LID <-> Phone mapping
  sock.ev.on('chats.phoneNumberShare', async ({ lid, jid }) => {
    if (lid && jid) {
      const phone = jid.split('@')[0].replace(/[^0-9]/g, '');
      const existing = contactRepo.getContact(lid);
      if (existing) {
        contactRepo.updateContact(lid, { phone });
      }
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
