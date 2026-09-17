import { apiRequest } from '../api.js';
import { initNavigationStatus } from '../nav.js';

let capturedStatuses = [];
let selectedStatusId = null;

document.addEventListener('DOMContentLoaded', async () => {
  initNavigationStatus();

  await loadExtrasConfig();
  await loadCapturedStatuses();

  bindEventListeners();
});

async function loadExtrasConfig() {
  try {
    const config = await apiRequest('/api/extras/config');
    const inputTrigger = document.getElementById('input-trigger');
    const toggleAutoDelete = document.getElementById('toggle-autodelete');
    const toggleDiscord = document.getElementById('toggle-discord');

    if (inputTrigger) inputTrigger.value = config.statusStealerTrigger || '!😶🌫️';
    if (toggleAutoDelete) toggleAutoDelete.checked = config.statusStealerAutoDelete !== false;
    if (toggleDiscord) toggleDiscord.checked = config.statusStealerDiscord !== false;
  } catch (err) {
    console.error('Failed to load extras config:', err);
  }
}

async function loadCapturedStatuses() {
  try {
    const data = await apiRequest('/api/extras/statuses');
    capturedStatuses = data.statuses || [];

    const countBadge = document.getElementById('status-total-count');
    if (countBadge) countBadge.textContent = data.total || '0';

    renderStatusList();

    if (capturedStatuses.length > 0 && !selectedStatusId) {
      selectStatus(capturedStatuses[0].id);
    } else if (capturedStatuses.length === 0) {
      renderEmptyInspector();
    }
  } catch (err) {
    console.error('Failed to load captured statuses:', err);
  }
}

function renderStatusList() {
  const container = document.getElementById('status-list-container');
  if (!container) return;

  if (capturedStatuses.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-dim); font-size: 0.82rem; padding: 3rem 1rem; text-align: center;">
        No statuses exfiltrated yet.<br>
        <span style="font-size: 0.74rem; color: var(--text-muted); margin-top: 0.4rem; display: inline-block;">
          Reply to any contact's WhatsApp status with your trigger to capture it!
        </span>
      </div>
    `;
    return;
  }

  container.innerHTML = capturedStatuses.map(s => {
    const isSelected = s.id === selectedStatusId;
    const mediaType = s.media_type || 'text';
    const typeIcon = mediaType === 'image' ? '🖼️' : mediaType === 'video' ? '📹' : mediaType === 'audio' ? '🎙️' : '📝';
    const timeStr = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date(s.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const preview = s.content ? escapeHtml(s.content.slice(0, 45)) : (mediaType === 'image' ? 'Photo Status' : 'Video Status');

    return `
      <div class="status-card-item ${isSelected ? 'active' : ''}" data-id="${s.id}">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem;">
            <span style="font-size: 0.85rem;">${typeIcon}</span>
            <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(s.contact_name || s.contact_phone)}
            </span>
          </div>
          <div style="font-size: 0.74rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${preview}
          </div>
        </div>
        <div style="text-align: right; margin-left: 0.75rem; font-size: 0.7rem; color: var(--text-dim); font-family: var(--font-mono); white-space: nowrap;">
          <div>${timeStr}</div>
          <div style="font-size: 0.65rem;">${dateStr}</div>
        </div>
      </div>
    `;
  }).join('');

  // Bind item clicks
  container.querySelectorAll('.status-card-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = Number(el.dataset.id);
      selectStatus(id);
    });
  });
}

function selectStatus(id) {
  selectedStatusId = id;
  const status = capturedStatuses.find(s => s.id === id);
  if (!status) return;

  renderStatusList();
  renderInspector(status);
}

function renderInspector(status) {
  const container = document.getElementById('status-inspector-container');
  const actionsContainer = document.getElementById('inspector-actions');
  if (!container) return;

  const fileName = status.media_path ? status.media_path.split(/[\\/]/).pop() : null;
  const mediaUrl = fileName ? `/api/media/${fileName}` : null;
  const isImage = status.media_type === 'image' || status.mime_type?.startsWith('image/');
  const isVideo = status.media_type === 'video' || status.mime_type?.startsWith('video/');

  if (actionsContainer) {
    actionsContainer.innerHTML = `
      ${mediaUrl ? `
        <a href="${mediaUrl}" download="${fileName}" class="btn" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-main); font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); text-decoration: none;">
          ⬇️ Download
        </a>
      ` : ''}
      <button id="btn-delete-status" class="btn" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); cursor: pointer;">
        🗑️ Delete
      </button>
    `;

    document.getElementById('btn-delete-status')?.addEventListener('click', async () => {
      if (confirm('Delete this exfiltrated status record?')) {
        await apiRequest(`/api/extras/statuses/${status.id}`, { method: 'DELETE' });
        selectedStatusId = null;
        await loadCapturedStatuses();
      }
    });
  }

  let mediaHtml = '';
  if (isImage && mediaUrl) {
    mediaHtml = `
      <div style="max-width: 100%; max-height: 380px; overflow: hidden; border-radius: var(--radius-sm); margin-bottom: 1rem; border: 1px solid var(--border-subtle);">
        <img src="${mediaUrl}" alt="Captured Status" style="max-width: 100%; max-height: 380px; object-fit: contain; display: block;" />
      </div>
    `;
  } else if (isVideo && mediaUrl) {
    mediaHtml = `
      <div style="max-width: 100%; max-height: 380px; border-radius: var(--radius-sm); margin-bottom: 1rem; overflow: hidden; border: 1px solid var(--border-subtle);">
        <video src="${mediaUrl}" controls style="max-width: 100%; max-height: 380px; display: block;"></video>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="width: 100%; max-width: 600px; display: flex; flex-direction: column; align-items: center;">
      ${mediaHtml}

      <div style="width: 100%; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 1rem; margin-top: 0.5rem;">
        
        <!-- Sender Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
          <div>
            <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main);">
              ${escapeHtml(status.contact_name || 'Unknown Contact')}
            </div>
            <div style="font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);">
              +${escapeHtml(status.contact_phone)}
            </div>
          </div>
          <span style="font-size: 0.72rem; color: #38bdf8; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.25); padding: 0.2rem 0.5rem; border-radius: var(--radius-sm);">
            ${status.discord_sent ? '⚡ Discord Dispatched' : 'Vault Saved'}
          </span>
        </div>

        <!-- Content/Caption -->
        ${status.content ? `
          <div style="font-size: 0.84rem; color: var(--text-main); line-height: 1.45; background: var(--bg-surface); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); margin-bottom: 0.75rem;">
            "${escapeHtml(status.content)}"
          </div>
        ` : ''}

        <!-- Metadata Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.74rem; color: var(--text-dim); font-family: var(--font-mono);">
          <div>Type: <span style="color: var(--text-main);">${status.media_type || 'text'}</span></div>
          <div>Date: <span style="color: var(--text-main);">${new Date(status.timestamp).toLocaleString()}</span></div>
        </div>

      </div>
    </div>
  `;
}

function renderEmptyInspector() {
  const container = document.getElementById('status-inspector-container');
  const actionsContainer = document.getElementById('inspector-actions');
  if (actionsContainer) actionsContainer.innerHTML = '';
  if (container) {
    container.innerHTML = `
      <div style="color: var(--text-dim); font-size: 0.82rem; text-align: center;">
        Select any intercepted status from the exfiltration log to inspect media, full text, and contact metadata.
      </div>
    `;
  }
}

function bindEventListeners() {
  // Preset chips
  document.querySelectorAll('.trigger-preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const trigger = chip.dataset.trigger;
      const input = document.getElementById('input-trigger');
      if (input && trigger) {
        input.value = trigger;
      }
    });
  });

  // Save Extras Config
  document.getElementById('btn-save-extras')?.addEventListener('click', async () => {
    const trigger = document.getElementById('input-trigger')?.value;
    const autoDelete = document.getElementById('toggle-autodelete')?.checked;
    const discord = document.getElementById('toggle-discord')?.checked;

    try {
      await apiRequest('/api/extras/config', {
        method: 'POST',
        body: JSON.stringify({
          statusStealerTrigger: trigger,
          statusStealerAutoDelete: autoDelete,
          statusStealerDiscord: discord
        })
      });

      showSaveBanner();
    } catch (err) {
      alert(`Failed to save settings: ${err.message}`);
    }
  });

  // Test Discord Webhook
  document.getElementById('btn-test-discord')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-discord');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>⏳</span> Sending...';
    btn.disabled = true;

    try {
      const res = await apiRequest('/api/extras/test-discord', { method: 'POST' });
      alert(res.message || 'Test status alert dispatched to Discord!');
    } catch (err) {
      alert(`Discord test failed: ${err.message}`);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  });

  // Refresh Feed
  document.getElementById('btn-refresh-statuses')?.addEventListener('click', async () => {
    await loadCapturedStatuses();
  });
}

function showSaveBanner() {
  const banner = document.getElementById('save-status-msg');
  if (banner) {
    banner.style.display = 'block';
    setTimeout(() => {
      banner.style.display = 'none';
    }, 3000);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
