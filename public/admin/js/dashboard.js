async function loadDashboard() {
  try {
    const [eventsRes, subsRes, rsvpsRes] = await Promise.all([
      fetch('/api/events?upcoming=true'),
      fetch('/api/subscribers'),
      fetch('/api/rsvps'),
    ]);
    const events = await eventsRes.json();
    const subscribers = await subsRes.json();
    const rsvps = await rsvpsRes.json();

    document.getElementById('stat-upcoming-events').textContent = events.length;
    document.getElementById('stat-subscribers').textContent = subscribers.length;
    document.getElementById('stat-synced').textContent = subscribers.filter((s) => s.hubspot?.synced).length;
    document.getElementById('stat-rsvps').textContent = rsvps.length;
  } catch (err) {
    console.error('Failed to load dashboard stats', err);
  }
}

loadDashboard();
