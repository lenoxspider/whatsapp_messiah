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

  // Poll Live Messages & Health Logs
  const messagesContainer = document.getElementById('live-messages-container');
  const logsContainer = document.getElementById('live-logs-container');

  async function pollLiveActivity() {
    try {
      // 1. Fetch live messages
      const msgData = await apiRequest('/api/messages/live?limit=25');
      if (messagesContainer && msgData.messages) {
        if (msgData.messages.length === 0) {
          messagesContainer.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 1rem; text-align: center;">No messages logged yet.</div>';
        } else {
          messagesContainer.innerHTML = msgData.messages.map(m => {
            const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const isSelf = m.from_me;
            const isRevoked = Boolean(m.is_revoked);
            const senderLabel = isSelf ? '👤 You' : (m.contact_name ? `💬 ${m.contact_name}` : `📱 ${m.sender_jid.split('@')[0]}`);
            const tierBadge = m.contact_tier ? `<span style="font-size: 0.7rem; padding: 0.1rem 0.35rem; border-radius: 4px; background: rgba(37,211,102,0.15); color: var(--primary);">Tier ${m.contact_tier}</span>` : '';
            const revokedBadge = isRevoked ? `<span style="font-size: 0.7rem; padding: 0.1rem 0.35rem; border-radius: 4px; background: rgba(239,68,68,0.2); color: #f87171; font-weight: bold;">REVOKED</span>` : '';

            return `
              <div style="background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-sm); padding: 0.6rem 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
                  <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; font-weight: 600; color: ${isSelf ? 'var(--primary)' : 'var(--text-main)'};">
                    ${senderLabel} ${tierBadge} ${revokedBadge}
                  </div>
                  <span style="font-size: 0.72rem; color: var(--text-dim);">${time}</span>
                </div>
                <div style="font-size: 0.84rem; color: ${isRevoked ? '#fca5a5' : 'var(--text-muted)'}; word-break: break-word;">
                  ${escapeHtml(m.content || '[Media Attachment]')}
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // 2. Fetch live system logs
      const logData = await apiRequest('/api/messages/logs?limit=25');
      if (logsContainer && logData.logs) {
        if (logData.logs.length === 0) {
          logsContainer.innerHTML = '<div style="color: var(--text-dim);">System initialized. Listening for events...</div>';
        } else {
          logsContainer.innerHTML = logData.logs.map(l => {
            const time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            let color = 'var(--text-muted)';
            if (l.level === 'error') color = '#f87171';
            if (l.level === 'warn') color = '#fbbf24';
            if (l.level === 'success') color = '#34d399';

            return `<div style="color: ${color}; line-height: 1.4;"><span style="color: var(--text-dim); font-size: 0.72rem;">[${time}]</span> [${l.category}] ${escapeHtml(l.message)}</div>`;
          }).join('');
        }
      }
    } catch {}
  }

  function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  setInterval(pollPairingState, 3000);
  setInterval(pollLiveActivity, 3000);
  pollPairingState();
  pollLiveActivity();
}

document.addEventListener('DOMContentLoaded', initConnectionPage);
