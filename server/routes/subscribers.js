const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db, toSubscriber } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');
const { toCsv } = require('../csv');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_NAME = 100;

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts. Please try again later.' },
});

// Signing up twice with the same address (any capitalisation) is a quiet no-op.
const insertSubscriber = db.prepare(`
  INSERT INTO subscribers (id, email, first_name, last_name, subscribed_at)
  VALUES (@id, @email, @first_name, @last_name, @subscribed_at)
  ON CONFLICT(email) DO NOTHING
`);
const selectAll = db.prepare('SELECT * FROM subscribers ORDER BY subscribed_at DESC');
const deleteSubscriber = db.prepare('DELETE FROM subscribers WHERE id = ?');

const clean = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '');

// Public: join the mailing list.
router.post('/', signupLimiter, (req, res) => {
  const { email, firstName, lastName } = req.body || {};

  if (typeof email !== 'string' || email.trim().length > MAX_EMAIL || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  insertSubscriber.run({
    id: crypto.randomUUID(),
    email: email.trim().toLowerCase(),
    first_name: clean(firstName),
    last_name: clean(lastName),
    subscribed_at: new Date().toISOString(),
  });

  // Same response whether or not the address was already on the list, so the
  // form can't be used to find out who is subscribed.
  res.status(201).json({ ok: true });
});

// Admin: list subscribers.
router.get('/', requireAuth, (req, res) => {
  res.json(selectAll.all().map(toSubscriber));
});

// Admin: export subscribers as CSV.
router.get('/export.csv', requireAuth, (req, res) => {
  const rows = selectAll.all().map((s) => [s.email, s.first_name, s.last_name, s.subscribed_at]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="peninsula-cyber-subscribers.csv"');
  res.send(toCsv(['email', 'firstName', 'lastName', 'subscribedAt'], rows));
});

// Admin: remove a subscriber.
router.delete('/:id', requireAuth, (req, res) => {
  const { changes } = deleteSubscriber.run(req.params.id);
  if (!changes) {
    return res.status(404).json({ error: 'Subscriber not found.' });
  }
  res.json({ ok: true });
});

module.exports = router;
