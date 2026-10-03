const modal = document.getElementById('event-modal');
const form = document.getElementById('event-form');
const modalTitle = document.getElementById('event-modal-title');
const formError = document.getElementById('event-form-error');

function openModal(event = null) {
  form.reset();
  formError.textContent = '';
  document.getElementById('event-id').value = event?.id || '';
  document.getElementById('event-title').value = event?.title || '';
  document.getElementById('event-date').value = event?.date || '';
  document.getElementById('event-time').value = event?.time || '';
  document.getElementById('event-location').value = event?.location || '';
  document.getElementById('event-description').value = event?.description || '';
  document.getElementById('event-registration').value = event?.registrationUrl || '';
  document.getElementById('event-capacity').value = event?.capacity || '';
  modalTitle.textContent = event ? 'Edit Event' : 'Add Event';
  modal.hidden = false;
  document.getElementById('event-title').focus();
}

function closeModal() {
  modal.hidden = true;
}

document.getElementById('add-event-btn').addEventListener('click', () => openModal());
document.getElementById('cancel-event-btn').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});

async function loadEventsTable() {
  const tbody = document.getElementById('events-table-body');
  tbody.innerHTML = '<tr><td colspan="6">Loading events…</td></tr>';

  const [eventsResponse, rsvpsResponse] = await Promise.all([fetch('/api/events'), fetch('/api/rsvps')]);
  if (eventsResponse.status === 401 || rsvpsResponse.status === 401) {
    window.location.href = '/admin/login.html';
    return;
  }
  const events = await eventsResponse.json();
  const rsvps = await rsvpsResponse.json();

  const rsvpCounts = rsvps.reduce((counts, rsvp) => {
    counts[rsvp.eventId] = (counts[rsvp.eventId] || 0) + 1;
    return counts;
  }, {});

  if (!events.length) {
    tbody.innerHTML = '<tr><td colspan="6">No events yet. Click "Add Event" to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = events
    .map(
      (event) => `
    <tr>
      <td>${escapeHtml(event.date)}${event.time ? `<br><span class="form-helper">${escapeHtml(event.time)}</span>` : ''}</td>
      <td>${escapeHtml(event.title)}</td>
      <td>${escapeHtml(event.location)}</td>
      <td>${event.registrationUrl ? `<a href="${escapeHtml(event.registrationUrl)}" target="_blank" rel="noopener">Link</a>` : '—'}</td>
      <td>
        <button class="btn btn-secondary btn-sm" data-view-rsvps="${event.id}" data-event-title="${escapeHtml(event.title)}">
          ${rsvpCounts[event.id] || 0}
        </button>
      </td>
      <td>
        <div class="action-row">
          <button class="btn btn-secondary btn-sm" data-edit="${event.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete="${event.id}">Delete</button>
        </div>
      </td>
    </tr>
  `
    )
    .join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const event = events.find((e) => e.id === btn.dataset.edit);
      openModal(event);
    });
  });

  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteEvent(btn.dataset.delete));
  });

  tbody.querySelectorAll('[data-view-rsvps]').forEach((btn) => {
    btn.addEventListener('click', () => openRsvpListModal(btn.dataset.viewRsvps, btn.dataset.eventTitle));
  });
}

async function deleteEvent(id) {
  if (!confirm('Delete this event? This cannot be undone.')) return;
  const response = await fetch(`/api/events/${id}`, { method: 'DELETE' });
  if (response.ok) {
    loadEventsTable();
  } else {
    alert('Failed to delete event.');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';

  const id = document.getElementById('event-id').value;
  const payload = {
    title: document.getElementById('event-title').value.trim(),
    date: document.getElementById('event-date').value,
    time: document.getElementById('event-time').value.trim(),
    location: document.getElementById('event-location').value.trim(),
    description: document.getElementById('event-description').value.trim(),
    registrationUrl: document.getElementById('event-registration').value.trim(),
    capacity: document.getElementById('event-capacity').value || null,
  };

  const url = id ? `/api/events/${id}` : '/api/events';
  const method = id ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to save event.');
    }
    closeModal();
    loadEventsTable();
  } catch (err) {
    formError.textContent = err.message;
  }
});

/* ------------------------------ RSVP list -------------------------------- */

const rsvpListModal = document.getElementById('rsvp-list-modal');
const rsvpListTitle = document.getElementById('rsvp-list-title');
const rsvpListTable = document.getElementById('rsvp-list-table');
const rsvpListBody = document.getElementById('rsvp-list-body');
const rsvpListEmpty = document.getElementById('rsvp-list-empty');
const rsvpExportLink = document.getElementById('rsvp-export-link');

function formatRsvpDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function openRsvpListModal(eventId, eventTitle) {
  rsvpListTitle.textContent = eventTitle ? `RSVPs — ${eventTitle}` : 'RSVPs';
  rsvpExportLink.href = `/api/rsvps/export.csv?eventId=${encodeURIComponent(eventId)}`;
  rsvpListModal.hidden = false;
  rsvpListTable.hidden = true;
  rsvpListEmpty.hidden = true;
  rsvpListBody.innerHTML = '';

  const response = await fetch(`/api/rsvps?eventId=${encodeURIComponent(eventId)}`);
  if (response.status === 401) {
    window.location.href = '/admin/login.html';
    return;
  }
  const rsvps = await response.json();

  if (!rsvps.length) {
    rsvpListEmpty.hidden = false;
    return;
  }

  rsvpListTable.hidden = false;
  rsvpListBody.innerHTML = rsvps
    .map(
      (rsvp) => `
    <tr>
      <td>${escapeHtml(rsvp.name)}</td>
      <td>${escapeHtml(rsvp.email)}</td>
      <td>${formatRsvpDate(rsvp.rsvpedAt)}</td>
      <td><button class="btn btn-danger btn-sm" data-remove-rsvp="${rsvp.id}">Remove</button></td>
    </tr>
  `
    )
    .join('');

  rsvpListBody.querySelectorAll('[data-remove-rsvp]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this RSVP?')) return;
      const deleteResponse = await fetch(`/api/rsvps/${btn.dataset.removeRsvp}`, { method: 'DELETE' });
      if (deleteResponse.ok) {
        openRsvpListModal(eventId, eventTitle);
        loadEventsTable();
      } else {
        alert('Failed to remove RSVP.');
      }
    });
  });
}

document.getElementById('rsvp-list-close-btn').addEventListener('click', () => {
  rsvpListModal.hidden = true;
});
rsvpListModal.addEventListener('click', (event) => {
  if (event.target === rsvpListModal) rsvpListModal.hidden = true;
});

loadEventsTable();
