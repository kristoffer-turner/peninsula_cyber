const express = require('express');
const crypto = require('crypto');
const { getEvents, saveEvents, getRsvps, saveRsvps } = require('../store');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

function isValidEventPayload(body) {
  return (
    body &&
    typeof body.title === 'string' &&
    body.title.trim().length > 0 &&
    typeof body.date === 'string' &&
    body.date.trim().length > 0
  );
}

function sortByDate(events) {
  return [...events].sort((a, b) => a.date.localeCompare(b.date));
}

// Public: list events. Supports ?upcoming=true to only return future events.
router.get('/', (req, res) => {
  const events = sortByDate(getEvents());
  if (req.query.upcoming === 'true') {
    const today = new Date().toISOString().slice(0, 10);
    return res.json(events.filter((event) => event.date >= today));
  }
  res.json(events);
});

// Admin: create event.
router.post('/', requireAuth, (req, res) => {
  if (!isValidEventPayload(req.body)) {
    return res.status(400).json({ error: 'Title and date are required.' });
  }

  const events = getEvents();
  const newEvent = {
    id: crypto.randomUUID(),
    title: req.body.title.trim(),
    date: req.body.date.trim(),
    time: (req.body.time || '').trim(),
    location: (req.body.location || '').trim(),
    description: (req.body.description || '').trim(),
    registrationUrl: (req.body.registrationUrl || '').trim(),
    capacity: Number.isFinite(Number(req.body.capacity)) ? Number(req.body.capacity) : null,
  };

  events.push(newEvent);
  saveEvents(events);
  res.status(201).json(newEvent);
});

// Admin: update event.
router.put('/:id', requireAuth, (req, res) => {
  if (!isValidEventPayload(req.body)) {
    return res.status(400).json({ error: 'Title and date are required.' });
  }

  const events = getEvents();
  const index = events.findIndex((event) => event.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  events[index] = {
    ...events[index],
    title: req.body.title.trim(),
    date: req.body.date.trim(),
    time: (req.body.time || '').trim(),
    location: (req.body.location || '').trim(),
    description: (req.body.description || '').trim(),
    registrationUrl: (req.body.registrationUrl || '').trim(),
    capacity: Number.isFinite(Number(req.body.capacity)) ? Number(req.body.capacity) : null,
  };

  saveEvents(events);
  res.json(events[index]);
});

// Admin: delete event. Also clears any RSVPs tied to it so the mailing
// list doesn't accumulate reminders for a seminar that no longer exists.
router.delete('/:id', requireAuth, (req, res) => {
  const events = getEvents();
  const filtered = events.filter((event) => event.id !== req.params.id);
  if (filtered.length === events.length) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  saveEvents(filtered);

  const rsvps = getRsvps();
  const remainingRsvps = rsvps.filter((rsvp) => rsvp.eventId !== req.params.id);
  if (remainingRsvps.length !== rsvps.length) {
    saveRsvps(remainingRsvps);
  }

  res.json({ ok: true });
});

module.exports = router;
