const express = require('express');
const crypto = require('crypto');
const { db, toEvent } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

const selectAll = db.prepare('SELECT * FROM events ORDER BY date, time, title');
const selectUpcoming = db.prepare('SELECT * FROM events WHERE date >= ? ORDER BY date, time, title');
const selectOne = db.prepare('SELECT * FROM events WHERE id = ?');
const insertEvent = db.prepare(`
  INSERT INTO events (id, title, date, time, location, description, registration_url, capacity)
  VALUES (@id, @title, @date, @time, @location, @description, @registration_url, @capacity)
`);
const updateEvent = db.prepare(`
  UPDATE events SET title = @title, date = @date, time = @time, location = @location,
    description = @description, registration_url = @registration_url, capacity = @capacity
  WHERE id = @id
`);
// RSVPs for the event are removed by the ON DELETE CASCADE foreign key, so the
// mailing/reminder data never outlives the seminar it was collected for.
const deleteEvent = db.prepare('DELETE FROM events WHERE id = ?');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns { value } or { error }. Blank/absent capacity means "no limit".
function parseEventPayload(body) {
  if (!body || typeof body.title !== 'string' || !body.title.trim()) {
    return { error: 'Title and date are required.' };
  }
  if (typeof body.date !== 'string' || !DATE_RE.test(body.date.trim())) {
    return { error: 'Title and date are required.' };
  }

  let capacity = null;
  if (body.capacity !== null && body.capacity !== undefined && String(body.capacity).trim() !== '') {
    capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      return { error: 'Capacity must be a whole number of 1 or more.' };
    }
  }

  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    value: {
      title: body.title.trim(),
      date: body.date.trim(),
      time: text(body.time),
      location: text(body.location),
      description: text(body.description),
      registration_url: text(body.registrationUrl),
      capacity,
    },
  };
}

// Public: list events. Supports ?upcoming=true to only return future events.
router.get('/', (req, res) => {
  const rows =
    req.query.upcoming === 'true'
      ? selectUpcoming.all(new Date().toISOString().slice(0, 10))
      : selectAll.all();
  res.json(rows.map(toEvent));
});

// Admin: create event.
router.post('/', requireAuth, (req, res) => {
  const parsed = parseEventPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const id = crypto.randomUUID();
  insertEvent.run({ id, ...parsed.value });
  res.status(201).json(toEvent(selectOne.get(id)));
});

// Admin: update event.
router.put('/:id', requireAuth, (req, res) => {
  const parsed = parseEventPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { changes } = updateEvent.run({ id: req.params.id, ...parsed.value });
  if (!changes) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  res.json(toEvent(selectOne.get(req.params.id)));
});

// Admin: delete event (and, via cascade, its RSVPs).
router.delete('/:id', requireAuth, (req, res) => {
  const { changes } = deleteEvent.run(req.params.id);
  if (!changes) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  res.json({ ok: true });
});

module.exports = router;
