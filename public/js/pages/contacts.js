import { apiRequest } from '../api.js';
import { showToast } from '../main.js';

let contactsList = [];
let revokedIntel = { totalRevoked: 0, topDeleters: [], messages: [] };
let selectedCard = null;
let currentSubTab = 'tiers'; // 'tiers' | 'revoked'
let revokedActiveFilter = 'all'; // 'all' | 'media' | 'view_once'

export function initContactsPage() {
  const tabBtnTiers = document.getElementById('tab-btn-tiers');
  const tabBtnRevoked = document.getElementById('tab-btn-revoked');
  const viewTierBoard = document.getElementById('view-tier-board');
  const viewRevokedInbox = document.getElementById('view-revoked-inbox');

  tabBtnTiers?.addEventListener('click', () => {
    currentSubTab = 'tiers';
    tabBtnTiers.style.background = 'var(--bg-elevated)';
    tabBtnTiers.style.color = 'var(--accent-green)';
    tabBtnRevoked.style.background = 'transparent';
    tabBtnRevoked.style.color = 'var(--text-muted)';
    if (viewTierBoard) viewTierBoard.style.display = 'block';
    if (viewRevokedInbox) viewRevokedInbox.style.display = 'none';
  });

  tabBtnRevoked?.addEventListener('click', () => {
    currentSubTab = 'revoked';
    tabBtnRevoked.style.background = 'var(--bg-elevated)';
    tabBtnRevoked.style.color = 'var(--accent-coral)';
    tabBtnTiers.style.background = 'transparent';
    tabBtnTiers.style.color = 'var(--text-muted)';
    if (viewTierBoard) viewTierBoard.style.display = 'none';
    if (viewRevokedInbox) viewRevokedInbox.style.display = 'block';
    loadRevokedIntel();
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

  // Keyboard Reclassification: 1-5
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

  // Export actions
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

    document.getElementById('total-contacts-label').textContent = `${contactsList.length} Contacts Tracked`;
    renderTierBoard();
  } catch (err) {
    showToast('Failed to load contacts: ' + err.message, 'error');
  }
}

function renderTierBoard() {
  // Clear columns
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

  // Update column badges
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

  // Drag Events
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', contact.jid);
    card.classList.add('dragging');
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  // Click to Select for 1-5 keybinding
  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-dossier')) {
      openContactDossier(contact);
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
    await apiRequest(`/api/contacts/${encodeURIComponent(jid)}`, {
      method: 'PUT',
      body: { tier: newTier }
    });

    // Update local state and re-render
    const contact = contactsList.find(c => c.jid === jid);
    if (contact) contact.tier = newTier;

    renderTierBoard();
    showToast(`Contact moved to Tier ${newTier}`, 'success');
  } catch (err) {
    showToast('Failed to update tier: ' + err.message, 'error');
  }
}

function openContactDossier(contact) {
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
// Revoked Inbox & Intel
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
            ? 'When anyone deletes a WhatsApp message or sends a View-Once, Messiah captures and displays it here immediately.'
            : 'No items match the active filter.'}
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((m, idx) => {
    const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sender = m.contact_name || `+${m.sender_jid.split('@')[0]}`;
    const preview = (m.content || (m.media_file ? `[Preserved Media File: ${m.media_file}]` : '[Payload Deleted]')).slice(0, 70);

    return `
      <div class="tier-card ${idx === 0 ? 'selected' : ''}" data-idx="${idx}" style="cursor: pointer;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
          <div style="display: flex; align-items: center; gap: 0.35rem; font-weight: 600; font-size: 0.84rem; color: var(--text-main);">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: var(--tier-${m.contact_tier || 4});"></span>
            ${escapeHtml(sender)}
          </div>
          <span class="tabular-nums" style="font-size: 0.72rem; color: var(--accent-coral); font-family: var(--font-mono);">
            ${time}
          </span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.3;">
          ${escapeHtml(preview)}
        </div>
        <div style="display: flex; gap: 0.35rem; margin-top: 0.35rem; flex-wrap: wrap;">
          ${m.is_view_once ? '<span class="delta-badge" style="color: var(--accent-purple); border: 1px solid var(--accent-purple); font-size: 0.68rem;">👁️ VIEW-ONCE</span>' : ''}
          ${m.media_file && m.media_mimetype?.startsWith('image/') ? '<span class="delta-badge" style="color: var(--accent-green); font-size: 0.68rem;">📷 PHOTO</span>' : ''}
          ${m.media_file && m.media_mimetype?.startsWith('audio/') ? '<span class="delta-badge" style="color: var(--accent-amber); font-size: 0.68rem;">🎙️ AUDIO</span>' : ''}
          ${m.media_file && m.media_mimetype?.startsWith('video/') ? '<span class="delta-badge" style="color: #60a5fa; font-size: 0.68rem;">📹 VIDEO</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.tier-card').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-idx'));
      container.querySelectorAll('.tier-card').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      inspectRevoked(list[idx]);
    });
  });

  if (list.length > 0) {
    inspectRevoked(list[0]);
  }
}

function inspectRevoked(m) {
  const container = document.getElementById('revoked-detail-container');
  const deltaTag = document.getElementById('revoked-delta-tag');
  if (!container || !m) return;

  const dateStr = new Date(m.timestamp).toLocaleString();
  const sender = m.contact_name ? `${m.contact_name} (+${m.sender_jid.split('@')[0]})` : `+${m.sender_jid.split('@')[0]}`;

  if (deltaTag) {
    deltaTag.textContent = `Captured: ${dateStr}`;
  }

  let mediaHtml = '';
  if (m.media_file) {
    const mediaUrl = `/api/media/${encodeURIComponent(m.media_file)}`;
    if (m.media_mimetype?.startsWith('image/')) {
      mediaHtml = `
        <div style="margin: 0.85rem 0; background: #000; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); overflow: hidden; text-align: center;">
          <a href="${mediaUrl}" target="_blank" title="Click to view full resolution">
            <img src="${mediaUrl}" style="max-width: 100%; max-height: 380px; object-fit: contain; display: block; margin: 0 auto;" />
          </a>
        </div>
      `;
    } else if (m.media_mimetype?.startsWith('audio/')) {
      mediaHtml = `
        <div style="margin: 0.85rem 0; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.85rem;">
          <div style="font-size: 0.75rem; color: var(--accent-amber); font-family: var(--font-mono); margin-bottom: 0.5rem; font-weight: 600;">🎙️ Preserved Voice Note / Audio:</div>
          <audio controls style="width: 100%; height: 36px;" src="${mediaUrl}"></audio>
        </div>
      `;
    } else if (m.media_mimetype?.startsWith('video/')) {
      mediaHtml = `
        <div style="margin: 0.85rem 0; background: #000; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); overflow: hidden;">
          <video controls style="width: 100%; max-height: 360px;" src="${mediaUrl}"></video>
        </div>
      `;
    } else {
      mediaHtml = `
        <div style="margin: 0.85rem 0;">
          <a href="${mediaUrl}" download class="btn" style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 0.5rem 0.85rem; border-radius: var(--radius-sm); font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.4rem;">
            📎 Download Preserved Attachment (${escapeHtml(m.media_file)})
          </a>
        </div>
      `;
    }
  }

  const statusBanner = m.is_view_once
    ? `<div style="font-size: 0.75rem; color: var(--accent-purple); font-family: var(--font-mono); font-weight: 600;">👁️ Ephemeral View-Once Captured &amp; Decrypted by Messiah</div>`
    : `<div style="font-size: 0.75rem; color: var(--accent-coral); font-family: var(--font-mono); font-weight: 600;">⚠️ Deleted for Everyone by sender · Preserved by Messiah Anti-Revoke</div>`;

  container.innerHTML = `
    <div style="margin-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
      <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; font-family: var(--font-mono);">
        Sender Identity:
      </div>
      <div style="font-size: 1rem; font-weight: 600; color: var(--text-main); margin: 0.25rem 0;">
        ${escapeHtml(sender)}
      </div>
      ${statusBanner}
    </div>

    ${mediaHtml}

    <div style="font-size: 0.78rem; color: var(--text-dim); text-transform: uppercase; font-family: var(--font-mono); margin-bottom: 0.4rem;">
      Recovered Payload / Caption:
    </div>

    <div class="revoked-evidence-quote">
${escapeHtml(m.content || (m.media_file ? '[Preserved Media Binary]' : '[No Text Content]'))}
    </div>

    <div style="margin-top: 1.5rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.75rem; font-family: var(--font-mono); font-size: 0.76rem; display: flex; flex-direction: column; gap: 0.4rem;">
      <div><span style="color: var(--text-dim);">Message ID:</span> <span class="tabular-nums" style="color: var(--text-muted);">${escapeHtml(m.id)}</span></div>
      <div><span style="color: var(--text-dim);">Chat JID:</span> <span class="tabular-nums" style="color: var(--text-muted);">${escapeHtml(m.chat_jid)}</span></div>
      <div><span style="color: var(--text-dim);">Contact Tier:</span> <span style="color: var(--tier-${m.contact_tier || 4}); font-weight: 600;">Tier ${m.contact_tier || 4}</span></div>
      ${m.media_file ? `<div><span style="color: var(--text-dim);">Preserved File:</span> <span style="color: var(--accent-green);">${escapeHtml(m.media_file)} (${escapeHtml(m.media_mimetype || 'binary')})</span></div>` : ''}
    </div>
  `;
}

function exportRevokedJSON() {
  if (!revokedIntel.messages || revokedIntel.messages.length === 0) {
    showToast('No revoked records to export.', 'info');
    return;
  }
  const blob = new Blob([JSON.stringify(revokedIntel.messages, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `messiah_revoked_${Date.now()}.json`;
  a.click();
}

function exportRevokedCSV() {
  if (!revokedIntel.messages || revokedIntel.messages.length === 0) {
    showToast('No revoked records to export.', 'info');
    return;
  }

  const header = 'id,timestamp,sender_jid,contact_name,tier,content\n';
  const rows = revokedIntel.messages.map(m => {
    const cleanContent = `"${(m.content || '').replace(/"/g, '""')}"`;
    return `${m.id},${m.timestamp},${m.sender_jid},"${m.contact_name || ''}",${m.contact_tier || 4},${cleanContent}`;
  }).join('\n');

  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `messiah_revoked_${Date.now()}.csv`;
  a.click();
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(Math.abs(diff) / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

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

document.addEventListener('DOMContentLoaded', initContactsPage);
