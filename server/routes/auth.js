const express = require('express');
const rateLimit = require('express-rate-limit');
const cognito = require('../cognito');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  let result;
  try {
    result = await cognito.verifyCredentials(username.trim(), password);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not start session.' });
    }
    req.session.isAdmin = true;
    req.session.username = result.username;
    res.json({ ok: true });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/session', (req, res) => {
  res.json({ isAdmin: Boolean(req.session && req.session.isAdmin) });
});

module.exports = router;
