import { apiRequest } from '../api.js';
import { showToast } from '../main.js';

export function initConfigPage() {
  const form = document.getElementById('config-form');
  const openaiKeyInput = document.getElementById('openai-key-input');
  const openaiModelSelect = document.getElementById('openai-model-select');
  const discordWebhookInput = document.getElementById('discord-webhook-input');
  const phoneNumberInput = document.getElementById('phone-number-input');
  const ownerJidInput = document.getElementById('owner-jid-input');
  const typingSpeedInput = document.getElementById('typing-speed-input');
  const maxDelayInput = document.getElementById('max-delay-input');
  const ghostToggle = document.getElementById('ghost-handler-toggle');
  const autonomousToggle = document.getElementById('autonomous-ghost-toggle');

  const btnTestOpenai = document.getElementById('btn-test-openai');
  const btnTestDiscord = document.getElementById('btn-test-discord');

  // Load current configuration
  async function loadConfig() {
    try {
      const cfg = await apiRequest('/api/config');
      if (cfg.openaiKeyMasked) openaiKeyInput.placeholder = `Masked: ${cfg.openaiKeyMasked}`;
      if (cfg.openaiModel) openaiModelSelect.value = cfg.openaiModel;
      if (cfg.discordWebhookMasked) discordWebhookInput.placeholder = `Masked: ${cfg.discordWebhookMasked}`;
      if (cfg.phoneNumber) phoneNumberInput.value = cfg.phoneNumber;
      if (cfg.ownerJid) ownerJidInput.value = cfg.ownerJid;
      if (cfg.typingSpeedMs) typingSpeedInput.value = cfg.typingSpeedMs;
      if (cfg.maxTypingDelayMs) maxDelayInput.value = cfg.maxTypingDelayMs;
      if (ghostToggle) ghostToggle.checked = Boolean(cfg.ghostHandlerEnabled);
      if (autonomousToggle) autonomousToggle.checked = Boolean(cfg.autonomousGhost);
    } catch (err) {
      showToast('Failed to load configuration: ' + err.message, 'error');
    }
  }

  // Save configuration
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      openaiApiKey: openaiKeyInput.value.trim() || undefined,
      openaiModel: openaiModelSelect.value,
      discordWebhookUrl: discordWebhookInput.value.trim() || undefined,
      phoneNumber: phoneNumberInput.value.trim(),
      ownerJid: ownerJidInput.value.trim(),
      typingSpeedMs: Number(typingSpeedInput.value),
      maxTypingDelayMs: Number(maxDelayInput.value),
      ghostHandlerEnabled: ghostToggle.checked,
      autonomousGhost: autonomousToggle ? autonomousToggle.checked : false
    };

    try {
      await apiRequest('/api/config', {
        method: 'POST',
        body: payload
      });
      showToast('Settings saved and persisted to .env!', 'success');
      loadConfig();
    } catch (err) {
      showToast('Failed to save settings: ' + err.message, 'error');
    }
  });

  // Test OpenAI
  btnTestOpenai?.addEventListener('click', async () => {
    btnTestOpenai.disabled = true;
    btnTestOpenai.textContent = 'Testing...';
    try {
      const res = await apiRequest('/api/config/test-openai', {
        method: 'POST',
        body: {
          key: openaiKeyInput.value.trim() || undefined,
          model: openaiModelSelect.value
        }
      });
      showToast(`OpenAI Success: "${res.reply}"`, 'success');
    } catch (err) {
      showToast(`OpenAI Test Failed: ${err.message}`, 'error');
    } finally {
      btnTestOpenai.disabled = false;
      btnTestOpenai.textContent = 'Test API Key';
    }
  });

  // Test Discord
  btnTestDiscord?.addEventListener('click', async () => {
    btnTestDiscord.disabled = true;
    btnTestDiscord.textContent = 'Testing...';
    try {
      const res = await apiRequest('/api/config/test-discord', {
        method: 'POST',
        body: { url: discordWebhookInput.value.trim() || undefined }
      });
      showToast(res.message || 'Notification sent to Discord!', 'success');
    } catch (err) {
      showToast(`Discord Test Failed: ${err.message}`, 'error');
    } finally {
      btnTestDiscord.disabled = false;
      btnTestDiscord.textContent = 'Test Webhook';
    }
  });

  loadConfig();
}

document.addEventListener('DOMContentLoaded', initConfigPage);
