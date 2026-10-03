const fs = require('fs');
const path = require('path');

const EVENTS_FILE = path.join(__dirname, 'data', 'events.json');
const SUBSCRIBERS_FILE = path.join(__dirname, 'data', 'subscribers.json');
const RSVPS_FILE = path.join(__dirname, 'data', 'rsvps.json');

function readJson(file) {
  const raw = fs.readFileSync(file, 'utf-8');
  return JSON.parse(raw);
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function getEvents() {
  return readJson(EVENTS_FILE);
}

function saveEvents(events) {
  writeJson(EVENTS_FILE, events);
}

function getSubscribers() {
  return readJson(SUBSCRIBERS_FILE);
}

function saveSubscribers(subscribers) {
  writeJson(SUBSCRIBERS_FILE, subscribers);
}

function getRsvps() {
  return readJson(RSVPS_FILE);
}

function saveRsvps(rsvps) {
  writeJson(RSVPS_FILE, rsvps);
}

module.exports = {
  getEvents,
  saveEvents,
  getSubscribers,
  saveSubscribers,
  getRsvps,
  saveRsvps,
};
