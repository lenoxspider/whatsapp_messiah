import { apiRequest } from '../api.js';
import { showToast } from '../main.js';

let contactsList = [];
let revokedIntel = { totalRevoked: 0, topDeleters: [], messages: [] };
let selectedCard = null;
let currentSubTab = 'directory'; // 'directory' | 'tiers' | 'revoked'
let revokedActiveFilter = 'all'; // 'all' | 'media' | 'view_once'
let directoryFilterTier = 'all';
let directorySearchQuery = '';
let activeContactJid = null;

export function initContactsPage() {
  const tabBtnDirectory = document.getElementById('tab-btn-directory');
  const tabBtnTiers = document.getElementById('tab-btn-tiers');
  const tabBtnRevoked = document.getElementById('tab-btn-revoked');
  const tabBtnDormant = document.getElementById('tab-btn-dormant');
  const tabBtnTasks = document.getElementById('tab-btn-tasks');
  const viewDirectory = document.getElementById('view-directory');
  const viewTierBoard = document.getElementById('view-tier-board');
  const viewRevokedInbox = document.getElementById('view-revoked-inbox');
  const viewDormant = document.getElementById('view-dormant');
  const viewTasks = document.getElementById('view-tasks');

  function switchTab(tab) {
    currentSubTab = tab;
    [tabBtnDirectory, tabBtnTiers, tabBtnRevoked, tabBtnDormant, tabBtnTasks].forEach(b => {
      if (b) {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
      }
    });

    if (viewDirectory) viewDirectory.style.display = tab === 'directory' ? 'block' : 'none';
    if (viewTierBoard) viewTierBoard.style.display = tab === 'tiers' ? 'block' : 'none';
    if (viewRevokedInbox) viewRevokedInbox.style.display = tab === 'revoked' ? 'block' : 'none';
    if (viewDormant) viewDormant.style.display = tab === 'dormant' ? 'block' : 'none';
    if (viewTasks) viewTasks.style.display = tab === 'tasks' ? 'block' : 'none';

    if (tab === 'directory') {
      if (tabBtnDirectory) {
        tabBtnDirectory.style.background = 'var(--bg-elevated)';
        tabBtnDirectory.style.color = 'var(--accent-green)';
      }
      renderDirectory();
    } else if (tab === 'tiers') {
      if (tabBtnTiers) {
        tabBtnTiers.style.background = 'var(--bg-elevated)';
        tabBtnTiers.style.color = 'var(--accent-green)';
      }
      renderTierBoard();
    } else if (tab === 'revoked') {
      if (tabBtnRevoked) {
        tabBtnRevoked.style.background = 'var(--bg-elevated)';
        tabBtnRevoked.style.color = 'var(--accent-coral)';
      }
      loadRevokedIntel();
    } else if (tab === 'dormant') {
      if (tabBtnDormant) {
        tabBtnDormant.style.background = 'var(--bg-elevated)';
        tabBtnDormant.style.color = '#38bdf8';
      }
      loadDormantThreads();
    } else if (tab === 'tasks') {
      if (tabBtnTasks) {
        tabBtnTasks.style.background = 'var(--bg-elevated)';
        tabBtnTasks.style.color = '#6366f1';
      }
      loadAgentTasks();
    }
  }

  tabBtnDirectory?.addEventListener('click', () => switchTab('directory'));
  tabBtnTiers?.addEventListener('click', () => switchTab('tiers'));
  tabBtnRevoked?.addEventListener('click', () => switchTab('revoked'));
  tabBtnDormant?.addEventListener('click', () => switchTab('dormant'));
  tabBtnTasks?.addEventListener('click', () => switchTab('tasks'));

  document.getElementById('btn-refresh-tasks')?.addEventListener('click', () => loadAgentTasks());
  document.getElementById('task-filter-status')?.addEventListener('change', () => loadAgentTasks());
  document.getElementById('btn-create-task-modal')?.addEventListener('click', () => openCreateTaskModal());
  document.getElementById('btn-close-task-modal')?.addEventListener('click', () => closeCreateTaskModal());
  document.getElementById('btn-cancel-task-modal')?.addEventListener('click', () => closeCreateTaskModal());
  document.getElementById('form-create-task')?.addEventListener('submit', handleCreateTaskSubmit);

  document.getElementById('btn-refresh-dormant')?.addEventListener('click', () => loadDormantThreads());
  document.getElementById('dormant-days-select')?.addEventListener('change', () => loadDormantThreads());

  // Search in Directory
  const searchInput = document.getElementById('directory-search-input');
  searchInput?.addEventListener('input', (e) => {
    directorySearchQuery = (e.target.value || '').toLowerCase().trim();
    renderDirectory();
  });

  // Tier Filter Chips in Directory
  document.querySelectorAll('#directory-tier-filter-chips .btn-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#directory-tier-filter-chips .btn-filter-chip').forEach(b => b.classList.remove('active-filter'));
      btn.classList.add('active-filter');
      directoryFilterTier = btn.getAttribute('data-tier') || 'all';
      renderDirectory();
    });
  });

  // Filter Chips in Revoked Inbox
  document.querySelectorAll('#revoked-filter-chips .btn-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#revoked-filter-chips .btn-filter-chip').forEach(b => b.classList.remove('active-filter'));
      btn.classList.add('active-filter');
      revokedActiveFilter = btn.getAttribute('data-filter') || 'all';
      renderRevokedList(revokedIntel.messages || []);
    });
  });

  // Keyboard Reclassification: 1-5 in Tier Board
  window.addEventListener('keydown', (e) => {
    if (currentSubTab !== 'tiers' || !selectedCard) return;
    if (['1', '2', '3', '4', '5'].includes(e.key)) {
      const newTier = Number(e.key);
      const jid = selectedCard.getAttribute('data-jid');
      if (jid) {
        updateContactTier(jid, newTier);
      }
    }
  });

  // Setup Drag and Drop on Columns
  setupDragAndDrop();

  // Export actions in Revoked View
  document.getElementById('btn-export-json')?.addEventListener('click', exportRevokedJSON);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportRevokedCSV);

  // Load Initial Contacts
  loadContacts();
}

async function loadContacts() {
  try {
    const data = await apiRequest('/api/contacts');
    contactsList = data.contacts || [];

    // Sort by recency of interaction
    contactsList.sort((a, b) => (b.last_interaction || 0) - (a.last_interaction || 0));

    const totalBadge = document.getElementById('directory-total-badge');
    if (totalBadge) totalBadge.textContent = contactsList.length;

    const totalContactsLabel = document.getElementById('total-contacts-label');
    if (totalContactsLabel) totalContactsLabel.textContent = `${contactsList.length} Contacts Tracked`;

    renderDirectory();
    renderTierBoard();

    // Auto-select first contact if none selected
    if (!activeContactJid && contactsList.length > 0) {
      loadContactDossier(contactsList[0].jid);
    }
  } catch (err) {
    showToast('Failed to load contacts: ' + err.message, 'error');
  }
}

// ------------------------------------------------------------------------------
// VIEW 0: Contacts Directory
// ------------------------------------------------------------------------------
function getTierLabel(tier) {
  switch (Number(tier)) {
    case 1: return { label: 'T1 VIP', color: 'var(--tier-1)' };
    case 2: return { label: 'T2 Acquaintance', color: 'var(--tier-2)' };
    case 3: return { label: 'T3 Business', color: 'var(--tier-3)' };
    case 4: return { label: 'T4 Stranger', color: 'var(--tier-4)' };
    case 5: return { label: 'T5 Muted', color: 'var(--tier-5)' };
    default: return { label: 'T4 Stranger', color: 'var(--tier-4)' };
  }
}

function renderDirectory() {
  const container = document.getElementById('directory-list-container');
  if (!container) return;

  let filtered = contactsList;

  if (directoryFilterTier !== 'all') {
    filtered = filtered.filter(c => Number(c.tier) === Number(directoryFilterTier));
  }

  if (directorySearchQuery) {
    filtered = filtered.filter(c => {
      const name = (c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const jid = (c.jid || '').toLowerCase();
      return name.includes(directorySearchQuery) || phone.includes(directorySearchQuery) || jid.includes(directorySearchQuery);
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 2.5rem 1rem; text-align: center; color: var(--text-dim); font-size: 0.8rem;">
        No contacts match your query.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = `directory-card ${activeContactJid === c.jid ? 'active-contact' : ''}`;
    card.setAttribute('data-jid', c.jid);

    const phone = c.phone || c.jid.split('@')[0];
    const name = c.name || `+${phone}`;
    const tierMeta = getTierLabel(c.tier);
    const lastActive = c.last_interaction ? formatRelativeTime(c.last_interaction) : 'Never';

    const factsBadge = c.facts_count > 0 
      ? `<span class="delta-badge" style="font-size: 0.68rem; color: var(--accent-purple); background: rgba(127, 119, 221, 0.15); border: 1px solid rgba(127, 119, 221, 0.3);">🧠 ${c.facts_count}</span>` 
      : '';

    const revokedBadge = c.revoked_count > 0 
      ? `<span class="delta-badge" style="font-size: 0.68rem; color: var(--accent-coral); background: rgba(226, 75, 75, 0.15); border: 1px solid rgba(226, 75, 75, 0.3);">🛡️ ${c.revoked_count}</span>` 
      : '';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
        <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(name)}
        </div>
        <span class="delta-badge" style="font-size: 0.68rem; color: ${tierMeta.color}; border: 1px solid ${tierMeta.color};">
          ${tierMeta.label}
        </span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono);">
        <span class="tabular-nums">+${phone}</span>
        <div style="display: flex; gap: 0.35rem; align-items: center;">
          ${factsBadge}
          ${revokedBadge}
          <span class="tabular-nums">${lastActive}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.directory-card').forEach(el => el.classList.remove('active-contact'));
      card.classList.add('active-contact');
      loadContactDossier(c.jid);
    });

    container.appendChild(card);
  });
}

async function loadContactDossier(jid) {
  activeContactJid = jid;
  const container = document.getElementById('dossier-content-container');
  const badge = document.getElementById('dossier-tier-badge');
  if (!container) return;

  container.innerHTML = `
    <div style="padding: 3rem; text-align: center; color: var(--text-dim); font-size: 0.82rem;">
      Loading contact intelligence dossier...
    </div>
  `;

  try {
    const data = await apiRequest(`/api/contacts/${encodeURIComponent(jid)}/details`);
    renderDossier(data);
  } catch (err) {
    container.innerHTML = `
      <div style="padding: 2rem; color: var(--accent-coral); font-size: 0.82rem;">
        Failed to load dossier: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

function renderDossier(data) {
  const container = document.getElementById('dossier-content-container');
  const tierBadge = document.getElementById('dossier-tier-badge');
  if (!container) return;

  const { contact, facts, recentMessages, stats } = data;
  const phone = contact.phone || contact.jid.split('@')[0];
  const name = contact.name || `+${phone}`;
  const tierMeta = getTierLabel(contact.tier);

  if (tierBadge) {
    tierBadge.textContent = tierMeta.label;
    tierBadge.style.color = tierMeta.color;
    tierBadge.style.border = `1px solid ${tierMeta.color}`;
  }

  container.innerHTML = `
    <!-- Contact Profile Header -->
    <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <h2 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.2rem;">
              ${escapeHtml(name)}
            </h2>
            <button type="button" id="btn-rename-contact" class="btn" style="background: transparent; border: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 0.72rem; padding: 0.2rem 0.55rem; border-radius: 4px; cursor: pointer;" title="Rename contact">
              ✏️ Rename
            </button>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-dim); display: flex; gap: 0.75rem;">
            <span>📱 +${phone}</span>
            <span>🆔 ${escapeHtml(contact.jid)}</span>
            <span>⏱️ ${contact.last_interaction ? formatRelativeTime(contact.last_interaction) : 'Never'}</span>
          </div>
        </div>
      </div>

      <!-- Fast Tier Selector Bar -->
      <div style="border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
        <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-family: var(--font-mono); margin-bottom: 0.4rem;">
          Classify Relationship Tier:
        </div>
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;" id="dossier-tier-buttons">
          ${[1, 2, 3, 4, 5].map(t => {
            const meta = getTierLabel(t);
            const isActive = contact.tier === t;
            return `
              <button type="button" class="btn btn-tier-select" data-tier="${t}" style="
                background: ${isActive ? meta.color : 'var(--bg-surface)'};
                color: ${isActive ? '#fff' : 'var(--text-muted)'};
                border: 1px solid ${meta.color};
                padding: 0.35rem 0.65rem;
                border-radius: var(--radius-sm);
                font-size: 0.76rem;
                font-weight: 600;
                cursor: pointer;
              ">
                ${meta.label}
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Autopilot & Task Delegation Quick Controls -->
      <div style="border-top: 1px solid var(--border-subtle); padding-top: 0.75rem; margin-top: 0.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <div style="font-size: 0.78rem; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 0.35rem;">
            <span>🤖</span> WhatsApp Agent Autopilot
          </div>
          <div style="font-size: 0.7rem; color: var(--text-dim);">
            ${contact.autopilot_enabled ? 'Agent autonomously replies in character' : 'Autopilot passive (inherits global tier setting)'}
          </div>
        </div>
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          <button type="button" id="btn-toggle-contact-autopilot" class="btn" style="
            background: ${contact.autopilot_enabled ? '#10b981' : 'var(--bg-surface)'};
            color: ${contact.autopilot_enabled ? '#fff' : 'var(--text-muted)'};
            border: 1px solid ${contact.autopilot_enabled ? '#10b981' : 'var(--border-subtle)'};
            padding: 0.3rem 0.65rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 600; cursor: pointer;
          ">
            ${contact.autopilot_enabled ? '✅ Autopilot ON' : '⏸️ Autopilot OFF'}
          </button>
          <button type="button" id="btn-assign-contact-task" class="btn" style="
            background: #6366f1; color: #fff; border: none; padding: 0.3rem 0.65rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 600; cursor: pointer;
          ">
            + Assign Goal
          </button>
        </div>
      </div>

      <!-- Quick Metrics Strip -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin-top: 0.85rem;">
        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 0.5rem; border-radius: var(--radius-sm); text-align: center;">
          <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase;">Messages</div>
          <div class="tabular-nums" style="font-size: 1rem; font-weight: 700; color: var(--accent-blue); font-family: var(--font-mono);">${stats.totalMessages || 0}</div>
        </div>
        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 0.5rem; border-radius: var(--radius-sm); text-align: center;">
          <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase;">Revocations</div>
          <div class="tabular-nums" style="font-size: 1rem; font-weight: 700; color: var(--accent-coral); font-family: var(--font-mono);">${stats.revokedCount || 0}</div>
        </div>
        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 0.5rem; border-radius: var(--radius-sm); text-align: center;">
          <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase;">Calls Recorded</div>
          <div class="tabular-nums" style="font-size: 1rem; font-weight: 700; color: var(--accent-purple); font-family: var(--font-mono);">${stats.totalCalls || 0}</div>
        </div>
      </div>
    </div>

    <!-- AI Executive Dossier & Commitments Card -->
    <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
        <div style="font-size: 0.84rem; font-weight: 600; color: #38bdf8; display: flex; align-items: center; gap: 0.4rem;">
          <span>📋</span> AI Executive Dossier &amp; Commitments
        </div>
        <button type="button" id="btn-force-refresh-dossier" class="btn" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-dim); font-size: 0.72rem; padding: 0.2rem 0.55rem; border-radius: var(--radius-sm); cursor: pointer;">
          🔄 Force Refresh
        </button>
      </div>

      <div id="ai-dossier-panel">
        <div style="color: var(--text-dim); font-size: 0.78rem; text-align: center; padding: 1rem;">
          Loading AI synthesis...
        </div>
      </div>
    </div>

    <!-- Living Memory & Extracted Facts -->
    <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
        <div style="font-size: 0.84rem; font-weight: 600; color: var(--accent-purple); display: flex; align-items: center; gap: 0.4rem;">
          <span>🧠</span> Living Memory Facts (${facts.length})
        </div>
        <span style="font-size: 0.72rem; color: var(--text-dim);">Extracted by AI background memory</span>
      </div>

      <div id="facts-list" style="display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.85rem;">
        ${facts.length === 0 
          ? `<div style="font-size: 0.78rem; color: var(--text-dim); padding: 0.5rem 0;">No facts recorded for this contact yet.</div>`
          : facts.map(f => `
            <div class="fact-item" data-fact-id="${f.id}">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                <span class="delta-badge" style="font-size: 0.68rem; text-transform: uppercase;">${escapeHtml(f.category || 'general')}</span>
                <span style="color: var(--text-main); font-size: 0.8rem;">${escapeHtml(f.fact)}</span>
              </div>
              <button type="button" class="btn-delete-fact" data-fact-id="${f.id}" style="background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 0.85rem;" title="Delete fact">✕</button>
            </div>
          `).join('')
        }
      </div>

      <!-- Add Fact Inline -->
      <div style="display: flex; gap: 0.4rem;">
        <input type="text" id="input-new-fact" placeholder="Add custom memory/fact..." style="flex: 1; background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.78rem;" />
        <select id="select-fact-category" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 0.4rem; border-radius: var(--radius-sm); font-size: 0.75rem;">
          <option value="general">General</option>
          <option value="workplace">Workplace</option>
          <option value="location">Location</option>
          <option value="preference">Preference</option>
          <option value="commitment">Commitment</option>
          <option value="family">Family</option>
        </select>
        <button type="button" id="btn-add-fact" class="btn" style="background: var(--accent-purple); color: #fff; border: none; padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.76rem; font-weight: 600; cursor: pointer;">
          + Add
        </button>
      </div>
    </div>

    <!-- Custom Persona Override -->
    <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <div style="font-size: 0.84rem; font-weight: 600; color: var(--accent-green); display: flex; align-items: center; gap: 0.4rem;">
          <span>🎭</span> Custom Ghost Persona Override
        </div>
        <span style="font-size: 0.72rem; color: var(--text-dim);">Overrides Default Tier Persona for this contact</span>
      </div>
      <textarea id="dossier-persona-editor" rows="3" placeholder="Leave blank to use default tier persona. Or write custom instructions: e.g. 'Always reply in French', 'Be extremely polite and brief'." style="width: 100%; background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 0.5rem; border-radius: var(--radius-sm); font-size: 0.8rem; font-family: var(--font-sans); line-height: 1.4; margin-bottom: 0.5rem;">${escapeHtml(contact.custom_persona || '')}</textarea>
      <div style="display: flex; justify-content: flex-end;">
        <button type="button" id="btn-save-dossier-persona" class="btn" style="background: var(--accent-green); color: #fff; border: none; padding: 0.4rem 0.85rem; border-radius: var(--radius-sm); font-size: 0.78rem; font-weight: 600; cursor: pointer;">
          Save Persona Override
        </button>
      </div>
    </div>

    <!-- Recent Chat History (Last 25 Messages) -->
    <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem;">
      <div style="font-size: 0.84rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.75rem; display: flex; justify-content: space-between;">
        <span>💬 Recent Conversation Stream</span>
        <span style="font-size: 0.72rem; color: var(--text-dim); font-family: var(--font-mono);">${recentMessages.length} Messages Cached</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 320px; overflow-y: auto; padding: 0.5rem;">
        ${recentMessages.length === 0
          ? `<div style="font-size: 0.78rem; color: var(--text-dim); text-align: center; padding: 1.5rem;">No recent messages logged.</div>`
          : recentMessages.map(m => {
            const isMe = Boolean(m.from_me);
            const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const date = new Date(m.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
            const isRevoked = Boolean(m.is_revoked);

            return `
              <div class="chat-bubble ${isMe ? 'from-me' : 'from-them'}">
                <div style="display: flex; justify-content: space-between; gap: 0.75rem; font-size: 0.68rem; color: var(--text-dim); margin-bottom: 0.2rem; font-family: var(--font-mono);">
                  <span>${isMe ? 'Me' : escapeHtml(name)}</span>
                  <span>${date} ${time} ${isRevoked ? '<span style="color: var(--accent-coral);">[REVOKED]</span>' : ''}</span>
                </div>
                <div style="word-break: break-word;">${escapeHtml(m.content || '[Media / Attachment]')}</div>
              </div>
            `;
          }).join('')
        }
      </div>
    </div>
  `;

  // Bind Tier Change Buttons
  document.querySelectorAll('#dossier-tier-buttons .btn-tier-select').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newTier = Number(btn.getAttribute('data-tier'));
      await updateContactTier(contact.jid, newTier);
      contact.tier = newTier;
      renderDossier({ ...data, contact });
      renderDirectory();
    });
  });

  // Bind Delete Fact
  document.querySelectorAll('.btn-delete-fact').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const factId = btn.getAttribute('data-fact-id');
      try {
        await apiRequest(`/api/contacts/facts/${factId}`, { method: 'DELETE' });
        showToast('Memory fact deleted', 'success');
        loadContactDossier(contact.jid);
        loadContacts();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Bind Add Fact
  const inputFact = document.getElementById('input-new-fact');
  const selectCat = document.getElementById('select-fact-category');
  const btnAddFact = document.getElementById('btn-add-fact');

  btnAddFact?.addEventListener('click', async () => {
    const factText = inputFact?.value.trim();
    const category = selectCat?.value || 'general';
    if (!factText) {
      showToast('Please enter fact content', 'error');
      return;
    }

    try {
      await apiRequest(`/api/contacts/${encodeURIComponent(contact.jid)}/facts`, {
        method: 'POST',
        body: { fact: factText, category }
      });
      showToast('Memory fact added!', 'success');
      loadContactDossier(contact.jid);
      loadContacts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Bind Rename Contact
  const btnRename = document.getElementById('btn-rename-contact');
  btnRename?.addEventListener('click', async () => {
    const newName = prompt(`Enter friendly name for +${phone}:`, contact.name || '');
    if (newName === null) return;
    try {
      await apiRequest(`/api/contacts/${encodeURIComponent(contact.jid)}`, {
        method: 'PUT',
        body: { name: newName.trim() || null }
      });
      showToast('Contact renamed successfully!', 'success');
      contact.name = newName.trim() || null;
      loadContactDossier(contact.jid);
      loadContacts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Bind Save Persona Override
  const personaEditor = document.getElementById('dossier-persona-editor');
  const btnSavePersona = document.getElementById('btn-save-dossier-persona');

  btnSavePersona?.addEventListener('click', async () => {
    const prompt = personaEditor?.value.trim() || null;
    btnSavePersona.disabled = true;
    try {
      await apiRequest(`/api/contacts/${encodeURIComponent(contact.jid)}/persona`, {
        method: 'PUT',
        body: { persona: prompt }
      });
      showToast('Persona override saved!', 'success');
      contact.custom_persona = prompt;
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnSavePersona.disabled = false;
    }
  });

  // Bind Autopilot Toggle
  const btnToggleAutopilot = document.getElementById('btn-toggle-contact-autopilot');
  btnToggleAutopilot?.addEventListener('click', async () => {
    try {
      const newState = !contact.autopilot_enabled;
      await apiRequest(`/api/contacts/${encodeURIComponent(contact.jid)}/autopilot`, {
        method: 'POST',
        body: { enabled: newState }
      });
      contact.autopilot_enabled = newState ? 1 : 0;
      showToast(`Autopilot ${newState ? 'enabled' : 'disabled'} for ${name}`);
      renderDossier(data);
      loadContacts();
    } catch (err) {
      showToast(`Error toggling autopilot: ${err.message}`, 'error');
    }
  });

  // Bind Assign Goal
  document.getElementById('btn-assign-contact-task')?.addEventListener('click', () => {
    openCreateTaskModal(contact.jid);
  });

  // Load AI Executive Dossier asynchronously
  loadAiDossier(contact.jid, false);

  document.getElementById('btn-force-refresh-dossier')?.addEventListener('click', () => {
    loadAiDossier(contact.jid, true);
  });
}

// ------------------------------------------------------------------------------
// VIEW 1: Tier Board Kanban
// ------------------------------------------------------------------------------
function renderTierBoard() {
  for (let i = 1; i <= 5; i++) {
    const col = document.getElementById(`col-tier-${i}`);
    if (col) col.innerHTML = '';
  }

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  contactsList.forEach(c => {
    const tier = c.tier || 4;
    counts[tier] = (counts[tier] || 0) + 1;

    const col = document.getElementById(`col-tier-${tier}`);
    if (col) {
      const card = createContactCard(c);
      col.appendChild(card);
    }
  });

  for (let i = 1; i <= 5; i++) {
    const badge = document.getElementById(`badge-t${i}-count`);
    if (badge) badge.textContent = counts[i] || 0;
  }
}

function createContactCard(contact) {
  const card = document.createElement('div');
  card.className = 'tier-card';
  card.draggable = true;
  card.setAttribute('data-jid', contact.jid);
  card.setAttribute('data-tier', contact.tier);

  const phone = contact.phone || contact.jid.split('@')[0];
  const name = contact.name || `+${phone}`;
  const lastActive = contact.last_interaction 
    ? formatRelativeTime(contact.last_interaction)
    : 'never';

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div class="tier-card-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      <span style="font-size: 0.65rem; color: var(--text-dim); cursor: pointer;" class="btn-dossier" title="Open Dossier">⚙️</span>
    </div>
    <div class="tier-card-stats">
      <span class="tabular-nums">+${phone}</span>
      <span class="tabular-nums">${lastActive}</span>
    </div>
  `;

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', contact.jid);
    card.classList.add('dragging');
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-dossier')) {
      openContactModal(contact);
      return;
    }
    document.querySelectorAll('.tier-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedCard = card;
  });

  return card;
}

function setupDragAndDrop() {
  document.querySelectorAll('.tier-column').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.style.background = 'var(--bg-elevated)';
    });

    col.addEventListener('dragleave', () => {
      col.style.background = 'var(--bg-surface)';
    });

    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.style.background = 'var(--bg-surface)';
      const jid = e.dataTransfer.getData('text/plain');
      const targetTier = Number(col.getAttribute('data-tier'));
      if (jid && targetTier) {
        updateContactTier(jid, targetTier);
      }
    });
  });
}

async function updateContactTier(jid, newTier) {
  try {
    await apiRequest(`/api/contacts/${encodeURIComponent(jid)}/tier`, {
      method: 'PUT',
      body: { tier: newTier }
    });

    const contact = contactsList.find(c => c.jid === jid);
    if (contact) contact.tier = newTier;

    renderTierBoard();
    renderDirectory();
    showToast(`Contact moved to Tier ${newTier}`, 'success');
  } catch (err) {
    showToast('Failed to update tier: ' + err.message, 'error');
  }
}

function openContactModal(contact) {
  const modal = document.getElementById('contact-detail-modal');
  const nameEl = document.getElementById('modal-contact-name');
  const personaInput = document.getElementById('modal-persona-input');
  const factsInput = document.getElementById('modal-facts-input');
  const btnSave = document.getElementById('btn-save-dossier');
  const btnClose = document.getElementById('btn-close-modal');

  if (!modal) return;

  nameEl.textContent = `${contact.name || contact.phone} (Tier ${contact.tier})`;
  personaInput.value = contact.custom_persona || '';
  factsInput.value = contact.facts_json || '';

  modal.classList.add('open');

  btnClose.onclick = () => modal.classList.remove('open');

  btnSave.onclick = async () => {
    btnSave.disabled = true;
    try {
      await apiRequest(`/api/contacts/${encodeURIComponent(contact.jid)}`, {
        method: 'PUT',
        body: {
          custom_persona: personaInput.value.trim() || null,
          facts_json: factsInput.value.trim() || null
        }
      });
      contact.custom_persona = personaInput.value.trim() || null;
      contact.facts_json = factsInput.value.trim() || null;
      showToast('Contact dossier saved!', 'success');
      modal.classList.remove('open');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnSave.disabled = false;
    }
  };
}

// ------------------------------------------------------------------------------
// VIEW 2: Revoked Inbox & Intel
// ------------------------------------------------------------------------------
async function loadRevokedIntel() {
  try {
    const data = await apiRequest('/api/messages/revoked-intel');
    revokedIntel = data;

    document.getElementById('tab-revoked-count').textContent = data.totalRevoked || 0;

    renderTopDeletersChart(data.topDeleters || []);
    renderRevokedList(data.messages || []);
  } catch (err) {
    showToast('Failed to load revoked intel: ' + err.message, 'error');
  }
}

function renderTopDeletersChart(deleters) {
  const chart = document.getElementById('top-deleters-chart');
  if (!chart) return;

  if (deleters.length === 0) {
    chart.innerHTML = '<span style="color: var(--text-dim); font-size: 0.8rem;">No revocations recorded yet.</span>';
    return;
  }

  const max = Math.max(...deleters.map(d => d.revoke_count), 1);

  chart.innerHTML = deleters.map(d => {
    const pct = Math.round((d.revoke_count / max) * 100);
    return `
      <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem;">
        <span style="color: var(--text-muted);">${escapeHtml(d.label)}</span>
        <div style="width: 50px; height: 6px; background: var(--bg-hover); border-radius: 2px; overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: var(--accent-coral);"></div>
        </div>
        <span class="tabular-nums" style="color: var(--accent-coral); font-weight: 700;">${d.revoke_count}</span>
      </div>
    `;
  }).join('');
}

function renderRevokedList(messages) {
  const container = document.getElementById('revoked-list-container');
  if (!container) return;

  let list = messages;
  if (revokedActiveFilter === 'media') {
    list = messages.filter(m => Boolean(m.media_file));
  } else if (revokedActiveFilter === 'view_once') {
    list = messages.filter(m => Boolean(m.is_view_once));
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div style="padding: 3rem 1.5rem; text-align: center;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🛡️</div>
        <div style="font-weight: 600; color: var(--text-main); margin-bottom: 0.5rem;">Nothing Captured in this View</div>
        <div style="font-size: 0.82rem; color: var(--text-muted);">
          ${revokedActiveFilter === 'all' 
            ? 'No revoked messages or View-Once media recorded yet.'
            : `No ${revokedActiveFilter === 'media' ? 'media attachments' : 'View-Once messages'} captured yet.`}
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  list.forEach(msg => {
    const item = document.createElement('div');
    item.className = 'revoked-item';
    item.setAttribute('data-id', msg.id);

    const sender = msg.contact_name || msg.sender_jid.split('@')[0];
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = new Date(msg.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });

    let previewContent = msg.content || '[Deleted Message]';
    let mediaBadge = '';
    if (msg.is_view_once) {
      mediaBadge += `<span class="delta-badge" style="color: var(--accent-purple); border: 1px solid var(--accent-purple); font-size: 0.65rem;">👁️ VIEW-ONCE</span> `;
    }
    if (msg.media_file) {
      const mime = msg.media_mimetype || '';
      let icon = '📎 MEDIA';
      if (mime.includes('image')) icon = '📷 PHOTO';
      else if (mime.includes('video')) icon = '📹 VIDEO';
      else if (mime.includes('audio')) icon = '🎙️ AUDIO';
      mediaBadge += `<span class="delta-badge" style="color: var(--accent-blue); border: 1px solid var(--accent-blue); font-size: 0.65rem;">${icon}</span> `;
    }

    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
        <span style="font-weight: 600; color: var(--text-main); font-size: 0.84rem;">${escapeHtml(sender)}</span>
        <span class="tabular-nums" style="font-size: 0.72rem; color: var(--text-dim); font-family: var(--font-mono);">${date} ${time}</span>
      </div>
      <div style="margin-bottom: 0.35rem;">${mediaBadge}</div>
      <div style="color: var(--text-muted); font-size: 0.8rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
        ${escapeHtml(previewContent)}
      </div>
    `;

    item.addEventListener('click', () => {
      document.querySelectorAll('.revoked-item').forEach(el => el.classList.remove('active-revoked'));
      item.classList.add('active-revoked');
      renderRevokedDetail(msg);
    });

    container.appendChild(item);
  });
}

function renderRevokedDetail(msg) {
  const container = document.getElementById('revoked-detail-container');
  const deltaTag = document.getElementById('revoked-delta-tag');
  if (!container) return;

  const sender = msg.contact_name || msg.sender_jid.split('@')[0];
  const timeStr = new Date(msg.timestamp).toLocaleString();

  if (deltaTag) {
    if (msg.is_view_once) {
      deltaTag.textContent = 'VIEW-ONCE CAPTURED';
      deltaTag.style.color = 'var(--accent-purple)';
      deltaTag.style.border = '1px solid var(--accent-purple)';
    } else {
      deltaTag.textContent = 'INTERCEPTED REVOCATION';
      deltaTag.style.color = 'var(--accent-coral)';
      deltaTag.style.border = '1px solid var(--accent-coral)';
    }
  }

  let mediaHtml = '';
  if (msg.media_file) {
    const mime = msg.media_mimetype || '';
    const mediaUrl = `/api/media/${encodeURIComponent(msg.media_file)}`;

    if (mime.includes('image')) {
      mediaHtml = `
        <div style="margin-top: 1rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); overflow: hidden; background: #000; text-align: center;">
          <img src="${mediaUrl}" alt="Preserved Evidence" style="max-width: 100%; max-height: 380px; object-fit: contain; display: block; margin: 0 auto;" />
        </div>
      `;
    } else if (mime.includes('video')) {
      mediaHtml = `
        <div style="margin-top: 1rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); overflow: hidden; background: #000;">
          <video src="${mediaUrl}" controls style="width: 100%; max-height: 380px; display: block;"></video>
        </div>
      `;
    } else if (mime.includes('audio')) {
      mediaHtml = `
        <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
          <div style="font-size: 0.76rem; color: var(--text-dim); margin-bottom: 0.5rem;">🎙️ Preserved Voice Note / Audio Payload:</div>
          <audio src="${mediaUrl}" controls style="width: 100%;"></audio>
        </div>
      `;
    } else {
      mediaHtml = `
        <div style="margin-top: 1rem; padding: 0.85rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--text-main);">📎 ${escapeHtml(msg.media_file)}</span>
          <a href="${mediaUrl}" download class="btn" style="background: var(--bg-hover); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 0.35rem 0.65rem; border-radius: var(--radius-sm); font-size: 0.75rem; text-decoration: none;">Download</a>
        </div>
      `;
    }
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <div style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">
          ${escapeHtml(sender)}
        </div>
        <div style="font-size: 0.78rem; color: var(--text-dim); font-family: var(--font-mono);">
          <span>JID: ${escapeHtml(msg.sender_jid)}</span> &middot; 
          <span class="tabular-nums">${timeStr}</span>
        </div>
      </div>

      <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 1rem;">
        <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-family: var(--font-mono); margin-bottom: 0.5rem; letter-spacing: 0.05em;">
          Recovered Payload Content:
        </div>
        <div style="font-size: 0.95rem; color: var(--text-main); line-height: 1.5; word-break: break-word;">
          ${escapeHtml(msg.content || '(No text caption accompanied this media)')}
        </div>
        ${mediaHtml}
      </div>
    </div>
  `;
}

function exportRevokedJSON() {
  const blob = new Blob([JSON.stringify(revokedIntel.messages || [], null, 2)], { type: 'application/json' });
  downloadBlob(blob, `messiah-revoked-intel-${Date.now()}.json`);
}

function exportRevokedCSV() {
  const msgs = revokedIntel.messages || [];
  const headers = ['id', 'sender_jid', 'contact_name', 'timestamp', 'is_view_once', 'media_file', 'content'];
  const rows = msgs.map(m => [
    m.id,
    m.sender_jid,
    m.contact_name || '',
    new Date(m.timestamp).toISOString(),
    m.is_view_once ? '1' : '0',
    m.media_file || '',
    `"${(m.content || '').replace(/"/g, '""')}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, `messiah-revoked-intel-${Date.now()}.csv`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadAiDossier(jid, forceRefresh = false) {
  const panel = document.getElementById('ai-dossier-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div style="color: var(--text-dim); font-size: 0.78rem; text-align: center; padding: 1.5rem;">
      <span style="display: inline-block;">⏳</span> Synthesizing executive intelligence brief...
    </div>
  `;

  try {
    const url = forceRefresh ? `/api/contacts/${encodeURIComponent(jid)}/dossier/refresh` : `/api/contacts/${encodeURIComponent(jid)}/dossier`;
    const res = await apiRequest(url, forceRefresh ? { method: 'POST' } : undefined);
    const dossier = res.dossier;
    if (!dossier) throw new Error('No dossier returned');

    const commitmentsHtml = dossier.openCommitments && dossier.openCommitments.length > 0
      ? dossier.openCommitments.map(c => `
          <div style="display: flex; gap: 0.4rem; align-items: flex-start; font-size: 0.78rem; color: var(--text-main); margin-bottom: 0.35rem;">
            <span style="color: #38bdf8;">•</span>
            <span>${escapeHtml(c)}</span>
          </div>
        `).join('')
      : `<div style="font-size: 0.75rem; color: var(--text-dim); font-style: italic;">No pending commitments or unresolved threads detected.</div>`;

    const topicsHtml = dossier.topics && dossier.topics.length > 0
      ? dossier.topics.map(t => `<span class="badge" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 0.7rem; padding: 0.15rem 0.45rem; border-radius: var(--radius-sm);">#${escapeHtml(t)}</span>`).join(' ')
      : '';

    const cacheDate = new Date(dossier.generatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });

    panel.innerHTML = `
      <!-- Tone & Cache Strip -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">Tone:</span>
          <span class="badge" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: var(--radius-sm); font-weight: 600;">
            ${escapeHtml(dossier.toneProfile || 'Neutral')}
          </span>
        </div>
        <span style="font-size: 0.7rem; color: var(--text-dim); font-family: var(--font-mono);">
          ${dossier.cached ? `⚡ Cached (${cacheDate})` : `✨ Freshly Generated`}
        </span>
      </div>

      <!-- Summary -->
      <div style="font-size: 0.82rem; color: var(--text-main); line-height: 1.45; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.75rem; margin-bottom: 0.75rem;">
        ${escapeHtml(dossier.summary)}
      </div>

      <!-- Open Commitments -->
      <div style="margin-bottom: 0.75rem;">
        <div style="font-size: 0.74rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.35rem;">
          <span>📌</span> Open Commitments &amp; Threads
        </div>
        ${commitmentsHtml}
      </div>

      <!-- Topics -->
      ${topicsHtml ? `
        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.5rem;">
          ${topicsHtml}
        </div>
      ` : ''}
    `;
  } catch (err) {
    panel.innerHTML = `
      <div style="color: var(--accent-coral); font-size: 0.78rem; padding: 0.5rem 0;">
        Failed to load dossier: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

async function loadDormantThreads() {
  const grid = document.getElementById('dormant-cards-grid');
  const badgeCount = document.getElementById('tab-dormant-count');
  const daysSelect = document.getElementById('dormant-days-select');
  const days = daysSelect ? daysSelect.value : 14;

  if (grid) {
    grid.innerHTML = `
      <div style="color: var(--text-dim); font-size: 0.82rem; padding: 3rem; text-align: center; grid-column: 1 / -1;">
        Scanning for dormant relationships (> ${days} days)...
      </div>
    `;
  }

  try {
    const res = await apiRequest(`/api/contacts/dormant?days=${days}&tier=2`);
    const dormantContacts = res.dormantContacts || [];

    if (badgeCount) badgeCount.textContent = dormantContacts.length;

    if (!grid) return;

    if (dormantContacts.length === 0) {
      grid.innerHTML = `
        <div style="color: var(--accent-green); font-size: 0.85rem; padding: 3rem; text-align: center; grid-column: 1 / -1; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
          ✨ No dormant connections found! All Tier 1 (VIP) and Tier 2 (Friends) have been active in the last ${days} days.
        </div>
      `;
      return;
    }

    grid.innerHTML = dormantContacts.map(c => {
      const tierMeta = getTierLabel(c.tier);
      const displayName = c.name || `+${c.phone}`;
      const phoneDigits = c.phone.replace(/[^0-9]/g, '');

      return `
        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <div>
                <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.2rem;">
                  ${escapeHtml(displayName)}
                </h3>
                <div style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono);">
                  +${escapeHtml(c.phone)}
                </div>
              </div>
              <span class="delta-badge" style="color: ${tierMeta.color}; border: 1px solid ${tierMeta.color}; font-size: 0.68rem;">
                ${tierMeta.label}
              </span>
            </div>

            <div style="background: var(--bg-elevated); border-radius: var(--radius-sm); padding: 0.5rem 0.75rem; margin-top: 0.5rem; margin-bottom: 0.75rem;">
              <div style="font-size: 0.75rem; color: #38bdf8; font-weight: 600; font-family: var(--font-mono);">
                ❄️ Silent for ${c.daysDormant} days
              </div>
              <div style="font-size: 0.7rem; color: var(--text-dim);">
                Last spoken: ${escapeHtml(c.formattedLastSpoke)}
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <a href="https://wa.me/${phoneDigits}" target="_blank" class="btn" style="flex: 1; text-align: center; text-decoration: none; background: rgba(37, 211, 102, 0.15); color: #25D366; border: 1px solid rgba(37, 211, 102, 0.3); padding: 0.35rem; font-size: 0.75rem; font-weight: 600; border-radius: var(--radius-sm);">
              💬 Open WhatsApp
            </a>
            <button type="button" class="btn btn-view-dormant-dossier" data-jid="${escapeHtml(c.jid)}" style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: var(--text-main); font-size: 0.75rem; padding: 0.35rem 0.65rem; border-radius: var(--radius-sm); cursor: pointer;">
              📋 Dossier
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind View Dossier buttons
    grid.querySelectorAll('.btn-view-dormant-dossier').forEach(btn => {
      btn.addEventListener('click', () => {
        const jid = btn.getAttribute('data-jid');
        const tabBtnDirectory = document.getElementById('tab-btn-directory');
        tabBtnDirectory?.click();
        loadContactDossier(jid);
      });
    });
  } catch (err) {
    if (grid) {
      grid.innerHTML = `
        <div style="color: var(--accent-coral); font-size: 0.82rem; padding: 2rem; text-align: center; grid-column: 1 / -1;">
          Failed to load dormant contacts: ${escapeHtml(err.message)}
        </div>
      `;
    }
  }
}

// ------------------------------------------------------------------------------
// VIEW 4: Agent Task Delegations
// ------------------------------------------------------------------------------
async function loadAgentTasks() {
  const container = document.getElementById('tasks-grid-container');
  const countBadge = document.getElementById('tab-tasks-count');
  const filter = document.getElementById('task-filter-status')?.value || 'all';

  if (container) {
    container.innerHTML = `
      <div style="color: var(--text-dim); font-size: 0.82rem; padding: 3rem; text-align: center; grid-column: 1 / -1;">
        Loading agent tasks...
      </div>
    `;
  }

  try {
    const data = await apiRequest(`/api/tasks?status=${encodeURIComponent(filter)}`);
    const tasks = data.tasks || [];

    if (countBadge) {
      const pendingOrActive = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
      countBadge.textContent = pendingOrActive;
    }

    if (!container) return;

    if (tasks.length === 0) {
      container.innerHTML = `
        <div style="background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); padding: 3rem; text-align: center; grid-column: 1 / -1;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🤖</div>
          <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">No Agent Tasks Found</div>
          <div style="font-size: 0.78rem; color: var(--text-dim); max-width: 380px; margin: 0 auto 1rem;">
            Assign a goal to the WhatsApp Agent to have it reach out to contacts, steer conversations, and gather intel.
          </div>
          <button type="button" class="btn" id="btn-empty-create-task" style="background: #6366f1; color: #fff; border: none; padding: 0.4rem 1rem; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600; cursor: pointer;">
            + Assign First Goal
          </button>
        </div>
      `;
      document.getElementById('btn-empty-create-task')?.addEventListener('click', () => openCreateTaskModal());
      return;
    }

    container.innerHTML = tasks.map(t => {
      const contactLabel = t.contact_name || `+${t.contact_phone || t.contact_jid.split('@')[0]}`;
      const statusBadge = t.status === 'completed'
        ? '<span class="delta-badge" style="color: #10b981; border: 1px solid #10b981; background: rgba(16, 185, 129, 0.1);">✅ COMPLETED</span>'
        : t.status === 'in_progress'
        ? '<span class="delta-badge" style="color: #38bdf8; border: 1px solid #38bdf8; background: rgba(56, 189, 248, 0.1);">🔄 IN PROGRESS</span>'
        : t.status === 'pending'
        ? '<span class="delta-badge" style="color: #f59e0b; border: 1px solid #f59e0b; background: rgba(245, 158, 11, 0.1);">⏳ PENDING</span>'
        : '<span class="delta-badge" style="color: var(--accent-coral); border: 1px solid var(--accent-coral); background: rgba(226, 75, 75, 0.1);">❌ CANCELLED</span>';

      const schedDate = new Date(t.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      return `
        <div class="card" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.5rem;">
              <div>
                <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main);">
                  ${escapeHtml(contactLabel)}
                </div>
                <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-dim);">
                  📱 +${escapeHtml(t.contact_phone || t.contact_jid.split('@')[0])}
                </div>
              </div>
              ${statusBadge}
            </div>

            <div style="background: var(--bg-elevated); border-radius: var(--radius-sm); padding: 0.65rem 0.75rem; margin: 0.6rem 0; border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.7rem; color: #6366f1; font-weight: 600; text-transform: uppercase; font-family: var(--font-mono); margin-bottom: 0.2rem;">
                🎯 Assigned Goal
              </div>
              <div style="font-size: 0.82rem; color: var(--text-main); line-height: 1.4;">
                "${escapeHtml(t.goal)}"
              </div>
            </div>

            ${t.summary ? `
              <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: var(--radius-sm); padding: 0.55rem 0.75rem; margin-bottom: 0.6rem;">
                <div style="font-size: 0.68rem; color: #10b981; font-weight: 600; text-transform: uppercase; font-family: var(--font-mono); margin-bottom: 0.15rem;">
                  📝 Outcome / Gathered Intel
                </div>
                <div style="font-size: 0.78rem; color: var(--text-main);">
                  ${escapeHtml(t.summary)}
                </div>
              </div>
            ` : ''}

            <div style="font-size: 0.72rem; color: var(--text-dim); font-family: var(--font-mono);">
              ⏰ Scheduled: ${schedDate}
            </div>
          </div>

          <div style="display: flex; gap: 0.4rem; justify-content: flex-end; margin-top: 0.85rem; border-top: 1px solid var(--border-subtle); padding-top: 0.65rem;">
            ${t.status !== 'completed' && t.status !== 'cancelled' ? `
              <button type="button" class="btn btn-task-complete" data-id="${t.id}" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.72rem; padding: 0.25rem 0.55rem; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600;">
                ✓ Complete
              </button>
              <button type="button" class="btn btn-task-cancel" data-id="${t.id}" style="background: var(--bg-elevated); color: var(--text-dim); border: 1px solid var(--border-subtle); font-size: 0.72rem; padding: 0.25rem 0.55rem; border-radius: var(--radius-sm); cursor: pointer;">
                Cancel
              </button>
            ` : ''}
            <button type="button" class="btn btn-task-delete" data-id="${t.id}" style="background: transparent; color: var(--accent-coral); border: none; font-size: 0.72rem; padding: 0.25rem 0.45rem; cursor: pointer;">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.btn-task-complete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const summary = prompt('Enter task outcome summary (optional):') || 'Completed manually';
        try {
          await apiRequest(`/api/tasks/${id}/complete`, { method: 'POST', body: { summary } });
          showToast('Task marked completed!', 'success');
          loadAgentTasks();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('.btn-task-cancel').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await apiRequest(`/api/tasks/${id}/cancel`, { method: 'POST' });
          showToast('Task cancelled', 'info');
          loadAgentTasks();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('.btn-task-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Delete this task?')) return;
        try {
          await apiRequest(`/api/tasks/${id}`, { method: 'DELETE' });
          showToast('Task deleted', 'info');
          loadAgentTasks();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div style="color: var(--accent-coral); font-size: 0.82rem; padding: 2rem; text-align: center; grid-column: 1 / -1;">
          Failed to load agent tasks: ${escapeHtml(err.message)}
        </div>
      `;
    }
  }
}

function openCreateTaskModal(preselectedJid = null) {
  const modal = document.getElementById('create-task-modal');
  const select = document.getElementById('task-contact-select');
  if (!modal || !select) return;

  select.innerHTML = '<option value="">Select a contact...</option>' + contactsList.map(c => {
    const label = c.name ? `${c.name} (+${c.phone})` : `+${c.phone}`;
    const selected = preselectedJid === c.jid ? 'selected' : '';
    return `<option value="${escapeHtml(c.jid)}" ${selected}>${escapeHtml(label)}</option>`;
  }).join('');

  modal.style.display = 'flex';
}

function closeCreateTaskModal() {
  const modal = document.getElementById('create-task-modal');
  if (modal) modal.style.display = 'none';
}

async function handleCreateTaskSubmit(e) {
  e.preventDefault();
  const contactJid = document.getElementById('task-contact-select')?.value;
  const goal = document.getElementById('task-goal-input')?.value.trim();
  const timing = document.getElementById('task-timing-select')?.value;

  if (!contactJid || !goal) {
    showToast('Please select a contact and enter a goal', 'error');
    return;
  }

  let scheduledAt = Date.now();
  if (timing === '15m') scheduledAt += 15 * 60 * 1000;
  else if (timing === '1h') scheduledAt += 60 * 60 * 1000;
  else if (timing === '3h') scheduledAt += 3 * 60 * 60 * 1000;
  else if (timing === 'tomorrow') {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    tmrw.setHours(9, 0, 0, 0);
    scheduledAt = tmrw.getTime();
  }

  try {
    await apiRequest('/api/tasks', {
      method: 'POST',
      body: { contactJid, goal, scheduledAt }
    });
    showToast('Agent task successfully deployed!', 'success');
    closeCreateTaskModal();
    const goalInput = document.getElementById('task-goal-input');
    if (goalInput) goalInput.value = '';
    const tabBtnTasks = document.getElementById('tab-btn-tasks');
    tabBtnTasks?.click();
  } catch (err) {
    showToast(`Failed to deploy task: ${err.message}`, 'error');
  }
}

document.addEventListener('DOMContentLoaded', initContactsPage);
