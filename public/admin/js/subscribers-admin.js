function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadSubscribersTable() {
  const tbody = document.getElementById('subscribers-table-body');
  tbody.innerHTML = '<tr><td colspan="5">Loading subscribers…</td></tr>';

  const response = await fetch('/api/subscribers');
  if (response.status === 401) {
    window.location.href = '/admin/login.html';
    return;
  }
  const subscribers = await response.json();

  if (!subscribers.length) {
    tbody.innerHTML = '<tr><td colspan="5">No subscribers yet.</td></tr>';
    return;
  }

  tbody.innerHTML = subscribers
    .map((sub) => {
      const name = [sub.firstName, sub.lastName].filter(Boolean).join(' ') || '—';
      const badge = sub.hubspot?.synced
        ? '<span class="badge badge-success">Synced</span>'
        : '<span class="badge badge-pending">Not synced</span>';
      const errorNote = sub.hubspot?.lastError
        ? `<br><span class="form-error">${escapeHtml(sub.hubspot.lastError)}</span>`
        : '';

      return `
        <tr>
          <td>${escapeHtml(sub.email)}</td>
          <td>${escapeHtml(name)}</td>
          <td>${formatDate(sub.subscribedAt)}</td>
          <td>${badge}${errorNote}</td>
          <td>
            <div class="action-row">
              <button class="btn btn-secondary btn-sm" data-sync="${sub.id}">Sync</button>
              <button class="btn btn-danger btn-sm" data-delete="${sub.id}">Remove</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('[data-sync]').forEach((btn) => {
    btn.addEventListener('click', () => syncOne(btn.dataset.sync));
  });
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteSubscriber(btn.dataset.delete));
  });
}

async function syncOne(id) {
  const status = document.getElementById('sync-status');
  status.textContent = 'Syncing…';
  status.className = 'form-helper';
  try {
    const response = await fetch(`/api/subscribers/${id}/sync`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sync failed.');
    status.textContent = 'Synced successfully.';
    loadSubscribersTable();
  } catch (err) {
    status.textContent = err.message;
    status.className = 'form-error';
  }
}

async function deleteSubscriber(id) {
  if (!confirm('Remove this subscriber from the local mailing list? This does not remove them from HubSpot.')) return;
  const response = await fetch(`/api/subscribers/${id}`, { method: 'DELETE' });
  if (response.ok) {
    loadSubscribersTable();
  } else {
    alert('Failed to remove subscriber.');
  }
}

document.getElementById('sync-all-btn').addEventListener('click', async () => {
  const status = document.getElementById('sync-status');
  status.textContent = 'Syncing all unsynced subscribers…';
  status.className = 'form-helper';
  try {
    const response = await fetch('/api/subscribers/sync-all', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sync failed.');
    status.textContent = `Done. Synced ${data.synced}, failed ${data.failed}.`;
    loadSubscribersTable();
  } catch (err) {
    status.textContent = err.message;
    status.className = 'form-error';
  }
});

loadSubscribersTable();
