import { Router } from 'express';
import { dashboardState } from '../state.js';

export const pairingRouter = Router();

pairingRouter.post('/code', async (req, res) => {
  const { phone } = req.body;
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: 'Valid phone number is required.' });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length < 8) {
    return res.status(400).json({ error: 'Phone number is too short. Include country code.' });
  }

  if (!dashboardState.requestPairingCodeFn) {
    return res.status(503).json({ error: 'WhatsApp socket is not initialized. Please wait a moment.' });
  }

  try {
    const code = await dashboardState.requestPairingCodeFn(cleanPhone);
    const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
    dashboardState.setPairingCode(formatted);
    dashboardState.setPairedPhone(cleanPhone);

    res.json({ success: true, code: formatted });
  } catch (err: any) {
    console.warn('[Pairing Route] First attempt error:', err.message);

    // If connection was closed or dropped, retry once after a short reset
    try {
      if (dashboardState.reconnectFn) {
        await dashboardState.reconnectFn();
        await new Promise((r) => setTimeout(r, 4000));
        if (dashboardState.requestPairingCodeFn) {
          const retryCode = await dashboardState.requestPairingCodeFn(cleanPhone);
          const formatted = retryCode?.match(/.{1,4}/g)?.join('-') || retryCode;
          dashboardState.setPairingCode(formatted);
          dashboardState.setPairedPhone(cleanPhone);
          return res.json({ success: true, code: formatted });
        }
      }
    } catch (retryErr: any) {
      console.error('[Pairing Route] Retry failed:', retryErr);
    }

    res.status(500).json({
      error: err.message || 'Connection closed by WhatsApp. Please try clicking the button again in 3 seconds.'
    });
  }
});

pairingRouter.post('/reconnect', async (req, res) => {
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
