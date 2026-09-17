import { Router } from 'express';
import { dashboardState } from '../state.js';
import { systemLogger } from '../logger.js';

export const pairingRouter = Router();

function sanitizePhoneNumber(input: string): string {
  let clean = input.replace(/[^0-9]/g, '');
  // Auto-strip local trunk '0' mistakenly entered after international country codes
  if (/^2330[0-9]{9}$/.test(clean)) {
    clean = '233' + clean.slice(4); // Ghana
  } else if (/^2340[0-9]{10}$/.test(clean)) {
    clean = '234' + clean.slice(4); // Nigeria
  } else if (/^440[0-9]{10}$/.test(clean)) {
    clean = '44' + clean.slice(3);  // UK
  } else if (/^2540[0-9]{9}$/.test(clean)) {
    clean = '254' + clean.slice(4); // Kenya
  } else if (/^270[0-9]{9}$/.test(clean)) {
    clean = '27' + clean.slice(3);  // South Africa
  }
  return clean;
}

pairingRouter.post('/code', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const { phone } = req.body;
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: 'Valid phone number is required.' });
  }

  const cleanPhone = sanitizePhoneNumber(phone);
  if (cleanPhone.length < 8) {
    return res.status(400).json({ error: 'Phone number is too short. Include country code.' });
  }

  systemLogger.audit('PAIRING_CODE_REQUEST', clientIp, `Requested 8-digit pairing code for +${cleanPhone}`);

  if (!dashboardState.requestPairingCodeFn) {
    return res.status(503).json({ error: 'WhatsApp socket is not initialized. Please wait a moment.' });
  }

  // Retry up to 8 times over 24 seconds — the socket reconnects every ~4s after reset.
  // We wait for a fresh connection window before requesting the code.
  const MAX_RETRIES = 8;
  const RETRY_DELAY_MS = 3000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Pairing] Requesting 8-digit pairing code for sanitized phone: +${cleanPhone} (attempt ${attempt}/${MAX_RETRIES})`);
      const code = await dashboardState.requestPairingCodeFn(cleanPhone);
      const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
      dashboardState.setPairingCode(formatted);
      dashboardState.setPairedPhone(cleanPhone);
      return res.json({ success: true, code: formatted });
    } catch (err: any) {
      const errMsg: string = err.message || '';
      const isTransient = errMsg.includes('Connection Closed') || errMsg.includes('Timed Out') || errMsg.includes('Connection Lost');
      console.warn(`[Pairing Route] Attempt ${attempt} failed: ${errMsg}`);

      if (!isTransient || attempt === MAX_RETRIES) {
        return res.status(500).json({
          error: `Failed to get pairing code after ${attempt} attempts: ${errMsg}`
        });
      }

      // Wait for the next reconnection cycle before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
});

pairingRouter.post('/reconnect', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  systemLogger.audit('SOCKET_RECONNECT', clientIp, 'Triggered manual socket reconnection');
  if (dashboardState.reconnectFn) {
    try {
      await dashboardState.reconnectFn();
      return res.json({ success: true, message: 'Reconnection triggered.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.status(503).json({ error: 'Reconnect handler not available.' });
});

pairingRouter.post('/logout', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  systemLogger.audit('DEVICE_LOGOUT', clientIp, 'Triggered session logout and device unlinking');
  if (dashboardState.logoutFn) {
    try {
      await dashboardState.logoutFn();
      return res.json({ success: true, message: 'Device logged out and unlinked.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.status(503).json({ error: 'Logout handler not available.' });
});
