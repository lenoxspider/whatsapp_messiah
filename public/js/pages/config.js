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
      discordTestResult.textContent = '✓ Notification successfully posted to Discord!';
      showToast('Discord dispatch verified!', 'success');
    } catch (err) {
      discordTestResult.style.color = 'var(--accent-coral)';
      discordTestResult.textContent = `✗ Dispatch Failed: ${err.message}`;
      showToast(err.message, 'error');
    } finally {
      btnTestDiscord.disabled = false;
      btnTestDiscord.textContent = '🚀 Dispatch Test Notification to Discord';
    }
  });

  // Live Persona Simulation Test
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

  loadConfig();
}

document.addEventListener('DOMContentLoaded', initConfigPage);
