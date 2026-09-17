import { apiRequest } from '../api.js';
import { showToast } from '../main.js';

let currentTab = 'notes'; // 'notes' | 'reminders'
let currentTag = 'ALL';
let allItems = [];
let selectedIndex = 0;
let searchQuery = '';

export function initVaultPage() {
  const searchInput = document.getElementById('vault-search-input');
  const quickAddInput = document.getElementById('quick-add-input');
  const tabBtnNotes = document.getElementById('tab-btn-notes');
  const tabBtnReminders = document.getElementById('tab-btn-reminders');
  const btnClearSearch = document.getElementById('btn-clear-search');

  // Autofocus search on load
  searchInput?.focus();

  // Tab switching
  tabBtnNotes?.addEventListener('click', () => switchTab('notes'));
  tabBtnReminders?.addEventListener('click', () => switchTab('reminders'));

  // Quick Add Composer (Enter to save)
  quickAddInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const text = quickAddInput.value.trim();
      if (!text) return;

      let tag = 'inbox';
      let content = text;
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
        showToast('Note captured into vault!', 'success');
        quickAddInput.value = '';
        loadTags();
        loadItems();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });

  // Search input debounced
  let searchTimer = null;
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    if (btnClearSearch) btnClearSearch.style.display = searchQuery ? 'block' : 'none';

    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadItems();
    }, 200);
  });

  btnClearSearch?.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    btnClearSearch.style.display = 'none';
    loadItems();
  });

  // Global Keyboard Navigation (j, k, Enter, d)
  window.addEventListener('keydown', (e) => {
    if (document.activeElement === searchInput || document.activeElement === quickAddInput) return;

    if (e.key === 'j') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'k') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      inspectItem(allItems[selectedIndex]);
    } else if (e.key === 'd') {
      e.preventDefault();
      deleteSelectedItem();
    }
  });

  // Initial loads
  loadTags();
  loadItems();
}

function switchTab(tab) {
  currentTab = tab;
  const tabBtnNotes = document.getElementById('tab-btn-notes');
  const tabBtnReminders = document.getElementById('tab-btn-reminders');
  const listTitle = document.getElementById('list-pane-title');

  if (tab === 'notes') {
    tabBtnNotes.style.background = 'var(--bg-elevated)';
    tabBtnNotes.style.color = 'var(--accent-green)';
    tabBtnReminders.style.background = 'transparent';
    tabBtnReminders.style.color = 'var(--text-muted)';
    if (listTitle) listTitle.textContent = 'Notes Archive';
  } else {
    tabBtnReminders.style.background = 'var(--bg-elevated)';
    tabBtnReminders.style.color = 'var(--accent-amber)';
    tabBtnNotes.style.background = 'transparent';
    tabBtnNotes.style.color = 'var(--text-muted)';
    if (listTitle) listTitle.textContent = 'Reminders Timeline';
  }

  selectedIndex = 0;
  loadItems();
}

async function loadTags() {
  const container = document.getElementById('tag-chips-container');
  if (!container) return;

  try {
    const data = await apiRequest('/api/vault/tags');
    const tags = data.tags || [];

    container.innerHTML = `
      <span style="font-size: 0.72rem; color: var(--text-dim); font-family: var(--font-mono); margin-right: 0.25rem;">TAGS:</span>
      <div class="tag-chip ${currentTag === 'ALL' ? 'active' : ''}" data-tag="ALL">All Notes</div>
      ${tags.map(t => `
        <div class="tag-chip ${currentTag === t.tag ? 'active' : ''}" data-tag="${t.tag}">
          #${t.tag} <span class="delta-badge" style="margin-left: 0.25rem;">${t.count}</span>
        </div>
      `).join('')}
    `;

    container.querySelectorAll('.tag-chip').forEach(el => {
      el.addEventListener('click', () => {
        const tag = el.getAttribute('data-tag');
        currentTag = tag;
        container.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
        el.classList.add('active');
        loadItems();
      });
    });
  } catch {}
}

async function loadItems() {
  const container = document.getElementById('vault-list-container');
  if (!container) return;

  try {
    if (currentTab === 'notes') {
      let url = '/api/vault/notes';
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (currentTag !== 'ALL') params.append('tag', currentTag);
      if (params.toString()) url += `?${params.toString()}`;

      const data = await apiRequest(url);
      allItems = data.notes || [];

      document.getElementById('tab-notes-count').textContent = allItems.length;
      renderNotesList(allItems);
    } else {
      const data = await apiRequest('/api/vault/reminders');
      allItems = data.reminders || [];
      document.getElementById('tab-reminders-count').textContent = allItems.length;
      renderRemindersTimeline(allItems);
    }

    if (allItems.length > 0) {
      inspectItem(allItems[selectedIndex] || allItems[0]);
    } else {
      renderEmptyState();
    }
  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-coral); padding: 1.5rem; text-align: center;">Error loading items: ${err.message}</div>`;
  }
}

function renderNotesList(notes) {
  const container = document.getElementById('vault-list-container');
  if (!container) return;

  if (notes.length === 0) {
    renderEmptyState();
    return;
  }

  container.innerHTML = notes.map((n, idx) => {
    const isSelected = idx === selectedIndex;
    const relTime = formatRelativeTime(n.created_at);
    const snippet = highlightSnippet(n.content, searchQuery);

    return `
      <div class="tier-card ${isSelected ? 'selected' : ''}" data-idx="${idx}" style="cursor: pointer;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
          <span style="font-size: 0.72rem; padding: 0.1rem 0.4rem; border-radius: 3px; background: var(--accent-green-bg); color: var(--accent-green); font-family: var(--font-mono); font-weight: 600;">
            #${escapeHtml(n.tag || 'inbox')}
          </span>
          <span class="tabular-nums" style="font-size: 0.72rem; color: var(--text-dim);" title="${new Date(n.created_at).toLocaleString()}">
            ${relTime}
          </span>
        </div>
        <div style="font-size: 0.83rem; color: var(--text-main); line-height: 1.4;">
          ${snippet}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.tier-card').forEach(el => {
    el.addEventListener('click', () => {
      selectedIndex = Number(el.getAttribute('data-idx'));
      container.querySelectorAll('.tier-card').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      inspectItem(allItems[selectedIndex]);
    });
  });
}

function renderRemindersTimeline(reminders) {
  const container = document.getElementById('vault-list-container');
  if (!container) return;

  if (reminders.length === 0) {
    renderEmptyState();
    return;
  }

  const now = Date.now();
  const overdue = reminders.filter(r => r.trigger_at < now && r.status === 'pending');
  const upcoming = reminders.filter(r => r.trigger_at >= now && r.status === 'pending');
  const completed = reminders.filter(r => r.status === 'completed');

  let html = '';

  if (overdue.length > 0) {
    html += `<div class="timeline-group-title" style="color: var(--accent-amber);">⚠️ Overdue (${overdue.length})</div>`;
    html += overdue.map((r, i) => renderReminderRow(r, true)).join('');
  }

  if (upcoming.length > 0) {
    html += `<div class="timeline-group-title" style="margin-top: 0.85rem;">⏰ Upcoming (${upcoming.length})</div>`;
    html += upcoming.map(r => renderReminderRow(r, false)).join('');
  }

  if (completed.length > 0) {
    html += `<div class="timeline-group-title" style="margin-top: 0.85rem;">✓ Completed (${completed.length})</div>`;
    html += completed.map(r => renderReminderRow(r, false, true)).join('');
  }

  container.innerHTML = html;

  container.querySelectorAll('.reminder-row').forEach((el, idx) => {
    el.addEventListener('click', () => {
      selectedIndex = idx;
      container.querySelectorAll('.reminder-row').forEach(c => c.style.borderColor = 'var(--border-subtle)');
      el.style.borderColor = 'var(--accent-green)';
      inspectItem(allItems[selectedIndex]);
    });
  });
}

function renderReminderRow(r, isOverdue = false, isCompleted = false) {
  const rel = formatRelativeTime(r.trigger_at);
  const timeStr = new Date(r.trigger_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `
    <div class="reminder-row ${isOverdue ? 'overdue' : ''}" style="margin-bottom: 0.4rem; cursor: pointer;">
      <div style="flex: 1;">
        <div style="font-size: 0.84rem; color: ${isCompleted ? 'var(--text-dim)' : 'var(--text-main)'}; ${isCompleted ? 'text-decoration: line-through;' : ''}">
          ${escapeHtml(r.task)}
        </div>
        <div class="tabular-nums" style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.2rem;">
          ${timeStr} (${rel})
        </div>
      </div>
      ${!isCompleted ? `
        <button class="btn-complete-reminder" data-id="${r.id}" style="background: transparent; border: 1px solid var(--border-subtle); color: var(--accent-green); padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.72rem; cursor: pointer;">
          ✓ Mark Done
        </button>
      ` : ''}
    </div>
  `;
}

function inspectItem(item) {
  const container = document.getElementById('inspector-detail-container');
  const actions = document.getElementById('inspector-actions');
  if (!container || !item) return;

  if (currentTab === 'notes') {
    actions.innerHTML = `
      <button id="btn-copy-note" class="btn" style="background: var(--bg-hover); border: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 3px; cursor: pointer;">
        📋 Copy
      </button>
      <button id="btn-del-note" class="btn" style="background: var(--accent-coral-bg); border: 1px solid var(--accent-coral); color: var(--accent-coral); font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 3px; cursor: pointer;">
        🗑️ Delete
      </button>
    `;

    container.innerHTML = `
      <div style="margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-subtle);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="font-size: 0.78rem; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600;">
            #${escapeHtml(item.tag || 'inbox')}
          </span>
          <span class="tabular-nums" style="font-size: 0.75rem; color: var(--text-dim);">
            ${new Date(item.created_at).toLocaleString()}
          </span>
        </div>
        ${item.url ? `
          <div style="font-size: 0.78rem; margin-top: 0.25rem;">
            <a href="${item.url}" target="_blank" rel="noopener" style="color: var(--accent-green); text-decoration: none;">🔗 ${escapeHtml(item.url)}</a>
          </div>
        ` : ''}
      </div>

      <div style="font-size: 0.92rem; color: var(--text-main); line-height: 1.6; white-space: pre-wrap; font-family: var(--font-sans); word-break: break-word;">
        ${escapeHtml(item.content)}
      </div>
    `;

    document.getElementById('btn-copy-note')?.addEventListener('click', () => {
      navigator.clipboard.writeText(item.content);
      showToast('Copied note to clipboard', 'info');
    });

    document.getElementById('btn-del-note')?.addEventListener('click', () => deleteSelectedItem());
  } else {
    actions.innerHTML = `
      <button id="btn-del-reminder" class="btn" style="background: var(--accent-coral-bg); border: 1px solid var(--accent-coral); color: var(--accent-coral); font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 3px; cursor: pointer;">
        🗑️ Delete
      </button>
    `;

    container.innerHTML = `
      <div style="font-size: 0.82rem; color: var(--text-dim); text-transform: uppercase; font-family: var(--font-mono); margin-bottom: 0.5rem;">
        Reminder Task
      </div>
      <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 1.5rem; line-height: 1.4;">
        ${escapeHtml(item.task)}
      </div>

      <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.85rem; font-family: var(--font-mono); font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.5rem;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-dim);">Trigger Time:</span>
          <span class="tabular-nums" style="color: var(--text-main);">${new Date(item.trigger_at).toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-dim);">Status:</span>
          <span style="color: ${item.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-amber)'}; text-transform: uppercase; font-weight: 600;">${item.status}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-dim);">Target Phone:</span>
          <span class="tabular-nums" style="color: var(--text-muted);">${escapeHtml(item.target_jid || '--')}</span>
        </div>
      </div>
    `;

    document.getElementById('btn-del-reminder')?.addEventListener('click', () => deleteSelectedItem());
  }
}

function moveSelection(delta) {
  if (allItems.length === 0) return;
  selectedIndex = Math.max(0, Math.min(allItems.length - 1, selectedIndex + delta));
  const list = document.querySelectorAll('#vault-list-container > div');
  list.forEach((el, i) => {
    el.classList.toggle('selected', i === selectedIndex);
    if (i === selectedIndex) el.scrollIntoView({ block: 'nearest' });
  });
  inspectItem(allItems[selectedIndex]);
}

async function deleteSelectedItem() {
  const item = allItems[selectedIndex];
  if (!item) return;

  if (currentTab === 'notes') {
    if (!confirm('Permanently delete this note?')) return;
    try {
      const db = await apiRequest(`/api/vault/notes/${item.id}`, { method: 'DELETE' }).catch(() => null);
      showToast('Note deleted', 'info');
      loadItems();
      loadTags();
    } catch (err) {
      showToast(err.message, 'error');
    }
  } else {
    if (!confirm('Delete this scheduled reminder?')) return;
    try {
      await apiRequest(`/api/vault/reminders/${item.id}`, { method: 'DELETE' });
      showToast('Reminder deleted', 'info');
      loadItems();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function renderEmptyState() {
  const container = document.getElementById('vault-list-container');
  if (!container) return;

  if (currentTab === 'notes') {
    container.innerHTML = `
      <div style="padding: 3rem 1.5rem; text-align: center;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📝</div>
        <div style="font-weight: 600; color: var(--text-main); margin-bottom: 0.5rem;">No Vault Notes Found</div>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Capture a note from your phone by sending:
        </div>
        <div style="display: inline-block; background: var(--bg-elevated); border: 1px solid var(--border-subtle); padding: 0.4rem 0.85rem; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 0.82rem; color: var(--accent-green);">
          !note #project Review VPS setup script
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div style="padding: 3rem 1.5rem; text-align: center;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">⏰</div>
        <div style="font-weight: 600; color: var(--text-main); margin-bottom: 0.5rem;">No Reminders Scheduled</div>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Schedule natural language reminders from WhatsApp:
        </div>
        <div style="display: inline-block; background: var(--bg-elevated); border: 1px solid var(--border-subtle); padding: 0.4rem 0.85rem; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 0.82rem; color: var(--accent-amber);">
          !remind in 10 minutes to stretch
        </div>
      </div>
    `;
  }
}

function highlightSnippet(content, query) {
  if (!content) return '';
  if (!query) {
    return content.length > 120 ? escapeHtml(content.slice(0, 120)) + '...' : escapeHtml(content);
  }

  const clean = escapeHtml(content);
  const words = query.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return clean;

  const pattern = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return clean.replace(pattern, '<mark style="background: rgba(29, 158, 117, 0.35); color: #fff; border-radius: 2px; padding: 0 2px;">$1</mark>');
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(Math.abs(diff) / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (diff < 0) {
    if (mins < 60) return `in ${mins}m`;
    if (hrs < 24) return `in ${hrs}h`;
    return `in ${days}d`;
  }

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

document.addEventListener('DOMContentLoaded', initVaultPage);
