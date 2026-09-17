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
  const viewDirectory = document.getElementById('view-directory');
  const viewTierBoard = document.getElementById('view-tier-board');
  const viewRevokedInbox = document.getElementById('view-revoked-inbox');

  function switchTab(tab) {
    currentSubTab = tab;
    [tabBtnDirectory, tabBtnTiers, tabBtnRevoked].forEach(b => {
      if (b) {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
      }
    });

    if (viewDirectory) viewDirectory.style.display = tab === 'directory' ? 'block' : 'none';
    if (viewTierBoard) viewTierBoard.style.display = tab === 'tiers' ? 'block' : 'none';
    if (viewRevokedInbox) viewRevokedInbox.style.display = tab === 'revoked' ? 'block' : 'none';

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
    }
  }

  tabBtnDirectory?.addEventListener('click', () => switchTab('directory'));
  tabBtnTiers?.addEventListener('click', () => switchTab('tiers'));
  tabBtnRevoked?.addEventListener('click', () => switchTab('revoked'));

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
          <h2 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.2rem;">
            ${escapeHtml(name)}
          </h2>
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

document.addEventListener('DOMContentLoaded', initContactsPage);
