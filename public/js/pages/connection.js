import { apiRequest } from '../api.js';
import { showToast } from '../main.js';

let currentQR = null;

export function initConnectionPage() {
  const phoneInput = document.getElementById('phone-number-input');
  const generateCodeBtn = document.getElementById('btn-generate-code');
  const pairingCodeDisplay = document.getElementById('pairing-code-display');
  const pairingCodeDigits = document.getElementById('pairing-code-digits');
  const qrPlaceholder = document.getElementById('qr-placeholder');
  const qrImage = document.getElementById('qr-image');
  const btnReconnect = document.getElementById('btn-reconnect');
  const btnUnlinkHold = document.getElementById('btn-unlink-hold');
  const unlinkProgressFill = document.getElementById('unlink-progress-fill');
  const unlinkBtnText = document.getElementById('unlink-btn-text');

  // 1. Request 8-Digit Code
  generateCodeBtn?.addEventListener('click', async () => {
    const phone = phoneInput?.value.trim();
    if (!phone) {
      showToast('Enter your international phone number without symbols.', 'error');
      return;
    }

    generateCodeBtn.disabled = true;
    generateCodeBtn.textContent = 'Requesting...';

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
        showToast('Pairing code generated! Check Linked Devices on WhatsApp.', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Failed to request code.', 'error');
    } finally {
      generateCodeBtn.disabled = false;
      generateCodeBtn.textContent = 'Get 8-Digit Code';
    }
  });

  // 2. Force Reconnect
  btnReconnect?.addEventListener('click', async () => {
    btnReconnect.disabled = true;
    try {
      await apiRequest('/api/pair/reconnect', { method: 'POST' });
      showToast('Socket reset dispatched.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnReconnect.disabled = false;
    }
  });

  // 3. Hold-To-Confirm Unlink (2.0 Seconds with Progress Ring)
  let holdTimer = null;
  let holdStart = 0;
  const HOLD_DURATION = 2000;

  function startHold(e) {
    e.preventDefault();
    holdStart = Date.now();
    if (unlinkBtnText) unlinkBtnText.textContent = 'Holding... Keep Pressed';

    const interval = 20;
    holdTimer = setInterval(() => {
      const elapsed = Date.now() - holdStart;
      const pct = Math.min(100, (elapsed / HOLD_DURATION) * 100);
      if (unlinkProgressFill) unlinkProgressFill.style.width = `${pct}%`;

      if (elapsed >= HOLD_DURATION) {
        clearInterval(holdTimer);
        holdTimer = null;
        triggerUnlink();
      }
    }, interval);
  }

  function cancelHold() {
    if (holdTimer) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
    if (unlinkProgressFill) unlinkProgressFill.style.width = '0%';
    if (unlinkBtnText) unlinkBtnText.textContent = '🚪 Hold to Unlink (2s)';
  }

  async function triggerUnlink() {
    if (unlinkBtnText) unlinkBtnText.textContent = 'Unlinking...';
    try {
      await apiRequest('/api/pair/logout', { method: 'POST' });
      showToast('WhatsApp session unlinked successfully.', 'info');
      cancelHold();
    } catch (err) {
      showToast(err.message || 'Unlink failed', 'error');
      cancelHold();
    }
  }

  btnUnlinkHold?.addEventListener('mousedown', startHold);
  btnUnlinkHold?.addEventListener('mouseup', cancelHold);
  btnUnlinkHold?.addEventListener('mouseleave', cancelHold);
  btnUnlinkHold?.addEventListener('touchstart', startHold, { passive: false });
  btnUnlinkHold?.addEventListener('touchend', cancelHold);
  btnUnlinkHold?.addEventListener('touchcancel', cancelHold);

  // 4. Poll Pairing & QR State
  async function pollPairingState() {
    try {
      const status = await apiRequest('/api/status');

      if (status.status !== 'connected' && status.qrCode) {
        if (status.qrCode !== currentQR) {
          currentQR = status.qrCode;
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(status.qrCode)}&size=160x160`;
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
          qrPlaceholder.textContent = status.status === 'connected' ? '✅ Authenticated' : 'Waiting for QR...';
        }
      }

      if (status.pairingCode && pairingCodeDisplay && pairingCodeDigits) {
        pairingCodeDigits.textContent = status.pairingCode;
        pairingCodeDisplay.style.display = 'block';
      }

      // Update "Since You Left" session delta
      updateSessionDelta(status);
    } catch {}
  }

  function updateSessionDelta(status) {
    const rawSaved = localStorage.getItem('messiah_baseline_stats');
    let baseline = rawSaved ? JSON.parse(rawSaved) : null;

    if (!baseline && status.stats) {
      baseline = { ...status.stats, timestamp: Date.now() };
      localStorage.setItem('messiah_baseline_stats', JSON.stringify(baseline));
    }

    if (status.stats && baseline) {
      const dMsg = Math.max(0, (status.stats.messagesLogged || 0) - (baseline.messagesLogged || 0));
      const dNotes = Math.max(0, (status.stats.notesSaved || 0) - (baseline.notesSaved || 0));
      const dRem = status.stats.pendingReminders || 0;

      const dMsgEl = document.getElementById('delta-messages');
      const dRevEl = document.getElementById('delta-revoked');
      const dNoteEl = document.getElementById('delta-notes');
      const dRemEl = document.getElementById('delta-reminders');

      if (dMsgEl) dMsgEl.textContent = `+${dMsg}`;
      if (dRevEl) dRevEl.textContent = `0`;
      if (dNoteEl) dNoteEl.textContent = `+${dNotes}`;
      if (dRemEl) dRemEl.textContent = `${dRem}`;
    }
  }

  // 5. Poll Live Messages & Health Logs
  const messagesContainer = document.getElementById('live-messages-container');
  const logsContainer = document.getElementById('live-logs-container');

  async function pollLiveActivity() {
    try {
      const msgData = await apiRequest('/api/messages/live?limit=30');
      if (messagesContainer && msgData.messages) {
        if (msgData.messages.length === 0) {
          messagesContainer.innerHTML = '<div style="color: var(--text-dim); font-size: 0.82rem; padding: 1.5rem; text-align: center;">No messages logged yet.</div>';
        } else {
          messagesContainer.innerHTML = msgData.messages.map(m => {
            const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const isSelf = m.from_me;
            const isRevoked = Boolean(m.is_revoked);
            const senderLabel = isSelf ? '👤 You' : (m.contact_name ? `${m.contact_name}` : `+${m.sender_jid.split('@')[0]}`);
            const tierBadge = m.contact_tier ? `<span style="font-size: 0.68rem; padding: 0.05rem 0.35rem; border-radius: 3px; background: var(--tier-${m.contact_tier}-bg); color: var(--tier-${m.contact_tier}); font-weight: 600;">T${m.contact_tier}</span>` : '';
            const revokedBadge = isRevoked ? `<span style="font-size: 0.68rem; padding: 0.05rem 0.35rem; border-radius: 3px; background: var(--accent-coral-bg); color: var(--accent-coral); font-weight: 700;">REVOKED</span>` : '';

            return `
              <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.55rem 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                  <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; font-weight: 600; color: ${isSelf ? 'var(--accent-green)' : 'var(--text-main)'};">
                    ${escapeHtml(senderLabel)} ${tierBadge} ${revokedBadge}
                  </div>
                  <span class="tabular-nums" style="font-size: 0.72rem; color: var(--text-dim);">${time}</span>
                </div>
                <div style="font-size: 0.82rem; color: ${isRevoked ? 'var(--accent-coral)' : 'var(--text-muted)'}; word-break: break-word; line-height: 1.4;">
                  ${escapeHtml(m.content || '[Media Payload]')}
                </div>
              </div>
            `;
          }).join('');
        }
      }

      const logData = await apiRequest('/api/messages/logs?limit=30');
      if (logsContainer && logData.logs) {
        if (logData.logs.length === 0) {
          logsContainer.innerHTML = '<div style="color: var(--text-dim); padding: 1rem;">No recent log events.</div>';
        } else {
          logsContainer.innerHTML = logData.logs.map(l => {
            const time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            let color = 'var(--text-muted)';
            if (l.level === 'error') color = 'var(--accent-coral)';
            if (l.level === 'warn') color = 'var(--accent-amber)';
            if (l.level === 'success') color = 'var(--accent-green)';

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
