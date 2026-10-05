const fs = require('fs');
const path = require('path');
// Built into Node 22+, so there's no native module to compile or install.
// (Node 22 prints a one-line "experimental" warning; the npm scripts silence it.)
const { DatabaseSync } = require('node:sqlite');

// Must be required after dotenv has loaded (server/index.js does this).
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'peninsula.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
// SQLite ignores foreign keys unless this is switched on per connection.
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    date             TEXT NOT NULL,              -- YYYY-MM-DD
    time             TEXT NOT NULL DEFAULT '',
    location         TEXT NOT NULL DEFAULT '',
    description      TEXT NOT NULL DEFAULT '',
    registration_url TEXT NOT NULL DEFAULT '',
    capacity         INTEGER
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    first_name    TEXT NOT NULL DEFAULT '',
    last_name     TEXT NOT NULL DEFAULT '',
    subscribed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rsvps (
    id         TEXT PRIMARY KEY,
    event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL COLLATE NOCASE,
    rsvped_at  TEXT NOT NULL,
    UNIQUE (event_id, email)
  );

  CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
  CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
`);

// Row -> API shape. The JSON API keeps the camelCase field names the
// front end already uses, so storage can change without touching the UI.
const toEvent = (row) => ({
  id: row.id,
  title: row.title,
  date: row.date,
  time: row.time,
  location: row.location,
  description: row.description,
  registrationUrl: row.registration_url,
  capacity: row.capacity,
});

const toSubscriber = (row) => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  subscribedAt: row.subscribed_at,
});

const toRsvp = (row) => ({
  id: row.id,
  eventId: row.event_id,
  name: row.name,
  email: row.email,
  rsvpedAt: row.rsvped_at,
});

module.exports = { db, toEvent, toSubscriber, toRsvp, DB_PATH };
