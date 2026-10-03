const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getSubscribers, saveSubscribers } = require('../store');
const { requireAuth } = require('../middleware/requireAuth');
const hubspot = require('../hubspot');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts. Please try again later.' },
});

// Public: join the mailing list. Stores locally and forwards to HubSpot.
router.post('/', signupLimiter, async (req, res) => {
  const { email, firstName, lastName } = req.body || {};

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const subscribers = getSubscribers();

  let record = subscribers.find((s) => s.email === normalizedEmail);
  if (!record) {
    record = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      firstName: (firstName || '').trim(),
      lastName: (lastName || '').trim(),
      subscribedAt: new Date().toISOString(),
      hubspot: { synced: false, syncedAt: null, lastError: null },
    };
    subscribers.push(record);
  }

  try {
    const result = await hubspot.submitToHubspotForm({
      email: record.email,
      firstName: record.firstName,
      lastName: record.lastName,
      pageName: 'Peninsula Cyber newsletter signup',
    });
    if (!result.skipped) {
      record.hubspot = { synced: true, syncedAt: new Date().toISOString(), lastError: null };
    }
  } catch (err) {
    record.hubspot.lastError = err.message;
  }

  saveSubscribers(subscribers);
  res.status(201).json({ ok: true });
});

// Admin: list subscribers.
router.get('/', requireAuth, (req, res) => {
  const subscribers = [...getSubscribers()].sort((a, b) =>
    (b.subscribedAt || '').localeCompare(a.subscribedAt || '')
  );
  res.json(subscribers);
});

// Admin: export subscribers as CSV.
router.get('/export.csv', requireAuth, (req, res) => {
  const subscribers = getSubscribers();
  const header = 'email,firstName,lastName,subscribedAt,hubspotSynced\n';
  const rows = subscribers
    .map((s) => {
      const cells = [s.email, s.firstName, s.lastName, s.subscribedAt, s.hubspot?.synced ? 'yes' : 'no'];
      return cells
        .map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`)
        .join(',');
    })
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="peninsula-cyber-subscribers.csv"');
  res.send(header + rows + '\n');
});

// Admin: delete a subscriber (local list only; does not remove from HubSpot).
router.delete('/:id', requireAuth, (req, res) => {
  const subscribers = getSubscribers();
  const filtered = subscribers.filter((s) => s.id !== req.params.id);
  if (filtered.length === subscribers.length) {
    return res.status(404).json({ error: 'Subscriber not found.' });
  }
  saveSubscribers(filtered);
  res.json({ ok: true });
});

// Admin: (re)sync one subscriber to HubSpot via the Contacts API.
router.post('/:id/sync', requireAuth, async (req, res) => {
  const subscribers = getSubscribers();
  const record = subscribers.find((s) => s.id === req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'Subscriber not found.' });
  }

  try {
    const result = await hubspot.upsertContact({
      email: record.email,
      firstName: record.firstName,
      lastName: record.lastName,
    });
    if (result.skipped) {
      return res.status(503).json({ error: result.reason });
    }
    record.hubspot = { synced: true, syncedAt: new Date().toISOString(), lastError: null };
    saveSubscribers(subscribers);
    res.json(record);
  } catch (err) {
    record.hubspot.lastError = err.message;
    saveSubscribers(subscribers);
    res.status(502).json({ error: `Failed to sync with HubSpot: ${err.message}` });
  }
});

// Admin: sync every subscriber that isn't already synced.
router.post('/sync-all', requireAuth, async (req, res) => {
  const subscribers = getSubscribers();
  const results = { synced: 0, failed: 0 };

  for (const record of subscribers) {
    if (record.hubspot?.synced) continue;
    try {
      const result = await hubspot.upsertContact({
        email: record.email,
        firstName: record.firstName,
        lastName: record.lastName,
      });
      if (result.skipped) {
        return res.status(503).json({ error: result.reason });
      }
      record.hubspot = { synced: true, syncedAt: new Date().toISOString(), lastError: null };
      results.synced += 1;
    } catch (err) {
      record.hubspot.lastError = err.message;
      results.failed += 1;
    }
  }

  saveSubscribers(subscribers);
  res.json(results);
});

module.exports = router;
