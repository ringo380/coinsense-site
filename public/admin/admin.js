(() => {
  const TOKEN_KEY = 'coinsense_admin_token';

  function getToken() {
    let token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = prompt('Admin token:');
      if (!token) return null;
      sessionStorage.setItem(TOKEN_KEY, token.trim());
      return token.trim();
    }
    return token;
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  async function api(path, options = {}) {
    const token = getToken();
    if (!token) throw new Error('No token');
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(options.body && !options.headers?.['Content-Type']
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
    });
    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      toast('Unauthorized. Refresh to re-enter token.', 'error');
      throw new Error('Unauthorized');
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(data.error || `${res.status} ${res.statusText}`);
    }
    return data;
  }

  function toast(message, tone = 'info') {
    const el = document.getElementById('toast');
    const tones = {
      info: 'bg-white/10 border-white/20 text-white',
      success: 'bg-green-500/10 border-green-500/40 text-green-300',
      error: 'bg-red-500/10 border-red-500/40 text-red-300',
    };
    el.className = `fixed bottom-6 right-6 px-4 py-2 rounded-md text-sm font-mono border z-50 ${tones[tone] || tones.info}`;
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  // ---- Tabs ----

  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  function showTab(name) {
    tabs.forEach((t) => {
      const active = t.dataset.tab === name;
      t.classList.toggle('text-white', active);
      t.classList.toggle('bg-white/10', active);
      t.classList.toggle('text-white/60', !active);
    });
    panels.forEach((p) => p.classList.toggle('hidden', p.id !== `tab-${name}`));
    if (name === 'contacts') loadContacts();
    if (name === 'history') loadHistory();
    location.hash = name;
  }

  tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  document.getElementById('logout').addEventListener('click', clearToken);

  // ---- Contacts ----

  async function loadContacts() {
    const tbody = document.getElementById('contacts-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-white/40 text-xs font-mono">Loading…</td></tr>';

    try {
      const payload = await api('/api/admin/contacts');
      const contacts = payload.data ?? payload ?? [];
      document.getElementById('contacts-count').textContent = `${contacts.length} total`;

      if (!contacts.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-white/40 text-xs font-mono">No contacts yet.</td></tr>';
        return;
      }

      tbody.innerHTML = contacts
        .map((c) => {
          const unsub = c.unsubscribed ? 'Unsubscribed' : 'Subscribed';
          const tone = c.unsubscribed ? 'text-red-400' : 'text-green-400';
          return `
            <tr class="border-t border-white/5 hover:bg-white/5">
              <td class="px-4 py-2 font-mono text-sm">${escape(c.email)}</td>
              <td class="px-4 py-2 text-white/60 text-xs font-mono">${fmtDate(c.created_at)}</td>
              <td class="px-4 py-2 text-xs font-mono ${tone}">${unsub}</td>
              <td class="px-4 py-2 text-right">
                <button data-email="${escape(c.email)}" class="delete-contact text-xs font-mono text-white/40 hover:text-red-400">Remove</button>
              </td>
            </tr>
          `;
        })
        .join('');

      tbody.querySelectorAll('.delete-contact').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const email = btn.dataset.email;
          if (!confirm(`Remove ${email}?`)) return;
          try {
            await api(`/api/admin/contacts?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
            toast(`Removed ${email}`, 'success');
            loadContacts();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-6 text-center text-red-400 text-xs font-mono">${escape(err.message)}</td></tr>`;
    }
  }

  // ---- Compose ----

  const bodyEl = document.getElementById('compose-body');
  const previewFrame = document.getElementById('compose-preview-frame');
  const statusEl = document.getElementById('compose-status');
  let currentDraftId = null;

  function updatePreview() {
    const md = bodyEl.value || '';
    // Replace Resend template tokens with placeholders for preview
    const safe = md
      .replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, '#unsubscribe')
      .replace(/\{\{\{contact\.([^|}]+)(?:\|([^}]+))?\}\}\}/g, (_, key, fallback) => fallback || `[${key}]`);
    const html = window.marked.parse(safe, { gfm: true, breaks: false });
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#111}a{color:#16a34a}code{background:#f5f5f5;padding:2px 4px;border-radius:3px;font-size:0.9em}</style></head><body>${html}</body></html>`;
    previewFrame.srcdoc = doc;
  }

  bodyEl.addEventListener('input', updatePreview);
  document.getElementById('compose-subject').addEventListener('input', () => {
    statusEl.textContent = currentDraftId ? 'Draft modified — re-save to update.' : 'Draft unsaved.';
  });

  function composePayload() {
    const subject = document.getElementById('compose-subject').value.trim();
    const previewText = document.getElementById('compose-preview').value.trim();
    const markdown = bodyEl.value;
    if (!subject || !markdown) {
      throw new Error('Subject and body required');
    }
    const safe = markdown.replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, '{{{RESEND_UNSUBSCRIBE_URL}}}');
    const html = window.marked.parse(safe, { gfm: true, breaks: false });
    return { subject, html, ...(previewText ? { previewText } : {}) };
  }

  document.getElementById('compose-test').addEventListener('click', async () => {
    const to = prompt('Send test to:', 'ringo380@gmail.com');
    if (!to) return;
    try {
      const payload = composePayload();
      await api('/api/admin/test-send', {
        method: 'POST',
        body: JSON.stringify({ to, subject: `[TEST] ${payload.subject}`, html: payload.html }),
      });
      toast(`Test sent to ${to}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('compose-save').addEventListener('click', async () => {
    try {
      const payload = composePayload();
      if (currentDraftId) {
        await api(`/api/admin/broadcasts/${currentDraftId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast('Draft updated', 'success');
      } else {
        const created = await api('/api/admin/broadcasts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        currentDraftId = created.id;
        statusEl.textContent = `Draft ${currentDraftId} saved.`;
        toast('Draft saved', 'success');
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('compose-send').addEventListener('click', async () => {
    try {
      const payload = composePayload();
      if (!currentDraftId) {
        const created = await api('/api/admin/broadcasts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        currentDraftId = created.id;
      } else {
        await api(`/api/admin/broadcasts/${currentDraftId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }

      const scheduleInput = document.getElementById('compose-schedule').value;
      const scheduledAt = scheduleInput ? new Date(scheduleInput).toISOString() : null;

      const label = scheduledAt ? `Schedule for ${new Date(scheduleInput).toLocaleString()}?` : 'Send NOW to full segment?';
      if (!confirm(`${label}\n\nBroadcast: ${payload.subject}`)) return;

      await api(`/api/admin/broadcasts/${currentDraftId}/send`, {
        method: 'POST',
        body: JSON.stringify(scheduledAt ? { scheduledAt } : {}),
      });

      toast(scheduledAt ? 'Scheduled' : 'Sent', 'success');
      currentDraftId = null;
      statusEl.textContent = 'Sent — compose a new one.';
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // ---- History ----

  async function loadHistory() {
    const tbody = document.getElementById('history-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-center text-white/40 text-xs font-mono">Loading…</td></tr>';

    try {
      const payload = await api('/api/admin/broadcasts');
      const broadcasts = payload.data ?? payload ?? [];

      if (!broadcasts.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-center text-white/40 text-xs font-mono">No broadcasts yet.</td></tr>';
        return;
      }

      const eventsByBroadcast = {};
      await Promise.all(
        broadcasts.map(async (b) => {
          if (b.status !== 'draft') {
            try {
              const ev = await api(`/api/admin/events?broadcast_id=${b.id}`);
              eventsByBroadcast[b.id] = ev.counts || {};
            } catch {
              eventsByBroadcast[b.id] = {};
            }
          }
        })
      );

      tbody.innerHTML = broadcasts
        .map((b) => {
          const counts = eventsByBroadcast[b.id] || {};
          return `
            <tr class="border-t border-white/5 hover:bg-white/5">
              <td class="px-4 py-2">${escape(b.subject || b.name || '(untitled)')}</td>
              <td class="px-4 py-2 text-xs font-mono text-white/60">${escape(b.status || '—')}</td>
              <td class="px-4 py-2 text-xs font-mono text-white/60">${fmtDate(b.sent_at || b.scheduled_at)}</td>
              <td class="px-3 py-2 text-right font-mono text-sm">${counts.delivered ?? 0}</td>
              <td class="px-3 py-2 text-right font-mono text-sm">${counts.opened ?? 0}</td>
              <td class="px-3 py-2 text-right font-mono text-sm">${counts.clicked ?? 0}</td>
              <td class="px-3 py-2 text-right font-mono text-sm">${counts.bounced ?? 0}</td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-red-400 text-xs font-mono">${escape(err.message)}</td></tr>`;
    }
  }

  function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ---- Init ----

  if (!getToken()) {
    document.body.innerHTML = '<div class="min-h-screen flex items-center justify-center text-white/40 font-mono text-sm">Refresh and enter the admin token to continue.</div>';
    return;
  }

  const initialTab = location.hash.replace('#', '') || 'contacts';
  showTab(['contacts', 'compose', 'history'].includes(initialTab) ? initialTab : 'contacts');
})();
