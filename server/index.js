require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const subscriberRoutes = require('./routes/subscribers');
const rsvpRoutes = require('./routes/rsvps');
const { requirePageAuth } = require('./middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        // Helmet adds this by default. Over plain HTTP (e.g. testing on a
        // bare server IP before TLS is set up) it makes browsers rewrite every
        // CSS/JS/image request to https:// and fail, leaving an unstyled page.
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: 'peninsulacyber.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 4, // 4 hours
    },
  })
);

// Gate every top-level admin *page* except login.html before the static
// handler serves it. Deliberately excludes /admin/css/* and /admin/js/*
// so the login page's own styles and script still load when logged out.
app.get(/^\/admin\/(?!login\.html$)[^/]+\.html$/, requirePageAuth);

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/rsvps', rsvpRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Peninsula Cyber site running at http://localhost:${PORT}`);
});
