import { apiRequest } from '../api.js';
import { showToast } from '../main.js';
import { initNavigationStatus } from '../nav.js';

let allTasks = [];
let allContacts = [];
let currentFilter = 'all';
let searchQuery = '';
let contactSearchQuery = '';
let showAutoOnly = false;

const EXAMPLE_GOALS = [
  "Ask if the pitch deck is ready for Friday and see what their timeline looks like.",
  "Follow up on the server migration quotation and ask if they have budget approved.",
  "Check in casually to see how their week is going and suggest grabbing lunch tomorrow.",
  "Ask for an update on the design review and find out if anything is blocking them."
];
let exampleIdx = 0;

document.addEventListener('DOMContentLoaded', () => {
  initNavigationStatus();
  initMasterAutopilot();
  initTabs();
  initFilterButtons();
  initModal();
  loadData();

  // Poll for background task updates every 10 seconds
  setInterval(loadTasksOnly, 10000);
});

// 1. MASTER AUTOPILOT
async function initMasterAutopilot() {
  const toggle = document.getElementById('master-autopilot-toggle');
  const pill = document.getElementById('master-status-pill');

  try {
    const config = await apiRequest('/api/config');
    const isAuto = Boolean(config.autonomousGhost);
    if (toggle) toggle.checked = isAuto;
    updateMasterStatusPill(isAuto);
  } catch (err) {
    console.error('Failed to load master config:', err);
  }

  toggle?.addEventListener('change', async () => {
    const enabled = toggle.checked;
    updateMasterStatusPill(enabled);
    try {
      await apiRequest('/api/config', 'POST', { autonomousGhost: enabled });
      showToast(enabled ? '🟢 Master Autopilot Armed (Global)' : '⚪ Master Autopilot Idle');
      logTelemetry(`Master Autopilot switched ${enabled ? 'ENABLED (Global Ghost Mode)' : 'DISABLED'}`);
    } catch (err) {
      toggle.checked = !enabled;
      updateMasterStatusPill(!enabled);
      showToast('❌ Failed to update Master Autopilot');
    }
  });
}

function updateMasterStatusPill(enabled) {
  const pill = document.getElementById('master-status-pill');
  if (!pill) return;
  if (enabled) {
    pill.textContent = '🟢 AUTOPILOT ARMED';
    pill.style.background = 'rgba(0, 240, 255, 0.15)';
    pill.style.color = 'var(--accent-cyan)';
    pill.style.border = '1px solid var(--accent-cyan)';
  } else {
    pill.textContent = '⚪ AUTOPILOT IDLE';
    pill.style.background = 'rgba(255, 255, 255, 0.06)';
    pill.style.color = 'var(--text-dim)';
    pill.style.border = '1px solid transparent';
  }
}

// 2. TAB SWITCHING
function initTabs() {
  const tabMissions = document.getElementById('tab-btn-missions');
  const tabContacts = document.getElementById('tab-btn-contacts');
  const tabTelemetry = document.getElementById('tab-btn-telemetry');

  const viewMissions = document.getElementById('view-missions');
  const viewContacts = document.getElementById('view-contacts');
  const viewTelemetry = document.getElementById('view-telemetry');

  function setTab(activeTab, activeView) {
    [tabMissions, tabContacts, tabTelemetry].forEach(t => {
      if (t) {
        t.classList.remove('active');
        t.style.borderBottomColor = 'transparent';
        t.style.color = 'var(--text-muted)';
      }
    });
    [viewMissions, viewContacts, viewTelemetry].forEach(v => {
      if (v) v.style.display = 'none';
    });

    if (activeTab) {
      activeTab.classList.add('active');
      activeTab.style.borderBottomColor = 'var(--accent-cyan)';
      activeTab.style.color = 'var(--accent-cyan)';
    }
    if (activeView) activeView.style.display = 'block';
  }

  tabMissions?.addEventListener('click', () => setTab(tabMissions, viewMissions));
  tabContacts?.addEventListener('click', () => setTab(tabContacts, viewContacts));
  tabTelemetry?.addEventListener('click', () => setTab(tabTelemetry, viewTelemetry));
}

// 3. FILTER BUTTONS & SEARCH
function initFilterButtons() {
  const filterBtns = document.querySelectorAll('.btn-filter');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
      });
      btn.classList.add('active');
      btn.style.background = 'var(--bg-elevated)';
      btn.style.color = 'var(--accent-cyan)';
      currentFilter = btn.getAttribute('data-filter') || 'all';
      renderMissions();
    });
  });

  const missionSearch = document.getElementById('mission-search-input');
  missionSearch?.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderMissions();
  });

  const contactSearch = document.getElementById('contact-search-input');
  contactSearch?.addEventListener('input', (e) => {
    contactSearchQuery = e.target.value.toLowerCase().trim();
    renderContactsTable();
  });

  const autoOnlyBtn = document.getElementById('btn-filter-auto-only');
  autoOnlyBtn?.addEventListener('click', () => {
    showAutoOnly = !showAutoOnly;
    autoOnlyBtn.style.background = showAutoOnly ? 'var(--bg-elevated)' : 'var(--bg-surface)';
    autoOnlyBtn.style.color = showAutoOnly ? 'var(--accent-green)' : 'var(--text-muted)';
    renderContactsTable();
  });
}

// 4. LOAD DATA
async function loadData() {
  await Promise.all([loadTasksOnly(), loadContacts()]);
}

async function loadTasksOnly() {
  try {
    const tasks = await apiRequest('/api/tasks');
    allTasks = Array.isArray(tasks) ? tasks : [];
    updateMetrics();
    renderMissions();
  } catch (err) {
    console.error('Failed to load tasks:', err);
  }
}

async function loadContacts() {
  try {
    const res = await apiRequest('/api/contacts?limit=10000');
    allContacts = Array.isArray(res) ? res : (res?.contacts || []);
    populateContactSelect();
    renderContactsTable();
    updateMetrics();
  } catch (err) {
    console.error('Failed to load contacts:', err);
  }
}

function updateMetrics() {
  const activeCount = allTasks.filter(t => t.status === 'in_progress' || t.status === 'pending').length;
  const completedCount = allTasks.filter(t => t.status === 'completed').length;
  const autoContactsCount = allContacts.filter(c => c.autopilot_enabled === 1).length;

  const elActive = document.getElementById('stat-active-tasks');
  const elAuto = document.getElementById('stat-auto-contacts');
  const elComp = document.getElementById('stat-completed-tasks');
  const elTabMissions = document.getElementById('count-tab-missions');
  const elTabContacts = document.getElementById('count-tab-contacts');

  if (elActive) elActive.textContent = activeCount;
  if (elAuto) elAuto.textContent = autoContactsCount;
  if (elComp) elComp.textContent = completedCount;
  if (elTabMissions) elTabMissions.textContent = allTasks.length;
  if (elTabContacts) elTabContacts.textContent = allContacts.length;
}

// 5. RENDER MISSIONS
function renderMissions() {
  const container = document.getElementById('missions-list-container');
  if (!container) return;

  let filtered = allTasks;
  if (currentFilter !== 'all') {
    filtered = filtered.filter(t => t.status === currentFilter);
  }

  if (searchQuery) {
    filtered = filtered.filter(t => {
      const contact = allContacts.find(c => c.jid === t.contact_jid);
      const name = contact ? contact.name.toLowerCase() : '';
      const phone = contact ? contact.phone : '';
      const goal = (t.goal || '').toLowerCase();
      return name.includes(searchQuery) || phone.includes(searchQuery) || goal.includes(searchQuery);
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); padding: 3rem 1.5rem; text-align: center;">
        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🎯</div>
        <div style="color: var(--text-main); font-weight: 600; margin-bottom: 0.25rem;">No agent missions found</div>
        <div style="color: var(--text-muted); font-size: 0.82rem; margin-bottom: 1.25rem;">
          ${searchQuery || currentFilter !== 'all' ? 'Try adjusting your filters or search query.' : 'Delegate an objective for Messiah to accomplish with any contact.'}
        </div>
        <button id="btn-empty-create-task" class="btn btn-primary" style="font-size: 0.82rem; padding: 0.45rem 1rem;">
          + Create First Mission
        </button>
      </div>
    `;
    document.getElementById('btn-empty-create-task')?.addEventListener('click', openModal);
    return;
  }

  container.innerHTML = filtered.map(task => {
    const contact = allContacts.find(c => c.jid === task.contact_jid) || { name: task.contact_jid.split('@')[0], phone: task.contact_jid.split('@')[0] };
    const isDue = task.scheduled_at <= Date.now();
    const scheduledDate = new Date(task.scheduled_at);
    const timeFormatted = isDue ? 'Due now' : `Scheduled for ${scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    let statusBadge = '';
    if (task.status === 'in_progress') {
      statusBadge = `<span class="badge" style="background: rgba(0, 240, 255, 0.15); color: var(--accent-cyan); font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.72rem;">⚡ IN PROGRESS</span>`;
    } else if (task.status === 'pending') {
      statusBadge = `<span class="badge" style="background: rgba(245, 166, 35, 0.15); color: var(--accent-amber); font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.72rem;">⏳ PENDING</span>`;
    } else if (task.status === 'completed') {
      statusBadge = `<span class="badge" style="background: rgba(46, 204, 113, 0.15); color: var(--accent-green); font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.72rem;">✅ COMPLETED</span>`;
    } else {
      statusBadge = `<span class="badge" style="background: rgba(255, 255, 255, 0.08); color: var(--text-dim); font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.72rem;">✕ CANCELLED</span>`;
    }

    return `
      <div class="mission-card status-${task.status}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 0.85rem; border: 1px solid var(--border-subtle);">
              👤
            </div>
            <div>
              <div style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">
                ${escapeHtml(contact.name)}
                <span style="font-weight: 400; color: var(--text-dim); font-size: 0.78rem; margin-left: 0.25rem;">+${contact.phone || ''}</span>
              </div>
              <div style="color: var(--text-dim); font-size: 0.72rem;">
                ${timeFormatted} · Created ${new Date(task.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div>
            ${statusBadge}
          </div>
        </div>

        <div style="background: var(--bg-secondary); border-radius: var(--radius-sm); padding: 0.75rem 0.9rem; font-size: 0.84rem; color: var(--text-main); border-left: 3px solid var(--border-glow); line-height: 1.45;">
          ${escapeHtml(task.goal)}
        </div>

        ${task.summary ? `
          <div style="font-size: 0.78rem; color: var(--accent-green); background: rgba(46, 204, 113, 0.08); padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid rgba(46, 204, 113, 0.2);">
            <strong>Outcome:</strong> ${escapeHtml(task.summary)}
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.25rem;">
          <span style="font-size: 0.72rem; color: var(--text-dim); font-family: var(--font-mono);">
            ID: #${task.id}
          </span>
          <div style="display: flex; gap: 0.45rem;">
            ${task.status === 'pending' || task.status === 'in_progress' ? `
              <button class="btn btn-task-done" data-id="${task.id}" style="background: rgba(46, 204, 113, 0.12); color: var(--accent-green); border: 1px solid rgba(46, 204, 113, 0.3); font-size: 0.74rem; padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); cursor: pointer;">
                ✓ Done
              </button>
              <button class="btn btn-task-cancel" data-id="${task.id}" style="background: transparent; color: var(--text-muted); border: 1px solid var(--border-subtle); font-size: 0.74rem; padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); cursor: pointer;">
                Cancel
              </button>
            ` : ''}
            <button class="btn btn-task-del" data-id="${task.id}" style="background: transparent; color: var(--accent-coral); border: 1px solid rgba(255, 75, 75, 0.2); font-size: 0.74rem; padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); cursor: pointer;" title="Delete task">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Bind actions
  container.querySelectorAll('.btn-task-done').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const summary = prompt('Enter a brief summary of how this mission was completed (optional):') || 'Manually marked completed from Agent Dashboard';
      try {
        await apiRequest(`/api/tasks/${id}/complete`, 'POST', { summary });
        showToast('✅ Mission marked completed');
        logTelemetry(`Mission #${id} marked COMPLETED: "${summary}"`);
        loadTasksOnly();
      } catch (err) {
        showToast('❌ Failed to complete mission');
      }
    });
  });

  container.querySelectorAll('.btn-task-cancel').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      try {
        await apiRequest(`/api/tasks/${id}/cancel`, 'POST');
        showToast('Mission cancelled');
        logTelemetry(`Mission #${id} CANCELLED by user`);
        loadTasksOnly();
      } catch (err) {
        showToast('❌ Failed to cancel mission');
      }
    });
  });

  container.querySelectorAll('.btn-task-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!confirm('Are you sure you want to delete this mission record?')) return;
      try {
        await apiRequest(`/api/tasks/${id}`, 'DELETE');
        showToast('Mission deleted');
        loadTasksOnly();
      } catch (err) {
        showToast('❌ Failed to delete mission');
      }
    });
  });
}

// 6. RENDER CONTACTS TABLE
function renderContactsTable() {
  const tbody = document.getElementById('contacts-table-body');
  if (!tbody) return;

  let filtered = allContacts;
  if (contactSearchQuery) {
    filtered = filtered.filter(c => {
      return (c.name || '').toLowerCase().includes(contactSearchQuery) || (c.phone || '').includes(contactSearchQuery);
    });
  }

  if (showAutoOnly) {
    filtered = filtered.filter(c => c.autopilot_enabled === 1);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 2rem;">
          No contacts match your query.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const isAuto = c.autopilot_enabled === 1;
    const activeTasksForContact = allTasks.filter(t => t.contact_jid === c.jid && (t.status === 'in_progress' || t.status === 'pending'));

    const tierLabels = {
      1: '<span style="color: var(--accent-coral); font-weight: 600;">⭐ Tier 1</span>',
      2: '<span style="color: var(--accent-cyan); font-weight: 600;">⚡ Tier 2</span>',
      3: '<span style="color: var(--text-main); font-weight: 600;">👥 Tier 3</span>',
      4: '<span style="color: var(--text-dim);">🔇 Tier 4</span>'
    };

    return `
      <tr>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(c.name)}</div>
          <div style="font-size: 0.78rem; color: var(--text-dim);">+${c.phone}</div>
        </td>
        <td>
          ${tierLabels[c.tier] || `<span style="color: var(--text-dim);">Tier ${c.tier}</span>`}
        </td>
        <td>
          ${activeTasksForContact.length > 0 ? `
            <span class="badge" style="background: rgba(0, 240, 255, 0.15); color: var(--accent-cyan); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">
              🎯 ${activeTasksForContact.length} Active Mission${activeTasksForContact.length > 1 ? 's' : ''}
            </span>
          ` : `<span style="color: var(--text-dim); font-size: 0.78rem;">None</span>`}
        </td>
        <td style="text-align: right;">
          <label class="switch-label" title="Toggle Autopilot for ${escapeHtml(c.name)}">
            <input type="checkbox" class="contact-auto-toggle" data-jid="${c.jid}" ${isAuto ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </td>
      </tr>
    `;
  }).join('');

  // Bind individual contact autopilot toggles
  tbody.querySelectorAll('.contact-auto-toggle').forEach(input => {
    input.addEventListener('change', async () => {
      const jid = input.getAttribute('data-jid');
      const enabled = input.checked;
      const contact = allContacts.find(c => c.jid === jid);
      try {
        await apiRequest(`/api/contacts/${encodeURIComponent(jid)}/autopilot`, 'POST', { enabled });
        if (contact) contact.autopilot_enabled = enabled ? 1 : 0;
        showToast(`${enabled ? '🟢 Autopilot Enabled' : '⚪ Autopilot Disabled'} for ${contact ? contact.name : jid}`);
        logTelemetry(`Autopilot ${enabled ? 'ENABLED' : 'DISABLED'} for contact ${contact ? contact.name : jid}`);
        updateMetrics();
      } catch (err) {
        input.checked = !enabled;
        showToast('❌ Failed to update contact autopilot');
      }
    });
  });
}

// 7. MODAL & FORM
function initModal() {
  const modal = document.getElementById('create-mission-modal');
  const btnOpen = document.getElementById('btn-create-task-main');
  const btnClose = document.getElementById('btn-close-mission-modal');
  const btnCancel = document.getElementById('btn-cancel-mission');
  const form = document.getElementById('form-create-mission');
  const btnExample = document.getElementById('btn-suggest-example');
  const goalInput = document.getElementById('mission-goal-input');

  btnOpen?.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  btnExample?.addEventListener('click', () => {
    if (goalInput) {
      goalInput.value = EXAMPLE_GOALS[exampleIdx % EXAMPLE_GOALS.length];
      exampleIdx++;
      goalInput.focus();
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const contactJid = document.getElementById('mission-contact-select')?.value;
    const goal = goalInput?.value.trim();
    const delayMinutes = parseInt(document.getElementById('mission-schedule-select')?.value || '0', 10);

    if (!contactJid || !goal) {
      showToast('⚠️ Please select a contact and specify a goal.');
      return;
    }

    const scheduledAt = Date.now() + (delayMinutes * 60 * 1000);

    try {
      const task = await apiRequest('/api/tasks', 'POST', {
        contactJid,
        goal,
        scheduledAt
      });
      showToast(`🎯 Mission #${task.id} scheduled successfully!`);
      logTelemetry(`New Mission #${task.id} launched for ${contactJid}: "${goal}" (Schedule: +${delayMinutes}m)`);
      closeModal();
      if (goalInput) goalInput.value = '';
      await loadTasksOnly();
    } catch (err) {
      showToast('❌ Failed to create mission');
    }
  });
}

function openModal() {
  const modal = document.getElementById('create-mission-modal');
  if (modal) modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('create-mission-modal');
  if (modal) modal.style.display = 'none';
}

function populateContactSelect() {
  const select = document.getElementById('mission-contact-select');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">Select a contact...</option>' + 
    allContacts.map(c => `
      <option value="${c.jid}">${escapeHtml(c.name)} (+${c.phone}) [Tier ${c.tier}]</option>
    `).join('');

  if (currentVal) select.value = currentVal;
}

// 8. TELEMETRY LOG HELPER
function logTelemetry(text) {
  const stream = document.getElementById('telemetry-log-stream');
  if (!stream) return;

  const row = document.createElement('div');
  row.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
  row.style.paddingBottom = '0.35rem';
  const time = new Date().toLocaleTimeString();
  row.innerHTML = `<span style="color: var(--accent-cyan); font-family: var(--font-mono); font-size: 0.72rem;">[${time}]</span> <span style="color: var(--text-main); font-size: 0.78rem;">${escapeHtml(text)}</span>`;
  stream.prepend(row);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
