import { apiRequest } from '../api.js';
import { showToast, formatDate } from '../main.js';

export function initContactsPage() {
  const tabContacts = document.getElementById('tab-contacts-btn');
  const tabRevoked = document.getElementById('tab-revoked-btn');
  const viewContacts = document.getElementById('view-contacts');
  const viewRevoked = document.getElementById('view-revoked');

  const contactsTbody = document.getElementById('contacts-tbody');
  const revokedTbody = document.getElementById('revoked-tbody');

  // Modal elements for persona editing
  const modal = document.getElementById('persona-modal');
  const modalContactName = document.getElementById('modal-contact-name');
  const modalPersonaInput = document.getElementById('modal-persona-input');
  const modalSaveBtn = document.getElementById('modal-save-persona-btn');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  let activeModalJid = null;

  // Tab switching
  tabContacts?.addEventListener('click', () => {
    tabContacts.classList.add('active');
    tabRevoked.classList.remove('active');
    viewContacts.style.display = 'block';
    viewRevoked.style.display = 'none';
  });

  tabRevoked?.addEventListener('click', () => {
    tabRevoked.classList.add('active');
    tabContacts.classList.remove('active');
    viewContacts.style.display = 'none';
    viewRevoked.style.display = 'block';
    loadRevokedMessages();
  });

  async function loadContacts() {
    try {
      const data = await apiRequest('/api/contacts');
      if (!contactsTbody) return;

      if (!data.contacts || data.contacts.length === 0) {
        contactsTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 2rem;">No contacts recorded yet. When contacts message you, they will appear here.</td></tr>`;
        return;
      }

      contactsTbody.innerHTML = data.contacts.map(c => `
        <tr>
          <td>
            <div style="font-weight: 600;">${escapeHtml(c.name || 'Unknown')}</div>
            <div style="font-size: 0.78rem; color: var(--text-dim); font-family: var(--font-mono);">${escapeHtml(c.phone)}</div>
          </td>
          <td>
            <select class="form-select tier-select" data-jid="${encodeURIComponent(c.jid)}" style="padding: 0.4rem 0.75rem; width: auto; font-size: 0.85rem;">
              <option value="1" ${c.tier === 1 ? 'selected' : ''}>Tier 1 (Inner Circle)</option>
              <option value="2" ${c.tier === 2 ? 'selected' : ''}>Tier 2 (Acquaintance)</option>
              <option value="3" ${c.tier === 3 ? 'selected' : ''}>Tier 3 (Business)</option>
              <option value="4" ${c.tier === 4 ? 'selected' : ''}>Tier 4 (Stranger)</option>
              <option value="5" ${c.tier === 5 ? 'selected' : ''}>Tier 5 (Ignore / Zero Ticks)</option>
            </select>
          </td>
          <td>
            <span class="badge ${getTierBadgeClass(c.tier)}">
              ${c.custom_persona ? 'Custom Persona Active' : 'Default Tier Rule'}
            </span>
          </td>
          <td>${formatDate(c.last_interaction)}</td>
          <td>
            <button class="btn btn-secondary btn-edit-persona" data-jid="${encodeURIComponent(c.jid)}" data-name="${escapeHtml(c.name || c.phone)}" data-persona="${escapeHtml(c.custom_persona || '')}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
              ✏️ Persona
            </button>
          </td>
        </tr>
      `).join('');

      // Bind Tier change events
      document.querySelectorAll('.tier-select').forEach(sel => {
        sel.addEventListener('change', async () => {
          const jid = sel.getAttribute('data-jid');
          const tier = sel.value;
          try {
            await apiRequest(`/api/contacts/${jid}/tier`, {
              method: 'PUT',
              body: { tier }
            });
            showToast('Contact tier updated!', 'success');
          } catch (err) {
            showToast('Failed to update tier: ' + err.message, 'error');
          }
        });
      });

      // Bind Persona Edit modal
      document.querySelectorAll('.btn-edit-persona').forEach(btn => {
        btn.addEventListener('click', () => {
          activeModalJid = btn.getAttribute('data-jid');
          const name = btn.getAttribute('data-name');
          const persona = btn.getAttribute('data-persona');

          if (modalContactName) modalContactName.textContent = name;
          if (modalPersonaInput) modalPersonaInput.value = persona;
          if (modal) modal.classList.add('active');
        });
      });

    } catch (err) {
      showToast('Failed to load contacts: ' + err.message, 'error');
    }
  }

  async function loadRevokedMessages() {
    try {
      const data = await apiRequest('/api/contacts/revoked');
      if (!revokedTbody) return;

      if (!data.revokedMessages || data.revokedMessages.length === 0) {
        revokedTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 2rem;">No revoked messages intercepted yet.</td></tr>`;
        return;
      }

      revokedTbody.innerHTML = data.revokedMessages.map(m => `
        <tr class="audit-revoke-row">
          <td>
            <div style="font-weight: 600;">${escapeHtml(m.contact_name || m.sender_jid.split('@')[0])}</div>
            <div style="font-size: 0.78rem; color: var(--text-dim);">${formatDate(m.timestamp)}</div>
          </td>
          <td style="color: var(--accent-amber); font-weight: 500;">
            ${escapeHtml(m.content || '[Media / Raw Payload]')}
          </td>
          <td>${formatDate(m.revoked_at)}</td>
          <td><span class="badge badge-amber">Preserved in Vault</span></td>
        </tr>
      `).join('');
    } catch (err) {
      showToast('Failed to load revoked audit log: ' + err.message, 'error');
    }
  }

  // Modal Save & Close
  modalSaveBtn?.addEventListener('click', async () => {
    if (!activeModalJid) return;
    const persona = modalPersonaInput?.value.trim() || null;
    try {
      await apiRequest(`/api/contacts/${activeModalJid}/persona`, {
        method: 'PUT',
        body: { persona }
      });
      showToast('Custom persona saved for contact!', 'success');
      modal?.classList.remove('active');
      loadContacts();
    } catch (err) {
      showToast('Failed to save persona: ' + err.message, 'error');
    }
  });

  modalCloseBtn?.addEventListener('click', () => {
    modal?.classList.remove('active');
  });

  function getTierBadgeClass(tier) {
    switch (tier) {
      case 1: return 'badge-emerald';
      case 2: return 'badge-cyan';
      case 3: return 'badge-purple';
      case 4: return 'badge-amber';
      case 5: default: return 'badge-rose';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  loadContacts();
}

document.addEventListener('DOMContentLoaded', initContactsPage);
