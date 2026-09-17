import { apiRequest } from '../api.js';
import { showToast } from '../main.js';

export function initConfigPage() {
  const openaiDisplay = document.getElementById('openai-key-display');
  const btnReplaceOpenai = document.getElementById('btn-replace-openai');
  const openaiReplaceBox = document.getElementById('openai-key-replace-box');
  const openaiKeyInput = document.getElementById('openai-key-input');
  const openaiModelSelect = document.getElementById('openai-model-select');
  const btnTestOpenai = document.getElementById('btn-test-openai');
  const openaiTestResult = document.getElementById('openai-test-result');

  const discordDisplay = document.getElementById('discord-webhook-display');
  const btnReplaceDiscord = document.getElementById('btn-replace-discord');
  const discordReplaceBox = document.getElementById('discord-webhook-replace-box');
  const discordWebhookInput = document.getElementById('discord-webhook-input');
  const btnTestDiscord = document.getElementById('btn-test-discord');
  const discordTestResult = document.getElementById('discord-test-result');

  const autonomousToggle = document.getElementById('autonomous-ghost-toggle');
  const ghostToggle = document.getElementById('ghost-handler-toggle');
  const callRejecterToggle = document.getElementById('call-rejecter-toggle');
  const discordMediaToggle = document.getElementById('discord-media-toggle');
  const typingSpeedInput = document.getElementById('typing-speed-input');
  const maxDelayInput = document.getElementById('max-delay-input');
  const antiRevokeStat = document.getElementById('anti-revoke-stat');

  const personaEditor = document.getElementById('persona-prompt-editor');
  const tokenCounterPill = document.getElementById('token-counter-pill');
  const simMessageInput = document.getElementById('sim-message-input');
  const btnGeneratePreview = document.getElementById('btn-generate-preview');
  const simResponseOutput = document.getElementById('sim-response-output');

  const btnSaveAll = document.getElementById('btn-save-all-top');

  // Replace Buttons
  btnReplaceOpenai?.addEventListener('click', () => {
    const isHidden = openaiReplaceBox.style.display === 'none';
    openaiReplaceBox.style.display = isHidden ? 'block' : 'none';
    btnReplaceOpenai.textContent = isHidden ? 'Cancel' : 'Replace';
    if (isHidden) openaiKeyInput.focus();
  });

  btnReplaceDiscord?.addEventListener('click', () => {
    const isHidden = discordReplaceBox.style.display === 'none';
    discordReplaceBox.style.display = isHidden ? 'block' : 'none';
    btnReplaceDiscord.textContent = isHidden ? 'Cancel' : 'Replace';
    if (isHidden) discordWebhookInput.focus();
  });

  // Token Counter on Persona
  personaEditor?.addEventListener('input', () => {
    updateTokenCounter(personaEditor.value);
  });

  function updateTokenCounter(text) {
    // Approx 1 token ~ 4 chars
    const tokens = Math.round(text.length / 4);
    if (tokenCounterPill) {
      tokenCounterPill.textContent = `~${tokens} tokens`;
      if (tokens > 2000) {
        tokenCounterPill.style.background = 'var(--accent-amber-bg)';
        tokenCounterPill.style.color = 'var(--accent-amber)';
      } else {
        tokenCounterPill.style.background = 'var(--bg-hover)';
        tokenCounterPill.style.color = 'var(--text-muted)';
      }
    }
  }

  function updateSwitchBadge(checkbox, badgeId) {
    const badge = document.getElementById(badgeId);
    if (!badge || !checkbox) return;
    if (checkbox.checked) {
      badge.textContent = 'ON';
      badge.style.color = 'var(--accent-green)';
      badge.style.background = 'rgba(29, 158, 117, 0.15)';
      badge.style.border = '1px solid rgba(29, 158, 117, 0.3)';
    } else {
      badge.textContent = 'OFF';
      badge.style.color = 'var(--text-dim)';
      badge.style.background = 'var(--bg-hover)';
      badge.style.border = '1px solid var(--border-subtle)';
    }
  }

  autonomousToggle?.addEventListener('change', () => {
    updateSwitchBadge(autonomousToggle, 'badge-autonomous-ghost');
  });

  ghostToggle?.addEventListener('change', () => {
    updateSwitchBadge(ghostToggle, 'badge-ghost-handler');
  });

  callRejecterToggle?.addEventListener('change', () => {
    updateSwitchBadge(callRejecterToggle, 'badge-call-rejecter');
  });

  discordMediaToggle?.addEventListener('change', () => {
    updateSwitchBadge(discordMediaToggle, 'badge-discord-media');
  });

  // Load Current Configuration
  async function loadConfig() {
    try {
      const cfg = await apiRequest('/api/config');

      if (openaiDisplay) {
        openaiDisplay.value = cfg.openaiKeyMasked || 'No key configured';
      }
      const badgeOpenai = document.getElementById('badge-openai-status');
      if (badgeOpenai) {
        badgeOpenai.textContent = cfg.openaiConfigured ? '✓ VERIFIED' : 'UNCONFIGURED';
        badgeOpenai.style.color = cfg.openaiConfigured ? 'var(--accent-green)' : 'var(--text-dim)';
      }

      if (discordDisplay) {
        discordDisplay.value = cfg.discordWebhookMasked || 'No webhook configured';
      }
      const badgeDiscord = document.getElementById('badge-discord-status');
      if (badgeDiscord) {
        badgeDiscord.textContent = cfg.discordConfigured ? '✓ CONFIGURED' : 'UNCONFIGURED';
        badgeDiscord.style.color = cfg.discordConfigured ? 'var(--accent-green)' : 'var(--text-dim)';
      }

      if (openaiModelSelect && cfg.openaiModel) openaiModelSelect.value = cfg.openaiModel;
      if (autonomousToggle) {
        autonomousToggle.checked = Boolean(cfg.autonomousGhost);
        updateSwitchBadge(autonomousToggle, 'badge-autonomous-ghost');
      }
      if (ghostToggle) {
        ghostToggle.checked = Boolean(cfg.ghostHandlerEnabled);
        updateSwitchBadge(ghostToggle, 'badge-ghost-handler');
      }
      if (callRejecterToggle) {
        callRejecterToggle.checked = Boolean(cfg.autoRejectCalls !== false);
        updateSwitchBadge(callRejecterToggle, 'badge-call-rejecter');
      }
      if (discordMediaToggle) {
        discordMediaToggle.checked = Boolean(cfg.forwardMediaToDiscord !== false);
        updateSwitchBadge(discordMediaToggle, 'badge-discord-media');
      }
      if (typingSpeedInput && cfg.typingSpeedMs) typingSpeedInput.value = cfg.typingSpeedMs;
      if (maxDelayInput && cfg.maxTypingDelayMs) maxDelayInput.value = cfg.maxTypingDelayMs;

      // Default persona prompt if empty
      if (personaEditor && !personaEditor.value) {
        personaEditor.value = `You are replying as the user on WhatsApp.
Style Guidelines:
- Text casually from your phone: concise, natural punctuation, occasional lowercase.
- Keep replies under 2 sentences. Match the sender's energy.
- Do NOT sound like an AI assistant or customer support bot.`;
        updateTokenCounter(personaEditor.value);
      }

      // Load anti-revoke count
      const intel = await apiRequest('/api/messages/revoked-intel').catch(() => null);
      if (antiRevokeStat && intel) {
        antiRevokeStat.textContent = `${intel.totalRevoked || 0} messages stored`;
      }
    } catch (err) {
      showToast('Error loading config: ' + err.message, 'error');
    }
  }

  // Inline Test: OpenAI Key
  btnTestOpenai?.addEventListener('click', async () => {
    btnTestOpenai.disabled = true;
    btnTestOpenai.textContent = 'Verifying...';
    openaiTestResult.style.display = 'block';
    openaiTestResult.style.color = 'var(--text-muted)';
    openaiTestResult.textContent = 'Contacting OpenAI API...';

    const key = openaiKeyInput?.value.trim() || undefined;

    try {
      const res = await apiRequest('/api/config/test-openai', {
        method: 'POST',
        body: { key, model: openaiModelSelect.value }
      });
      openaiTestResult.style.color = 'var(--accent-green)';
      openaiTestResult.textContent = `✓ Key Verified: "${res.reply}"`;
      showToast('OpenAI connection verified!', 'success');
    } catch (err) {
      openaiTestResult.style.color = 'var(--accent-coral)';
      openaiTestResult.textContent = `✗ Verification Failed: ${err.message}`;
      showToast(err.message, 'error');
    } finally {
      btnTestOpenai.disabled = false;
      btnTestOpenai.textContent = '⚡ Verify Key';
    }
  });

  // Inline Test: Discord Webhook
  btnTestDiscord?.addEventListener('click', async () => {
    btnTestDiscord.disabled = true;
    btnTestDiscord.textContent = 'Dispatching...';
    discordTestResult.style.display = 'block';
    discordTestResult.style.color = 'var(--text-muted)';
    discordTestResult.textContent = 'Sending payload to Discord channel...';

    const url = discordWebhookInput?.value.trim() || undefined;

    try {
      await apiRequest('/api/config/test-discord', {
        method: 'POST',
        body: { url }
      });
      discordTestResult.style.color = 'var(--accent-green)';
      discordTestResult.textContent = '✓ Notification received by Discord!';
      showToast('Discord notification dispatched successfully!', 'success');
    } catch (err) {
      discordTestResult.style.color = 'var(--accent-coral)';
      discordTestResult.textContent = `✗ Webhook Failed: ${err.message}`;
      showToast(err.message, 'error');
    } finally {
      btnTestDiscord.disabled = false;
      btnTestDiscord.textContent = '🚀 Dispatch Test Notification to Discord';
    }
  });

  // Generate Persona Preview
  btnGeneratePreview?.addEventListener('click', async () => {
    const prompt = personaEditor?.value.trim();
    const messageText = simMessageInput?.value.trim();

    if (!prompt) {
      showToast('Please enter a base persona prompt', 'error');
      return;
    }
    if (!messageText) {
      showToast('Please type a sample incoming message to test', 'error');
      simMessageInput.focus();
      return;
    }

    btnGeneratePreview.disabled = true;
    btnGeneratePreview.textContent = 'Simulating...';
    simResponseOutput.style.color = 'var(--text-dim)';
    simResponseOutput.textContent = 'Simulating response from OpenAI model...';

    try {
      const res = await apiRequest('/api/config/preview-reply', {
        method: 'POST',
        body: { systemPrompt: prompt, messageText }
      });
      simResponseOutput.style.color = 'var(--accent-green)';
      simResponseOutput.textContent = `"${res.reply}"`;
    } catch (err) {
      simResponseOutput.style.color = 'var(--accent-coral)';
      simResponseOutput.textContent = `Simulation Error: ${err.message}`;
    } finally {
      btnGeneratePreview.disabled = false;
      btnGeneratePreview.textContent = '▶ Generate Preview';
    }
  });

  // Save All Changes
  btnSaveAll?.addEventListener('click', async () => {
    btnSaveAll.disabled = true;
    btnSaveAll.textContent = 'Saving...';

    const payload = {
      openaiApiKey: openaiKeyInput?.value.trim() || undefined,
      openaiModel: openaiModelSelect?.value,
      discordWebhookUrl: discordWebhookInput?.value.trim() || undefined,
      autonomousGhost: autonomousToggle ? autonomousToggle.checked : false,
      ghostHandlerEnabled: ghostToggle ? ghostToggle.checked : true,
      autoRejectCalls: callRejecterToggle ? callRejecterToggle.checked : true,
      forwardMediaToDiscord: discordMediaToggle ? discordMediaToggle.checked : true,
      typingSpeedMs: Number(typingSpeedInput?.value || 45),
      maxTypingDelayMs: Number(maxDelayInput?.value || 8000)
    };

    try {
      await apiRequest('/api/config', {
        method: 'POST',
        body: payload
      });
      showToast('Configuration saved and persisted to .env!', 'success');
      loadConfig();
      if (openaiReplaceBox) openaiReplaceBox.style.display = 'none';
      if (discordReplaceBox) discordReplaceBox.style.display = 'none';
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnSaveAll.disabled = false;
      btnSaveAll.textContent = '💾 Save All Config';
    }
  });

  // Load Telemetry Stats & Live Invocations Log
  async function loadTelemetry() {
    try {
      const stats = await apiRequest('/api/llm/stats');
      const totalSpendEl = document.getElementById('telemetry-total-spend');
      const todayCostEl = document.getElementById('stat-today-cost');
      const totalTokensEl = document.getElementById('stat-total-tokens');
      const totalCallsEl = document.getElementById('stat-total-calls');

      if (totalSpendEl) totalSpendEl.textContent = `$${(stats.totalCostUsd || 0).toFixed(4)}`;
      if (todayCostEl) todayCostEl.textContent = `$${(stats.todayCostUsd || 0).toFixed(4)}`;
      if (totalTokensEl) totalTokensEl.textContent = (stats.totalTokens || 0).toLocaleString();
      if (totalCallsEl) totalCallsEl.textContent = (stats.totalCalls || 0).toLocaleString();

      const recent = await apiRequest('/api/llm/recent?limit=15');
      const tableBody = document.getElementById('telemetry-table-body');
      if (tableBody && recent.calls) {
        if (recent.calls.length === 0) {
          tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 0.75rem; color: var(--text-dim);">No LLM calls recorded yet.</td></tr>';
        } else {
          tableBody.innerHTML = recent.calls.map(c => {
            const purposeBadge = `<span class="delta-badge" style="font-size: 0.68rem;">${c.purpose}</span>`;
            const modelShort = c.model.replace('gpt-4o-mini', '4o-mini').replace('gpt-4o', '4o');
            return `
              <tr style="border-bottom: 1px solid var(--border-subtle);">
                <td style="padding: 0.35rem 0.4rem;">${purposeBadge}</td>
                <td style="padding: 0.35rem 0.4rem; color: var(--text-muted);">${modelShort}</td>
                <td style="padding: 0.35rem 0.4rem; text-align: right; color: var(--accent-blue);">${c.total_tokens || 0}</td>
                <td style="padding: 0.35rem 0.4rem; text-align: right; color: var(--text-muted);">${c.latency_ms || 0}ms</td>
                <td style="padding: 0.35rem 0.4rem; text-align: right; color: var(--accent-green);">$${(c.cost_usd || 0).toFixed(4)}</td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch {}
  }

  document.getElementById('btn-refresh-telemetry')?.addEventListener('click', loadTelemetry);

  // ==========================================
  // VPS Migration & Disaster Recovery Deck
  // ==========================================
  const btnCreateBackupTop = document.getElementById('btn-create-backup-top');
  const btnRefreshBackups = document.getElementById('btn-refresh-backups');
  const backupsTableBody = document.getElementById('backups-table-body');
  const backupFileInput = document.getElementById('backup-file-input');
  const btnUploadRestore = document.getElementById('btn-upload-restore');
  const restoreStatusMessage = document.getElementById('restore-status-message');

  async function loadBackups() {
    if (!backupsTableBody) return;
    try {
      const res = await apiRequest('/api/ops/backups');
      if (!res.backups || res.backups.length === 0) {
        backupsTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1.25rem; color: var(--text-dim);">No backup archives found in data/backups/. Click Download above to create one.</td></tr>';
        return;
      }

      backupsTableBody.innerHTML = res.backups.map(b => {
        const timeFormatted = new Date(b.createdAt).toLocaleString();
        return `
          <tr style="border-bottom: 1px solid var(--border-subtle);">
            <td style="padding: 0.5rem 0.6rem; color: var(--accent-blue); font-weight: 600;">
              ${b.filename}
            </td>
            <td style="padding: 0.5rem 0.6rem; text-align: right; color: var(--accent-green);">
              ${b.formattedSize}
            </td>
            <td style="padding: 0.5rem 0.6rem; color: var(--text-muted); font-size: 0.72rem;">
              ${timeFormatted}
            </td>
            <td style="padding: 0.5rem 0.6rem; text-align: center; white-space: nowrap;">
              <a href="/api/ops/backups/download/${encodeURIComponent(b.filename)}" class="btn" style="background: var(--bg-hover); color: var(--text-main); text-decoration: none; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.72rem; margin-right: 0.35rem; border: 1px solid var(--border-subtle);" download>
                ⬇️ Download
              </a>
              <button type="button" class="btn btn-delete-backup" data-filename="${b.filename}" style="background: rgba(255, 107, 107, 0.15); color: var(--accent-coral); border: 1px solid rgba(255, 107, 107, 0.3); padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.72rem; cursor: pointer;">
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Bind delete buttons
      document.querySelectorAll('.btn-delete-backup').forEach(btn => {
        btn.addEventListener('click', async () => {
          const filename = btn.getAttribute('data-filename');
          if (!confirm(`Delete backup ${filename}?`)) return;
          try {
            await apiRequest(`/api/ops/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
            showToast(`Deleted ${filename}`, 'success');
            loadBackups();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      backupsTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 1.25rem; color: var(--accent-coral);">Failed to load backups: ${err.message}</td></tr>`;
    }
  }

  btnRefreshBackups?.addEventListener('click', loadBackups);

  // Generate & Download Backup
  btnCreateBackupTop?.addEventListener('click', async () => {
    btnCreateBackupTop.disabled = true;
    const origHtml = btnCreateBackupTop.innerHTML;
    btnCreateBackupTop.innerHTML = `<span>⏳</span> Archiving &amp; Snapshotting WAL...`;

    try {
      const res = await apiRequest('/api/ops/backups/generate', {
        method: 'POST',
        body: { label: 'manual', includeMedia: true }
      });

      showToast(`Migration archive ready: ${res.backup.formattedSize}`, 'success');
      loadBackups();

      // Trigger instant browser download
      const downloadUrl = `/api/ops/backups/download/${encodeURIComponent(res.backup.filename)}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = res.backup.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      showToast(`Backup error: ${err.message}`, 'error');
    } finally {
      btnCreateBackupTop.disabled = false;
      btnCreateBackupTop.innerHTML = origHtml;
    }
  });

  // Restore Backup
  btnUploadRestore?.addEventListener('click', async () => {
    const file = backupFileInput?.files?.[0];
    if (!file) {
      showToast('Please select a .zip backup archive first.', 'error');
      return;
    }

    if (!confirm('⚠️ CAUTION: Restoring will overwrite current database records, decrypted media, and WhatsApp session keys with this backup.\n\nAre you sure you want to proceed?')) {
      return;
    }

    btnUploadRestore.disabled = true;
    btnUploadRestore.textContent = 'Restoring...';
    if (restoreStatusMessage) {
      restoreStatusMessage.style.display = 'block';
      restoreStatusMessage.style.color = 'var(--accent-blue)';
      restoreStatusMessage.textContent = '⏳ Uploading and unpacking archive...';
    }

    const formData = new FormData();
    formData.append('backup', file);

    try {
      const token = localStorage.getItem('messiah_auth_token') || '';
      const response = await fetch('/api/ops/backups/restore', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const res = await response.json();
      if (!response.ok || !res.success) {
        throw new Error(res.error || 'Restore failed');
      }

      if (restoreStatusMessage) {
        restoreStatusMessage.style.color = 'var(--accent-green)';
        restoreStatusMessage.textContent = `✓ Restore Successful! Restored ${res.restoredFilesCount} files. Please reload your console.`;
      }
      showToast('Disaster recovery restore completed successfully!', 'success');
      loadBackups();
    } catch (err) {
      if (restoreStatusMessage) {
        restoreStatusMessage.style.color = 'var(--accent-coral)';
        restoreStatusMessage.textContent = `❌ Restore Error: ${err.message}`;
      }
      showToast(err.message, 'error');
    } finally {
      btnUploadRestore.disabled = false;
      btnUploadRestore.textContent = 'Restore';
    }
  });

  loadConfig();
  loadTelemetry();
  loadBackups();
}

document.addEventListener('DOMContentLoaded', initConfigPage);
