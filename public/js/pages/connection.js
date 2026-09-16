import { apiRequest } from '../api.js';
import { showToast } from '../main.js';

let currentQR = null;

export function initConnectionPage() {
  const phoneInput = document.getElementById('phone-number-input');
  const generateCodeBtn = document.getElementById('btn-generate-code');
  const pairingCodeDisplay = document.getElementById('pairing-code-display');
  const pairingCodeDigits = document.getElementById('pairing-code-digits');
  const qrDisplay = document.getElementById('qr-display');
  const qrPlaceholder = document.getElementById('qr-placeholder');
  const qrImage = document.getElementById('qr-image');
  const btnReconnect = document.getElementById('btn-reconnect');
  const btnLogout = document.getElementById('btn-logout');

  // Handle Requesting 8-Digit Pairing Code
  generateCodeBtn?.addEventListener('click', async () => {
    const phone = phoneInput?.value.trim();
    if (!phone) {
      showToast('Please enter your phone number with country code.', 'error');
      return;
    }

    generateCodeBtn.disabled = true;
    generateCodeBtn.textContent = 'Requesting Code...';

    try {
      const data = await apiRequest('/api/pair/code', {
        method: 'POST',
        body: { phone }
      });

      if (data.code) {
        if (pairingCodeDisplay && pairingCodeDigits) {
          pairingCodeDigits.textContent = data.code;
          pairingCodeDisplay.style.display = 'block';
        }
        showToast('Pairing code generated! Check Linked Devices on your phone.', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Failed to generate code.', 'error');
    } finally {
      generateCodeBtn.disabled = false;
      generateCodeBtn.textContent = 'Generate 8-Digit Code';
    }
  });

  // Reconnect
  btnReconnect?.addEventListener('click', async () => {
    btnReconnect.disabled = true;
    try {
      await apiRequest('/api/pair/reconnect', { method: 'POST' });
      showToast('Reconnection command dispatched.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnReconnect.disabled = false;
    }
  });

  // Logout
  btnLogout?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to unlink and log out of WhatsApp?')) return;
    btnLogout.disabled = true;
    try {
      await apiRequest('/api/pair/logout', { method: 'POST' });
      showToast('Logged out. Re-pairing is required.', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnLogout.disabled = false;
    }
  });

  // Poll status for QR / pairing updates
  async function pollPairingState() {
    try {
      const status = await apiRequest('/api/status');

      // Update QR Code display
      if (status.status !== 'connected' && status.qrCode) {
        if (status.qrCode !== currentQR) {
          currentQR = status.qrCode;
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(status.qrCode)}&size=240x240`;
          if (qrImage) {
            qrImage.src = qrUrl;
            qrImage.style.display = 'block';
          }
          if (qrPlaceholder) qrPlaceholder.style.display = 'none';
        }
      } else {
        if (qrImage) qrImage.style.display = 'none';
        if (qrPlaceholder) {
          qrPlaceholder.style.display = 'block';
          qrPlaceholder.textContent = status.status === 'connected' ? '✅ Linked and Authenticated' : 'Waiting for WhatsApp QR...';
        }
      }

      // Update Pairing Code display if daemon generated one in background
      if (status.pairingCode && pairingCodeDisplay && pairingCodeDigits) {
        pairingCodeDigits.textContent = status.pairingCode;
        pairingCodeDisplay.style.display = 'block';
      }
    } catch {}
  }

  setInterval(pollPairingState, 3000);
  pollPairingState();
}

document.addEventListener('DOMContentLoaded', initConnectionPage);
