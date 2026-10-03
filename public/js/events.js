function formatEventDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const monthName = date.toLocaleString('en-US', { month: 'short' });
  return { day: String(day), month: monthName };
}

function eventCardHtml(event) {
  const { day, month } = formatEventDate(event.date);
  const fullDate = new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const registration = event.registrationUrl
    ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(event.registrationUrl)}">Register</a>`
    : '';

  return `
    <article class="card event-card">
      <div class="event-date" aria-hidden="true">
        <span class="day">${day}</span>
        <span class="month">${month}</span>
      </div>
      <div>
        <p class="event-meta">${fullDate}${event.time ? ' &middot; ' + escapeHtml(event.time) : ''}</p>
        <h3>${escapeHtml(event.title)}</h3>
        ${event.location ? `<p class="event-meta">${escapeHtml(event.location)}</p>` : ''}
        <p>${escapeHtml(event.description || '')}</p>
        <div class="action-row">
          <button type="button" class="btn btn-primary btn-sm" data-rsvp-btn="${event.id}" data-event-title="${escapeHtml(event.title)}">RSVP</button>
          ${registration}
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadEvents(targetSelector, { upcomingOnly = true, limit = null, emptyMessage = 'No events are scheduled right now. Check back soon!' } = {}) {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  try {
    const url = upcomingOnly ? '/api/events?upcoming=true' : '/api/events';
    const response = await fetch(url);
    let events = await response.json();

    if (limit) {
      events = events.slice(0, limit);
    }

    if (!events.length) {
      target.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
      return;
    }

    target.innerHTML = events.map(eventCardHtml).join('');
  } catch (err) {
    target.innerHTML = '<p class="empty-state">We had trouble loading events. Please refresh the page.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const target = document.querySelector('[data-events-list]');
  if (!target) return;

  const upcomingOnly = target.dataset.upcomingOnly !== 'false';
  const limit = target.dataset.limit ? Number(target.dataset.limit) : null;

  loadEvents('[data-events-list]', { upcomingOnly, limit });
});

/* --------------------------- RSVP modal --------------------------------- */

function buildRsvpModal() {
  if (document.getElementById('rsvp-modal')) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="modal-overlay" id="rsvp-modal" hidden>
      <div class="modal-card">
        <h2 id="rsvp-modal-title">RSVP</h2>
        <div class="alert alert-info">
          <p>We'll only use your name and email to send you reminders about this event — nothing else.</p>
        </div>
        <form id="rsvp-form" novalidate>
          <input type="hidden" id="rsvp-event-id" />
          <div class="form-field">
            <label for="rsvp-name">Your name</label>
            <input type="text" id="rsvp-name" autocomplete="name" required />
          </div>
          <div class="form-field">
            <label for="rsvp-email">Email address</label>
            <input type="email" id="rsvp-email" autocomplete="email" required />
          </div>
          <p id="rsvp-form-error" class="form-error" role="alert"></p>
          <p id="rsvp-form-success" class="form-helper" role="status" aria-live="polite"></p>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Confirm RSVP</button>
            <button type="button" class="btn btn-secondary" id="rsvp-cancel-btn">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper.firstElementChild);

  const modal = document.getElementById('rsvp-modal');
  const form = document.getElementById('rsvp-form');

  document.getElementById('rsvp-cancel-btn').addEventListener('click', closeRsvpModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeRsvpModal();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorEl = document.getElementById('rsvp-form-error');
    const successEl = document.getElementById('rsvp-form-success');
    const submitBtn = form.querySelector('button[type="submit"]');
    errorEl.textContent = '';
    successEl.textContent = '';
    submitBtn.disabled = true;

    try {
      const response = await fetch('/api/rsvps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: document.getElementById('rsvp-event-id').value,
          name: document.getElementById('rsvp-name').value.trim(),
          email: document.getElementById('rsvp-email').value.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      successEl.textContent = "You're confirmed! We'll send you a reminder before the seminar.";
      form.reset();
      setTimeout(closeRsvpModal, 2000);
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function openRsvpModal(eventId, eventTitle) {
  buildRsvpModal();
  document.getElementById('rsvp-modal-title').textContent = eventTitle ? `RSVP — ${eventTitle}` : 'RSVP';
  document.getElementById('rsvp-event-id').value = eventId;
  document.getElementById('rsvp-form-error').textContent = '';
  document.getElementById('rsvp-form-success').textContent = '';
  document.getElementById('rsvp-form').reset();
  document.getElementById('rsvp-modal').hidden = false;
  document.getElementById('rsvp-name').focus();
}

function closeRsvpModal() {
  const modal = document.getElementById('rsvp-modal');
  if (modal) modal.hidden = true;
}

document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-rsvp-btn]');
  if (btn) {
    openRsvpModal(btn.dataset.rsvpBtn, btn.dataset.eventTitle);
  }
});
