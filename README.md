# Peninsula Cyber Website

A static community website for Peninsula Cyber, with a small Express backend that powers an admin panel for managing the events page and a HubSpot-linked mailing list.

## Structure

```
public/            Public site (plain HTML/CSS/JS) + admin panel (also static HTML)
  css/style.css     Site-wide styles, built from the Peninsula Cyber style guide
  js/               Shared client-side JS (nav, newsletter form, events rendering)
  admin/            Admin panel pages, CSS, and JS
server/
  index.js          Express app: static hosting, sessions, security headers
  routes/           auth.js, events.js, subscribers.js, rsvps.js (the API)
  data/             events.json, subscribers.json, rsvps.json — simple JSON file storage
  hubspot.js        HubSpot Forms API + Contacts API integration
  cognito.js        Verifies admin login credentials against an AWS Cognito User Pool
```

There's no build step — the public pages are plain HTML files served directly by Express, and the "database" is a few JSON files on disk. That's intentional: this is a low-traffic community nonprofit site, and a full database/framework would be more to maintain than the content justifies. If the site outgrows this, the natural next step is swapping `server/store.js` for a real database without touching the routes' public API.

## Setup

Requires Node.js 18+ (for the built-in `fetch` used to call HubSpot).

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `SESSION_SECRET` — any long random string.
- `COGNITO_REGION` / `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID` — see "Admin authentication (AWS Cognito)" below. Without these, `/admin/login.html` will reject every login attempt with a clear "Cognito is not configured" error, but the rest of the site works fine.
- HubSpot variables — see below. The site runs fine without them; signups are just stored locally until HubSpot is configured.

Run it:

```bash
npm start
```

Then visit `http://localhost:3000`. The admin panel is at `http://localhost:3000/admin/login.html`.

## Connecting HubSpot

Two separate integrations, both optional but recommended together:

1. **Public newsletter signup → HubSpot Forms API** (`HUBSPOT_PORTAL_ID`, `HUBSPOT_FORM_ID`)
   - In HubSpot, create a form under **Marketing > Forms** with an `email`, `firstname`, and `lastname` field (firstname/lastname optional).
   - Open the form and find its **Form ID** (in the embed code or the form's settings URL).
   - Find your **Portal ID (Hub ID)** under **Settings > Account Setup > Account Defaults**.
   - Every signup on `/contact.html` is submitted to this form automatically, so it shows up in HubSpot with whatever workflows/lists you've attached to that form.

2. **Admin panel sync → HubSpot Contacts API** (`HUBSPOT_PRIVATE_APP_TOKEN`)
   - In HubSpot, go to **Settings > Integrations > Private Apps > Create a private app**.
   - Grant the `crm.objects.contacts.read` and `crm.objects.contacts.write` scopes.
   - Copy the generated token into `.env`.
   - This powers the "Sync" / "Sync all to HubSpot" buttons on the admin Mailing List page, which create or update contacts directly — useful for backfilling subscribers who signed up before HubSpot was connected, or if a form submission failed.

Every subscriber is always saved locally first, regardless of HubSpot configuration, so no signups are lost if HubSpot is briefly unreachable or not yet set up.

## Admin authentication (AWS Cognito)

The admin panel (`/admin/*`) is the only part of this site with a login — the public pages have no visitor accounts. Admin credentials are verified against an AWS Cognito User Pool instead of a local password, so you get Cognito's password policies, per-user accounts, and audit trail without building any of that yourself.

**One-time setup:**

1. **Create a User Pool** — AWS Console → Cognito → *Create user pool*.
   - Sign-in options: username (email is fine too, just be consistent with what you type into the admin login form).
   - Password policy: use the default (or stricter) — Cognito enforces it, not this app.
   - MFA: optional, off by default. You can turn it on later; this app doesn't currently handle an MFA challenge, so leave it off unless you're ready to extend `server/cognito.js` to respond to it.
2. **Create an App Client** under that pool (Console → your pool → *App integration* → *App clients* → *Create app client*).
   - Client type: leave it as a standard client. A client secret is optional — either works, just set `COGNITO_CLIENT_SECRET` in `.env` if you generate one.
   - **Authentication flows**: check **"ALLOW_ADMIN_USER_PASSWORD_AUTH"**. This app calls `AdminInitiateAuth` server-side, which requires this flow to be explicitly enabled — login will fail with `NotAuthorizedException` if it isn't.
3. **Create an admin user** (Console → your pool → *Users* → *Create user*, or via CLI):
   ```bash
   aws cognito-idp admin-create-user \
     --user-pool-id <USER_POOL_ID> \
     --username admin \
     --user-attributes Name=email,Value=you@example.com \
     --temporary-password "TempPass123!" \
     --message-action SUPPRESS
   ```
   Immediately set a **permanent** password so the account doesn't get stuck on Cognito's forced-reset challenge (this app doesn't implement that challenge flow):
   ```bash
   aws cognito-idp admin-set-user-password \
     --user-pool-id <USER_POOL_ID> \
     --username admin \
     --password "YourRealPassword123!" \
     --permanent
   ```
   Repeat step 3 for each staff member who needs admin access — every confirmed user in the pool can log in, there's no separate roles/groups concept in this app.
4. Fill in `.env`: `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` (and `COGNITO_CLIENT_SECRET` if your app client has one).

**How it works:** `POST /api/auth/login` calls Cognito's `AdminInitiateAuth` with the typed username/password. Cognito either confirms the credentials or rejects them — this app never sees or stores the password. On success, the app starts its own `express-session` exactly as before; Cognito isn't consulted again for the rest of that session. This means revoking access means disabling/deleting the user in Cognito, but any session that user already has open stays valid until it expires or they log out (sessions are short-lived — 4 hours, see `server/index.js`).

**Why `AdminInitiateAuth` and not the public `InitiateAuth`:** `AdminInitiateAuth` is the flow AWS designed for a trusted backend to verify a user's password on their behalf, and it's IAM-authorized rather than just client-ID-authorized. That means whatever compute is running this app (see the deployment guide) needs an IAM policy granting `cognito-idp:AdminInitiateAuth` on the user pool — that's covered in [DEPLOYMENT.md](DEPLOYMENT.md).

## Managing events

Admin > Events lets you add, edit, and delete seminars. Each event needs at minimum a title and date; time, location, description, registration link, and capacity are optional. Saved events immediately appear on the public Events page and the homepage's "upcoming seminars" preview (both only show events with a date today or later).

## Security notes

This is a lightweight admin panel appropriate for a small nonprofit site, not a multi-admin enterprise CMS. Before exposing it on the public internet:

- Run it behind HTTPS (set `NODE_ENV=production` so session cookies require `secure`).
- Keep `.env` out of version control (already covered by `.gitignore`).
- The login endpoint is rate-limited (10 attempts / 15 minutes) to slow down brute-forcing, but consider adding a hosting-level firewall/allowlist too if this is only ever used by one or two staff.
- Sessions are in-memory (Express's default store) and the JSON files in `server/data/` live on local disk — both assume a **single, always-on instance**. This is fine for the traffic this site expects (see [DEPLOYMENT.md](DEPLOYMENT.md), which deploys exactly that), but don't point a load balancer at multiple instances of this app without first moving sessions to a shared store and `server/data/` to a real database — otherwise different requests will randomly see different logged-in states and different event/subscriber data.
