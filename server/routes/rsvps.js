const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db, toRsvp } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');
const { toCsv } = require('../csv');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_NAME = 100;

const rsvpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many RSVP attempts. Please try again later.' },
});

const selectEvent = db.prepare('SELECT id FROM events WHERE id = ?');
// RSVPing again with the same email just refreshes the name; no duplicates.
const upsertRsvp = db.prepare(`
  INSERT INTO rsvps (id, event_id, name, email, rsvped_at)
  VALUES (@id, @event_id, @name, @email, @rsvped_at)
  ON CONFLICT(event_id, email) DO UPDATE SET name = excluded.name
`);
const selectAll = db.prepare('SELECT * FROM rsvps ORDER BY rsvped_at DESC');
const selectByEvent = db.prepare('SELECT * FROM rsvps WHERE event_id = ? ORDER BY rsvped_at DESC');
const deleteRsvp = db.prepare('DELETE FROM rsvps WHERE id = ?');

// Public: RSVP to an event. Only collects what's needed to send a reminder.
router.post('/', rsvpLimiter, (req, res) => {
  const { eventId, name, email } = req.body || {};

  if (typeof eventId !== 'string' || !eventId.trim()) {
    return res.status(400).json({ error: 'An event is required.' });
  }
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  if (typeof email !== 'string' || email.trim().length > MAX_EMAIL || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  if (!selectEvent.get(eventId)) {
    return res.status(404).json({ error: 'That event could not be found.' });
  }

  upsertRsvp.run({
    id: crypto.randomUUID(),
    event_id: eventId,
    name: name.trim().slice(0, MAX_NAME),
    email: email.trim().toLowerCase(),
    rsvped_at: new Date().toISOString(),
  });

  res.status(201).json({ ok: true });
});

// Admin: list RSVPs, optionally filtered to one event.
router.get('/', requireAuth, (req, res) => {
  const rows = req.query.eventId ? selectByEvent.all(String(req.query.eventId)) : selectAll.all();
  res.json(rows.map(toRsvp));
});

// Admin: export RSVPs (optionally for one event) as CSV.
router.get('/export.csv', requireAuth, (req, res) => {
  const rows = req.query.eventId ? selectByEvent.all(String(req.query.eventId)) : selectAll.all();

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="event-rsvps.csv"');
  res.send(
    toCsv(
      ['name', 'email', 'rsvpedAt', 'eventId'],
      rows.map((r) => [r.name, r.email, r.rsvped_at, r.event_id])
    )
  );
});

// Admin: remove a single RSVP.
router.delete('/:id', requireAuth, (req, res) => {
  const { changes } = deleteRsvp.run(req.params.id);
  if (!changes) {
    return res.status(404).json({ error: 'RSVP not found.' });
  }
  res.json({ ok: true });
});

module.exports = router;
