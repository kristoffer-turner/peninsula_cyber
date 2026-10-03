const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getRsvps, saveRsvps, getEvents } = require('../store');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const rsvpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many RSVP attempts. Please try again later.' },
});

// Public: RSVP to an event. Only collects what's needed to send a reminder.
router.post('/', rsvpLimiter, (req, res) => {
  const { eventId, name, email } = req.body || {};

  if (typeof eventId !== 'string' || !eventId.trim()) {
    return res.status(400).json({ error: 'An event is required.' });
  }
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  const event = getEvents().find((e) => e.id === eventId);
  if (!event) {
    return res.status(404).json({ error: 'That event could not be found.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const rsvps = getRsvps();
  const existing = rsvps.find((r) => r.eventId === eventId && r.email === normalizedEmail);

  if (existing) {
    existing.name = name.trim();
  } else {
    rsvps.push({
      id: crypto.randomUUID(),
      eventId,
      name: name.trim(),
      email: normalizedEmail,
      rsvpedAt: new Date().toISOString(),
    });
  }

  saveRsvps(rsvps);
  res.status(201).json({ ok: true });
});

// Admin: list RSVPs, optionally filtered to one event.
router.get('/', requireAuth, (req, res) => {
  let rsvps = [...getRsvps()].sort((a, b) => (b.rsvpedAt || '').localeCompare(a.rsvpedAt || ''));
  if (req.query.eventId) {
    rsvps = rsvps.filter((r) => r.eventId === req.query.eventId);
  }
  res.json(rsvps);
});

// Admin: export RSVPs (optionally for one event) as CSV.
router.get('/export.csv', requireAuth, (req, res) => {
  let rsvps = getRsvps();
  if (req.query.eventId) {
    rsvps = rsvps.filter((r) => r.eventId === req.query.eventId);
  }

  const header = 'name,email,rsvpedAt,eventId\n';
  const rows = rsvps
    .map((r) =>
      [r.name, r.email, r.rsvpedAt, r.eventId]
        .map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="event-rsvps.csv"');
  res.send(header + rows + '\n');
});

// Admin: remove a single RSVP.
router.delete('/:id', requireAuth, (req, res) => {
  const rsvps = getRsvps();
  const filtered = rsvps.filter((r) => r.id !== req.params.id);
  if (filtered.length === rsvps.length) {
    return res.status(404).json({ error: 'RSVP not found.' });
  }
  saveRsvps(filtered);
  res.json({ ok: true });
});

module.exports = router;
