import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { env } from '../../config/env.js';

export const configRouter = Router();

configRouter.get('/', (req, res) => {
  res.json({
    pairingMethod: env.pairingMethod,
    phoneNumber: env.phoneNumber,
    ownerJid: env.ownerJid,
    openaiModel: env.openaiModel,
    openaiConfigured: Boolean(env.openaiApiKey),
    openaiKeyMasked: env.openaiApiKey ? `${env.openaiApiKey.slice(0, 7)}...${env.openaiApiKey.slice(-4)}` : '',
    discordConfigured: Boolean(env.discordWebhookUrl),
    discordWebhookMasked: env.discordWebhookUrl ? `${env.discordWebhookUrl.slice(0, 35)}...` : '',
    ghostHandlerEnabled: env.ghostHandlerEnabled,
    autonomousGhost: env.autonomousGhost,
    autoRejectCalls: env.autoRejectCalls,
    forwardMediaToDiscord: env.forwardMediaToDiscord,
    typingSpeedMs: env.typingSpeedMs,
    maxTypingDelayMs: env.maxTypingDelayMs
  });
});

configRouter.post('/', (req, res) => {
  const {
    openaiApiKey,
    openaiModel,
    discordWebhookUrl,
    phoneNumber,
    ownerJid,
    ghostHandlerEnabled,
    autonomousGhost,
    autoRejectCalls,
    forwardMediaToDiscord,
    typingSpeedMs,
    maxTypingDelayMs
  } = req.body;

  if (openaiApiKey !== undefined && openaiApiKey !== '') env.openaiApiKey = openaiApiKey;
  if (openaiModel !== undefined) env.openaiModel = openaiModel;
  if (discordWebhookUrl !== undefined) env.discordWebhookUrl = discordWebhookUrl;
  if (phoneNumber !== undefined) env.phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
  if (ownerJid !== undefined) env.ownerJid = ownerJid;
  if (ghostHandlerEnabled !== undefined) env.ghostHandlerEnabled = Boolean(ghostHandlerEnabled);
  if (autonomousGhost !== undefined) env.autonomousGhost = Boolean(autonomousGhost);
  if (autoRejectCalls !== undefined) env.autoRejectCalls = Boolean(autoRejectCalls);
  if (forwardMediaToDiscord !== undefined) env.forwardMediaToDiscord = Boolean(forwardMediaToDiscord);
  if (typingSpeedMs !== undefined) env.typingSpeedMs = Number(typingSpeedMs);
  if (maxTypingDelayMs !== undefined) env.maxTypingDelayMs = Number(maxTypingDelayMs);

  // Write changes back to .env
  try {
    const envPath = path.resolve('.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    const setEnvVar = (key: string, val: string) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    };

    if (env.openaiApiKey) setEnvVar('OPENAI_API_KEY', env.openaiApiKey);
    if (env.openaiModel) setEnvVar('OPENAI_MODEL', env.openaiModel);
    if (env.discordWebhookUrl) setEnvVar('DISCORD_WEBHOOK_URL', env.discordWebhookUrl);
    if (env.phoneNumber) setEnvVar('PHONE_NUMBER', env.phoneNumber);
    if (env.ownerJid) setEnvVar('OWNER_JID', env.ownerJid);
    setEnvVar('GHOST_HANDLER_ENABLED', env.ghostHandlerEnabled ? '1' : '0');
    setEnvVar('AUTONOMOUS_GHOST', env.autonomousGhost ? '1' : '0');
    setEnvVar('AUTO_REJECT_CALLS', env.autoRejectCalls ? '1' : '0');
    setEnvVar('FORWARD_MEDIA_TO_DISCORD', env.forwardMediaToDiscord ? '1' : '0');
    setEnvVar('TYPING_SPEED_MS', String(env.typingSpeedMs));
    setEnvVar('MAX_TYPING_DELAY_MS', String(env.maxTypingDelayMs));

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
  } catch (err) {
    console.error('[Config Route] Failed to persist .env file:', err);
  }

  res.json({ success: true, message: 'Configuration saved.' });
});

configRouter.post('/test-openai', async (req, res) => {
  const key = req.body.key || env.openaiApiKey;
  if (!key) {
    return res.status(400).json({ error: 'No OpenAI API Key provided.' });
  }

  try {
    const client = new OpenAI({ apiKey: key });
    const response = await client.chat.completions.create({
      model: req.body.model || env.openaiModel || 'gpt-4o',
      messages: [{ role: 'user', content: 'Say "Messiah AI online" in 3 words.' }],
      max_tokens: 15
    });

    const reply = response.choices[0]?.message?.content?.trim() || 'Success';
    res.json({ success: true, reply });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'OpenAI authentication failed.' });
  }
});

configRouter.post('/test-discord', async (req, res) => {
  const webhookUrl = req.body.url || env.discordWebhookUrl;
  if (!webhookUrl) {
    return res.status(400).json({ error: 'No Discord webhook URL provided.' });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Messiah Sentinel (Test)',
        embeds: [{
          title: '✅ Discord Webhook Connected',
          color: 0x00ff88,
          description: 'This is a test notification from your WhatsApp Messiah dashboard.',
          timestamp: new Date().toISOString()
        }]
      })
    });

    if (response.ok) {
      res.json({ success: true, message: 'Test message sent to Discord channel!' });
    } else {
      res.status(response.status).json({ success: false, error: `Discord returned HTTP ${response.status}` });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

configRouter.post('/preview-reply', async (req, res) => {
  const { systemPrompt, messageText } = req.body;
  if (!systemPrompt || !messageText) {
    return res.status(400).json({ error: 'systemPrompt and messageText are required.' });
  }

  if (!env.openaiApiKey) {
    return res.status(400).json({ error: 'OpenAI API key is not configured.' });
  }

  try {
    const client = new OpenAI({ apiKey: env.openaiApiKey });
    const response = await client.chat.completions.create({
      model: env.openaiModel || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: messageText }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const reply = response.choices[0]?.message?.content?.trim() || '';
    res.json({ success: true, reply });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
