import { apiRequest } from './api.js';

export function initNavigationStatus() {
  const badge = document.getElementById('global-status-badge');
  const statusText = document.getElementById('global-status-text');

  async function updateStatus() {
    try {
      const data = await apiRequest('/api/status');
      if (badge && statusText) {
        badge.className = `status-badge ${data.status}`;
        if (data.status === 'connected') {
          statusText.textContent = data.pairedPhone ? `Connected: +${data.pairedPhone}` : 'Connected';
        } else if (data.status === 'connecting') {
          statusText.textContent = 'Connecting...';
        } else {
          statusText.textContent = 'Disconnected';
        }
      }

      // Update stat cards if present on current page
      const msgCountEl = document.getElementById('stat-messages-count');
      const noteCountEl = document.getElementById('stat-notes-count');
      const remCountEl = document.getElementById('stat-reminders-count');
      const uptimeEl = document.getElementById('stat-uptime');

      if (data.stats) {
        if (msgCountEl) msgCountEl.textContent = data.stats.messagesLogged;
        if (noteCountEl) noteCountEl.textContent = data.stats.notesSaved;
        if (remCountEl) remCountEl.textContent = data.stats.pendingReminders;
      }
      if (uptimeEl && data.uptimeSeconds !== undefined) {
        const hours = Math.floor(data.uptimeSeconds / 3600);
        const mins = Math.floor((data.uptimeSeconds % 3600) / 60);
        uptimeEl.textContent = `${hours}h ${mins}m`;
      }
    } catch {
      if (badge && statusText) {
        badge.className = 'status-badge disconnected';
        statusText.textContent = 'Daemon Offline';
      }
    }
  }

  // Add Lock/Logout button in header if not already present
  const headerStatus = document.querySelector('.header-status');
  if (headerStatus && !document.getElementById('btn-lock-console')) {
    const lockBtn = document.createElement('button');
    lockBtn.id = 'btn-lock-console';
    lockBtn.className = 'btn btn-secondary';
    lockBtn.style.cssText = 'padding: 0.3rem 0.65rem; font-size: 0.8rem; margin-left: 0.75rem; border-radius: var(--radius-sm);';
    lockBtn.title = 'Lock Dashboard Console';
    lockBtn.innerHTML = '🔒 Lock';
    lockBtn.addEventListener('click', async () => {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      } catch {}
      localStorage.removeItem('messiah_token');
      window.location.href = '/login.html';
    });
    headerStatus.appendChild(lockBtn);
  }

  updateStatus();
  setInterval(updateStatus, 3000);
}

document.addEventListener('DOMContentLoaded', initNavigationStatus);
