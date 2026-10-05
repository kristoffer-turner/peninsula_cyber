function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadSubscribersTable() {
  const tbody = document.getElementById('subscribers-table-body');
  tbody.innerHTML = '<tr><td colspan="4">Loading subscribers…</td></tr>';

  const response = await fetch('/api/subscribers');
  if (response.status === 401) {
    window.location.href = '/admin/login.html';
    return;
  }
  const subscribers = await response.json();

  if (!subscribers.length) {
    tbody.innerHTML = '<tr><td colspan="4">No subscribers yet.</td></tr>';
    return;
  }

  tbody.innerHTML = subscribers
    .map((sub) => {
      const name = [sub.firstName, sub.lastName].filter(Boolean).join(' ') || '—';

      return `
        <tr>
          <td>${escapeHtml(sub.email)}</td>
          <td>${escapeHtml(name)}</td>
          <td>${formatDate(sub.subscribedAt)}</td>
          <td>
            <button class="btn btn-danger btn-sm" data-delete="${escapeHtml(sub.id)}">Remove</button>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteSubscriber(btn.dataset.delete));
  });
}

async function deleteSubscriber(id) {
  if (!confirm('Remove this subscriber from the mailing list? This cannot be undone.')) return;
  const response = await fetch(`/api/subscribers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (response.ok) {
    loadSubscribersTable();
  } else {
    alert('Failed to remove subscriber.');
  }
}

loadSubscribersTable();
