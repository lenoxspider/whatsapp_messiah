import { apiRequest } from './api.js';
import { commandPalette } from './palette.js';

export function initNavigationStatus() {
  const currentPath = window.location.pathname;

  // 1. Inject or verify Vertical Icon Rail
  ensureIconRail(currentPath);

  // 2. Inject or verify Persistent Top Status Bar
  ensureStatusBar();

  // 3. Status Poller
  let lastMessageTime = Date.now();
  async function updateStatus() {
    try {
      const data = await apiRequest('/api/status');
      renderStatusBar(data, lastMessageTime);
      updatePageCounters(data);
    } catch {
      renderStatusBar({ status: 'disconnected', pairedPhone: null, uptimeSeconds: 0 }, lastMessageTime);
    }
  }

  updateStatus();
  setInterval(updateStatus, 3000);
}

function ensureIconRail(currentPath) {
  if (document.querySelector('.icon-rail')) return;

  const rail = document.createElement('aside');
  rail.className = 'icon-rail';
  rail.id = 'app-icon-rail';
  rail.innerHTML = `
    <div class="rail-top">
      <a href="/" class="rail-brand" title="Messiah Operations Console">
        <span class="rail-brand-logo">🕊️</span>
        <span class="rail-brand-text">MESSIAH</span>
      </a>
    </div>

    <nav class="rail-nav">
      <a href="/" class="rail-item ${currentPath === '/' || currentPath === '/index.html' ? 'active' : ''}" title="Operations Console">
        <span class="rail-icon">⚡</span>
        <span class="rail-label">Console</span>
      </a>
      <a href="/vault.html" class="rail-item ${currentPath.includes('vault') ? 'active' : ''}" title="Second Brain Vault">
        <span class="rail-icon">🧠</span>
        <span class="rail-label">Vault</span>
      </a>
      <a href="/contacts.html" class="rail-item ${currentPath.includes('contacts') ? 'active' : ''}" title="Contacts & Tier Board">
        <span class="rail-icon">🛡️</span>
        <span class="rail-label">Tiers &amp; Intel</span>
      </a>
      <a href="/config.html" class="rail-item ${currentPath.includes('config') ? 'active' : ''}" title="System Config & Studio">
        <span class="rail-icon">⚙️</span>
        <span class="rail-label">Config</span>
      </a>
    </nav>

    <div class="rail-bottom">
      <button class="rail-action-btn" id="btn-density-toggle" title="Toggle Compact / Comfortable Density">
        <span class="rail-icon">Aa</span>
        <span class="rail-label">Density</span>
      </button>
      <button class="rail-action-btn" id="btn-rail-lock" title="Lock Console">
        <span class="rail-icon">🔒</span>
        <span class="rail-label">Lock</span>
      </button>
      <div class="rail-heartbeat" title="Daemon Heartbeat Engine">
        <span class="heartbeat-dot" id="rail-heartbeat-dot"></span>
        <span class="rail-label" id="rail-heartbeat-label">Connecting</span>
      </div>
    </div>
  `;

  document.body.prepend(rail);

  // Bind rail action buttons
  document.getElementById('btn-density-toggle')?.addEventListener('click', () => {
    commandPalette.toggleDensity();
  });

  document.getElementById('btn-rail-lock')?.addEventListener('click', () => {
    commandPalette.lockConsole();
  });
}

function ensureStatusBar() {
  if (document.querySelector('.status-bar')) return;

  const bar = document.createElement('header');
  bar.className = 'status-bar';
  bar.id = 'app-status-bar';
  bar.innerHTML = `
    <div class="status-left">
      <div class="status-pill" id="bar-status-pill">
        <span class="status-dot-sm" id="bar-dot"></span>
        <span id="bar-status-text" class="tabular-nums">Connecting...</span>
      </div>
      <span style="color: var(--border-focus);">|</span>
      <span id="bar-meta-text" class="tabular-nums" style="color: var(--text-muted); font-size: 0.76rem;">Session: --</span>
    </div>

    <div class="status-right">
      <div class="cmd-palette-pill" id="bar-cmd-btn" title="Open Command Palette (Cmd+K)">
        <span>Search / Actions</span>
        <span class="kbd-badge">⌘K</span>
      </div>
    </div>
  `;

  // Wrap or insert into main stage
  const main = document.querySelector('main') || document.body;
  if (!document.querySelector('.main-stage')) {
    const stage = document.createElement('div');
    stage.className = 'main-stage';
    document.body.appendChild(stage);
    stage.appendChild(bar);
    stage.appendChild(main);
  } else {
    document.querySelector('.main-stage')?.prepend(bar);
  }

  document.getElementById('bar-cmd-btn')?.addEventListener('click', () => {
    commandPalette.open();
  });
}

function renderStatusBar(data, lastMessageTime) {
  const dot = document.getElementById('bar-dot');
  const text = document.getElementById('bar-status-text');
  const meta = document.getElementById('bar-meta-text');
  const railDot = document.getElementById('rail-heartbeat-dot');
  const railLabel = document.getElementById('rail-heartbeat-label');

  const isLive = data.status === 'connected';

  if (dot) {
    dot.className = `status-dot-sm ${data.status || 'disconnected'}`;
  }
  if (railDot) {
    railDot.className = `heartbeat-dot ${isLive ? 'live' : ''}`;
  }

  if (text) {
    if (isLive) {
      text.textContent = data.pairedPhone ? `Connected · +${data.pairedPhone}` : 'Connected';
    } else if (data.status === 'connecting') {
      text.textContent = 'Socket Connecting...';
    } else {
      text.textContent = 'Socket Disconnected';
    }
  }

  if (meta && data.uptimeSeconds !== undefined) {
    const hrs = Math.floor(data.uptimeSeconds / 3600);
    const mins = Math.floor((data.uptimeSeconds % 3600) / 60);
    const secs = data.uptimeSeconds % 60;
    const uptimeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m ${secs}s`;
    meta.textContent = `Uptime: ${uptimeStr} · Engine: Baileys v6.7`;
  }

  if (railLabel) {
    railLabel.textContent = isLive ? 'Engine Live' : (data.status || 'Offline');
  }
}

function updatePageCounters(data) {
  const msgEl = document.getElementById('stat-messages-count');
  const noteEl = document.getElementById('stat-notes-count');
  const remEl = document.getElementById('stat-reminders-count');
  const upEl = document.getElementById('stat-uptime');

  if (data.stats) {
    if (msgEl) msgEl.textContent = Number(data.stats.messagesLogged || 0).toLocaleString();
    if (noteEl) noteEl.textContent = Number(data.stats.notesSaved || 0).toLocaleString();
    if (remEl) remEl.textContent = Number(data.stats.pendingReminders || 0).toLocaleString();
  }

  if (upEl && data.uptimeSeconds !== undefined) {
    const hrs = Math.floor(data.uptimeSeconds / 3600);
    const mins = Math.floor((data.uptimeSeconds % 3600) / 60);
    upEl.textContent = `${hrs}h ${mins}m`;
  }
}

document.addEventListener('DOMContentLoaded', initNavigationStatus);
