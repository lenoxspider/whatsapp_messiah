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

  updateStatus();
  setInterval(updateStatus, 3000);
}

document.addEventListener('DOMContentLoaded', initNavigationStatus);
