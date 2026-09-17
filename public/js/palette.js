import { apiRequest } from './api.js';
import { showToast } from './main.js';

class CommandPalette {
  constructor() {
    this.isOpen = false;
    this.selectedIndex = 0;
    this.items = [];
    this.init();
  }

  init() {
    this.renderModal();
    this.bindGlobalKeys();
    this.loadCommands();
    this.initDensity();
  }

  initDensity() {
    const saved = localStorage.getItem('messiah_density');
    if (saved === 'compact') {
      document.body.classList.add('compact');
    }
  }

  toggleDensity() {
    const isCompact = document.body.classList.toggle('compact');
    localStorage.setItem('messiah_density', isCompact ? 'compact' : 'comfortable');
    showToast(`Density set to ${isCompact ? 'Compact' : 'Comfortable'}`);
  }

  renderModal() {
    const backdrop = document.createElement('div');
    backdrop.id = 'palette-backdrop';
    backdrop.className = 'palette-backdrop';
    backdrop.innerHTML = `
      <div class="palette-dialog" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div class="palette-input-box">
          <span style="color: var(--text-dim);">⌘</span>
          <input type="text" id="palette-search" class="palette-input" placeholder="Type a command or jump to page..." autofocus autocomplete="off" />
          <span class="kbd-badge">ESC</span>
        </div>
        <div id="palette-list" class="palette-list"></div>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    const input = document.getElementById('palette-search');
    input?.addEventListener('input', () => this.filterCommands(input.value));
    input?.addEventListener('keydown', (e) => this.handleNavigationKeys(e));
  }

  loadCommands() {
    this.items = [
      { id: 'nav-console', label: 'Go to Operations Console', category: 'Navigation', shortcut: 'G C', action: () => window.location.href = '/' },
      { id: 'nav-vault', label: 'Go to Second Brain Vault', category: 'Navigation', shortcut: 'G V', action: () => window.location.href = '/vault.html' },
      { id: 'nav-contacts', label: 'Go to Contacts & Tier Board', category: 'Navigation', shortcut: 'G T', action: () => window.location.href = '/contacts.html' },
      { id: 'nav-agent', label: 'Go to Agent Missions & Autopilot', category: 'Navigation', shortcut: 'G A', action: () => window.location.href = '/agent.html' },
      { id: 'nav-config', label: 'Go to Config & Persona Studio', category: 'Navigation', shortcut: 'G S', action: () => window.location.href = '/config.html' },
      { id: 'act-note', label: 'Quick Add Note to Vault', category: 'Actions', shortcut: 'N', action: () => this.quickAddNote() },
      { id: 'act-density', label: 'Toggle Density (Compact / Comfortable)', category: 'Display', shortcut: 'D', action: () => this.toggleDensity() },
      { id: 'act-reconnect', label: 'Force WhatsApp Reconnect', category: 'System', shortcut: 'R', action: () => this.forceReconnect() },
      { id: 'act-lock', label: 'Lock Dashboard Console', category: 'Security', shortcut: 'L', action: () => this.lockConsole() }
    ];
    this.filtered = [...this.items];
  }

  bindGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
        return;
      }
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  open() {
    this.isOpen = true;
    const backdrop = document.getElementById('palette-backdrop');
    const input = document.getElementById('palette-search');
    if (backdrop) backdrop.classList.add('open');
    if (input) {
      input.value = '';
      input.focus();
    }
    this.filtered = [...this.items];
    this.selectedIndex = 0;
    this.renderList();
  }

  close() {
    this.isOpen = false;
    const backdrop = document.getElementById('palette-backdrop');
    if (backdrop) backdrop.classList.remove('open');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  filterCommands(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      this.filtered = [...this.items];
    } else {
      this.filtered = this.items.filter(item => 
        item.label.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
      );
    }
    this.selectedIndex = 0;
    this.renderList();
  }

  renderList() {
    const container = document.getElementById('palette-list');
    if (!container) return;

    if (this.filtered.length === 0) {
      container.innerHTML = '<div style="color: var(--text-dim); padding: 1rem; text-align: center; font-size: 0.85rem;">No commands found</div>';
      return;
    }

    container.innerHTML = this.filtered.map((item, idx) => `
      <div class="palette-item ${idx === this.selectedIndex ? 'active' : ''}" data-idx="${idx}">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">[${item.category}]</span>
          <span>${item.label}</span>
        </div>
        <span class="palette-item-shortcut">${item.shortcut}</span>
      </div>
    `).join('');

    container.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-idx'));
        this.executeItem(idx);
      });
    });
  }

  handleNavigationKeys(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % this.filtered.length;
      this.renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex - 1 + this.filtered.length) % this.filtered.length;
      this.renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.executeItem(this.selectedIndex);
    }
  }

  executeItem(index) {
    const item = this.filtered[index];
    if (item) {
      this.close();
      item.action();
    }
  }

  async quickAddNote() {
    const text = prompt('Quick Add Note (e.g. #idea Check memory leaks on Ubuntu):');
    if (!text || !text.trim()) return;

    let tag = 'inbox';
    let content = text.trim();
    const tagMatch = content.match(/^#(\w+)\s+(.+)/s);
    if (tagMatch) {
      tag = tagMatch[1];
      content = tagMatch[2];
    }

    try {
      await apiRequest('/api/vault/notes', {
        method: 'POST',
        body: { content, tag }
      });
      showToast('Note captured to vault!', 'success');
      if (window.location.pathname.includes('vault.html')) {
        window.location.reload();
      }
    } catch (err) {
      showToast('Failed to save note: ' + err.message, 'error');
    }
  }

  async forceReconnect() {
    try {
      await apiRequest('/api/pair/reconnect', { method: 'POST' });
      showToast('Reconnection dispatched.', 'success');
    } catch (err) {
      showToast('Reconnect failed: ' + err.message, 'error');
    }
  }

  async lockConsole() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('messiah_token');
    window.location.href = '/login.html';
  }
}

export const commandPalette = new CommandPalette();
