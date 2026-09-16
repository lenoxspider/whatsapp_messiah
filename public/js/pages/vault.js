import { apiRequest } from '../api.js';
import { showToast, formatDate } from '../main.js';

export function initVaultPage() {
  const searchInput = document.getElementById('vault-search-input');
  const notesContainer = document.getElementById('notes-grid');
  const remindersContainer = document.getElementById('reminders-list');
  const newNoteForm = document.getElementById('new-note-form');
  const newNoteContent = document.getElementById('new-note-content');
  const newNoteTag = document.getElementById('new-note-tag');

  let debounceTimer = null;

  async function loadNotes(query = '') {
    try {
      const endpoint = query ? `/api/vault/notes?q=${encodeURIComponent(query)}` : '/api/vault/notes';
      const data = await apiRequest(endpoint);

      if (!notesContainer) return;

      if (!data.notes || data.notes.length === 0) {
        notesContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 3rem;">
          ${query ? `No notes found matching "${query}"` : 'No notes captured in vault yet. Forward notes to your WhatsApp or use the form above.'}
        </div>`;
        return;
      }

      notesContainer.innerHTML = data.notes.map(note => `
        <div class="note-card">
          <div class="note-content">${escapeHtml(note.content)}</div>
          <div class="note-footer">
            <span class="badge badge-cyan">#${escapeHtml(note.tag || 'inbox')}</span>
            <span>${formatDate(note.created_at)}</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      showToast('Failed to load notes: ' + err.message, 'error');
    }
  }

  async function loadReminders() {
    try {
      const data = await apiRequest('/api/vault/reminders');
      if (!remindersContainer) return;

      if (!data.reminders || data.reminders.length === 0) {
        remindersContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 2rem;">No reminders scheduled.</div>`;
        return;
      }

      remindersContainer.innerHTML = data.reminders.map(rem => `
        <div class="reminder-row ${rem.status === 'completed' ? 'completed' : ''}">
          <div>
            <div style="font-weight: 600; color: #fff;">${escapeHtml(rem.task)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">
              Due: ${formatDate(rem.trigger_at)} • Status: <span class="badge ${rem.status === 'pending' ? 'badge-amber' : 'badge-emerald'}">${rem.status}</span>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            ${rem.status === 'pending' ? `
              <button class="btn btn-emerald btn-complete-rem" data-id="${rem.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                ✓ Done
              </button>
            ` : ''}
            <button class="btn btn-danger btn-delete-rem" data-id="${rem.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
              ✕
            </button>
          </div>
        </div>
      `).join('');

      // Bind complete & delete handlers
      document.querySelectorAll('.btn-complete-rem').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await apiRequest(`/api/vault/reminders/${id}/complete`, { method: 'POST' });
          showToast('Reminder marked as completed!', 'success');
          loadReminders();
        });
      });

      document.querySelectorAll('.btn-delete-rem').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await apiRequest(`/api/vault/reminders/${id}`, { method: 'DELETE' });
          showToast('Reminder removed.', 'info');
          loadReminders();
        });
      });

    } catch (err) {
      showToast('Failed to load reminders: ' + err.message, 'error');
    }
  }

  // Live FTS Search
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadNotes(e.target.value.trim());
    }, 250);
  });

  // Create Note
  newNoteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = newNoteContent?.value.trim();
    const tag = newNoteTag?.value.trim() || 'inbox';

    if (!content) return;

    try {
      await apiRequest('/api/vault/notes', {
        method: 'POST',
        body: { content, tag }
      });
      showToast('Note saved to vault!', 'success');
      newNoteContent.value = '';
      loadNotes(searchInput?.value.trim() || '');
    } catch (err) {
      showToast('Failed to save note: ' + err.message, 'error');
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  loadNotes();
  loadReminders();
}

document.addEventListener('DOMContentLoaded', initVaultPage);
