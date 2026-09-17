import { apiRequest } from '../api.js';
import { initNavigationStatus } from '../nav.js';

let capturedStatuses = [];
let selectedStatusId = null;

document.addEventListener('DOMContentLoaded', async () => {
  initNavigationStatus();

  await loadExtrasConfig();
  await loadCapturedStatuses();
  await initMaintenanceDeck();

  bindEventListeners();
});

async function loadExtrasConfig() {
  try {
    const config = await apiRequest('/api/extras/config');
    const toggleDiscord = document.getElementById('toggle-discord');

    if (toggleDiscord) toggleDiscord.checked = config.statusStealerDiscord !== false;
    
    await loadStatusTargets();
  } catch (err) {
    console.error('Failed to load extras config:', err);
  }
}

async function loadStatusTargets() {
  const container = document.getElementById('targets-list-container');
  if (!container) return;

  try {
    const data = await apiRequest('/api/extras/targets');
    const targets = data.targets || [];

    if (targets.length === 0) {
      container.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted);">No targets configured. Statuses captured for all incoming contacts.</span>`;
      return;
    }

    container.innerHTML = targets.map(t => `
      <span class="target-chip">
        📱 ${t.name ? `${escapeHtml(t.name)} (${escapeHtml(t.phone)})` : escapeHtml(t.phone)}
        <span class="remove-btn" data-phone="${t.phone}" title="Remove target">×</span>
      </span>
    `).join('');

    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const phone = btn.dataset.phone;
        await deleteTarget(phone);
      });
    });
  } catch (err) {
    console.error('Failed to load status targets:', err);
    container.innerHTML = `<span style="font-size: 0.75rem; color: var(--accent-coral);">Failed to load targets.</span>`;
  }
}

async function addTarget() {
  const input = document.getElementById('input-target-phone');
  if (!input) return;
  const phone = input.value.trim();
  if (!phone) return;

  try {
    await apiRequest('/api/extras/targets', {
      method: 'POST',
      body: JSON.stringify({ phone })
    });
    input.value = '';
    showSaveBanner();
    await loadStatusTargets();
  } catch (err) {
    alert(`Failed to add target: ${err.message}`);
  }
}

async function deleteTarget(phone) {
  try {
    await apiRequest(`/api/extras/targets/${encodeURIComponent(phone)}`, {
      method: 'DELETE'
    });
    showSaveBanner();
    await loadStatusTargets();
  } catch (err) {
    alert(`Failed to delete target: ${err.message}`);
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
  // Add target listener
  document.getElementById('btn-add-target')?.addEventListener('click', addTarget);
  document.getElementById('input-target-phone')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTarget();
  });

  // Toggle Discord auto-save
  document.getElementById('toggle-discord')?.addEventListener('change', async (e) => {
    try {
      await apiRequest('/api/extras/config', {
        method: 'POST',
        body: JSON.stringify({
          statusStealerDiscord: e.target.checked
        })
      });
      showSaveBanner();
    } catch (err) {
      alert(`Failed to save setting: ${err.message}`);
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

async function initMaintenanceDeck() {
  const commitHashEl = document.getElementById('git-commit-hash');
  const branchEl = document.getElementById('git-branch');
  const logInfoEl = document.getElementById('git-log-info');
  const badgeEl = document.getElementById('git-status-badge');
  const btnCheckUpdate = document.getElementById('btn-check-update');
  const btnUpdateRestart = document.getElementById('btn-update-restart');
  const btnRestartOnly = document.getElementById('btn-restart-only');
  const updaterSpinner = document.getElementById('updater-spinner');
  const updaterConsole = document.getElementById('updater-console');

  async function checkGitStatus() {
    if (badgeEl) {
      badgeEl.textContent = 'CHECKING...';
      badgeEl.style.color = '#38bdf8';
    }
    try {
      const data = await apiRequest('/api/extras/git-status');
      if (commitHashEl) commitHashEl.textContent = data.localHash || '--';
      if (branchEl) branchEl.textContent = data.branch || '--';
      if (logInfoEl) logInfoEl.textContent = data.logInfo || 'No commit message';

      if (badgeEl) {
        if (data.isUpToDate) {
          badgeEl.textContent = 'UP TO DATE';
          badgeEl.style.color = 'var(--accent-green)';
          badgeEl.style.background = 'rgba(29, 158, 117, 0.15)';
          badgeEl.style.borderColor = 'rgba(29, 158, 117, 0.3)';
        } else {
          badgeEl.textContent = `UPDATE AVAILABLE (${data.remoteHash})`;
          badgeEl.style.color = 'var(--accent-amber)';
          badgeEl.style.background = 'rgba(234, 179, 8, 0.15)';
          badgeEl.style.borderColor = 'rgba(234, 179, 8, 0.3)';
        }
      }
    } catch (err) {
      if (badgeEl) {
        badgeEl.textContent = 'GIT OFFLINE';
        badgeEl.style.color = 'var(--accent-coral)';
      }
    }
  }

  btnCheckUpdate?.addEventListener('click', checkGitStatus);

  btnUpdateRestart?.addEventListener('click', async () => {
    if (!confirm('Pull latest changes from GitHub, rebuild, and reload Messiah under PM2?')) return;

    btnUpdateRestart.disabled = true;
    btnRestartOnly.disabled = true;
    if (updaterSpinner) updaterSpinner.style.display = 'inline';
    if (updaterConsole) {
      updaterConsole.textContent = '⏳ [1/3] Contacting daemon... Running git pull & build sequence...';
      updaterConsole.style.color = '#38bdf8';
    }

    try {
      const res = await apiRequest('/api/extras/update', { method: 'POST' });
      if (updaterConsole) {
        updaterConsole.textContent = res.logs || res.message;
        updaterConsole.style.color = 'var(--accent-green)';
      }

      pollReconnect('Update complete! Reloading daemon...');
    } catch (err) {
      if (updaterConsole) {
        updaterConsole.textContent = `❌ Update Error: ${err.message}`;
        updaterConsole.style.color = 'var(--accent-coral)';
      }
      btnUpdateRestart.disabled = false;
      btnRestartOnly.disabled = false;
      if (updaterSpinner) updaterSpinner.style.display = 'none';
    }
  });

  btnRestartOnly?.addEventListener('click', async () => {
    if (!confirm('Restart the Messiah daemon now?')) return;

    btnRestartOnly.disabled = true;
    btnUpdateRestart.disabled = true;
    if (updaterSpinner) updaterSpinner.style.display = 'inline';
    if (updaterConsole) {
      updaterConsole.textContent = '⏳ Triggering daemon restart...';
      updaterConsole.style.color = '#38bdf8';
    }

    try {
      const res = await apiRequest('/api/extras/restart', { method: 'POST' });
      if (updaterConsole) {
        updaterConsole.textContent = res.message;
        updaterConsole.style.color = 'var(--accent-green)';
      }
      pollReconnect('Daemon restarting...');
    } catch (err) {
      if (updaterConsole) {
        updaterConsole.textContent = `❌ Restart Error: ${err.message}`;
        updaterConsole.style.color = 'var(--accent-coral)';
      }
      btnRestartOnly.disabled = false;
      btnUpdateRestart.disabled = false;
      if (updaterSpinner) updaterSpinner.style.display = 'none';
    }
  });

  // Factory Reset / Panic Wipe
  const btnFactoryReset = document.getElementById('btn-factory-reset');
  btnFactoryReset?.addEventListener('click', async () => {
    const confirmation = prompt('⚠️ DANGER: This will permanently purge all messages, notes, decrypted media, and WhatsApp session keys!\n\nA safety backup will be created in data/backups before wiping.\n\nTo confirm, type: RESET');
    if (confirmation !== 'RESET') {
      return;
    }

    btnFactoryReset.disabled = true;
    btnUpdateRestart.disabled = true;
    btnRestartOnly.disabled = true;
    if (updaterSpinner) updaterSpinner.style.display = 'inline';
    if (updaterConsole) {
      updaterConsole.textContent = '💣 Initiating Factory Reset... Creating safety snapshot and purging vault tables...';
      updaterConsole.style.color = 'var(--accent-coral)';
    }

    try {
      const res = await apiRequest('/api/extras/factory-reset', { method: 'POST' });
      if (updaterConsole) {
        updaterConsole.textContent = `✓ ${res.message}\nRebooting fresh daemon...`;
        updaterConsole.style.color = 'var(--accent-coral)';
      }
      pollReconnect('Factory reset complete. Rebooting clean daemon...');
    } catch (err) {
      if (updaterConsole) {
        updaterConsole.textContent = `❌ Factory Reset Error: ${err.message}`;
        updaterConsole.style.color = 'var(--accent-coral)';
      }
      btnFactoryReset.disabled = false;
      btnUpdateRestart.disabled = false;
      btnRestartOnly.disabled = false;
      if (updaterSpinner) updaterSpinner.style.display = 'none';
    }
  });

  function pollReconnect(statusMsg) {
    let countdown = 6;
    const interval = setInterval(async () => {
      countdown--;
      if (updaterConsole) {
        updaterConsole.textContent = `${statusMsg}\nReconnecting to Messiah control plane in ${countdown}s...`;
      }

      if (countdown <= 0) {
        clearInterval(interval);
        try {
          const status = await apiRequest('/api/status');
          if (updaterConsole) {
            updaterConsole.textContent = `✅ Connected! Messiah online (Uptime: ${status.uptimeSeconds || 0}s). Re-checking version...`;
            updaterConsole.style.color = 'var(--accent-green)';
          }
          await checkGitStatus();
        } catch {
          if (updaterConsole) {
            updaterConsole.textContent = '⏳ Server still starting up, please refresh your browser in a few moments.';
          }
        } finally {
          btnUpdateRestart.disabled = false;
          btnRestartOnly.disabled = false;
          if (updaterSpinner) updaterSpinner.style.display = 'none';
        }
      }
    }, 1000);
  }

  await checkGitStatus();
}

