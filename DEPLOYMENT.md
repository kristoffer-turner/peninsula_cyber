# Deploying to AWS

This guide deploys the site to a single **AWS Lightsail** instance running Node directly, behind Nginx for TLS. That choice is deliberate, not arbitrary — read why before you deviate from it.

## Why Lightsail, and not App Runner / ECS / Lambda

This app stores events, subscribers, and RSVPs as JSON files on local disk (`server/data/`), and keeps admin sessions in the Node process's memory. Both of those assumptions **require the app to run as one long-lived process on one instance with a persistent disk.**

Serverless and container platforms (Lambda, App Runner, Fargate) either wipe local disk between requests/deploys or run multiple instances behind a load balancer — either way, your event/subscriber data and logged-in sessions would silently disappear or become inconsistent. Using one of those platforms *correctly* would mean first migrating `server/store.js` to a real database (e.g., DynamoDB) and sessions to a shared store (e.g., DynamoDB or ElastiCache) — real work, and out of scope for "host this site."

A single Lightsail instance matches what this app actually is: a low-traffic community site that doesn't need to scale horizontally. You get a persistent disk, a static IP, snapshots for backup, and a predictable ~$5–10/month bill. If Peninsula Cyber ever outgrows this (multiple redundant instances, real traffic spikes), that's the point to migrate storage and revisit hosting — not before.

## What you'll end up with

```
Browser → Route 53 (DNS) → Lightsail static IP → Nginx (:443, TLS) → Node/Express (:3000, localhost only)
                                                                            ↓
                                                                   AWS Cognito (admin login only)
```

## Prerequisites

- An AWS account with billing set up.
- The [AWS CLI](https://aws.amazon.com/cli/) installed and configured (`aws configure`) on your own machine — used for a couple of one-off commands, not required on the server itself.
- A domain name you control (for DNS + HTTPS). You can skip DNS/TLS and use the Lightsail-assigned IP over plain HTTP for initial testing, but don't run the real site that way — see "Force HTTPS" below.
- The Cognito User Pool from [README.md](README.md#admin-authentication-aws-cognito) already created, with its User Pool ID and App Client ID in hand.
- Your own HubSpot values, if you're connecting that (optional — see README).

---

## 1. Create the Lightsail instance

1. AWS Console → **Lightsail** → **Create instance**.
2. Platform: **Linux/Unix**. Blueprint: **OS Only → Ubuntu 22.04 LTS**.
3. Instance plan: the **$5/month** plan (512 MB–1 GB RAM) is plenty for this app's traffic. Go up a tier only if you notice the Node process struggling.
4. Name it something like `peninsula-cyber-web`, and create it.
5. Once it's running, go to the instance → **Networking** tab → click **Create static IP**, attach it to this instance. Without this, the instance's public IP changes if it's ever stopped/restarted, breaking DNS.
6. Still on **Networking**, confirm the firewall (IPv4 Firewall) allows:
   - SSH (22) — restrict "Restrict to IP address" to your own IP if you can, instead of leaving it open to the world.
   - HTTP (80) and HTTPS (443) — leave these open to anyone (0.0.0.0/0), that's the public site.
   - Do **not** open port 3000 publicly — Node only ever needs to be reached by Nginx on the same machine (`localhost:3000`).

## 2. Create IAM credentials for Cognito

The app calls Cognito's `AdminInitiateAuth` to verify admin logins, which is an IAM-authorized action (unlike a normal user-facing Cognito login, this one requires AWS credentials, not just a client ID). Unlike EC2, plain Lightsail VM instances don't support attaching an IAM instance profile — so the straightforward, correct approach here is a dedicated IAM user scoped to exactly this one permission.

1. IAM Console → **Policies** → **Create policy** → JSON tab, paste (replace the placeholders):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": [
         "cognito-idp:AdminInitiateAuth",
         "cognito-idp:AdminRespondToAuthChallenge"
       ],
       "Resource": "arn:aws:cognito-idp:<REGION>:<ACCOUNT_ID>:userpool/<USER_POOL_ID>"
     }]
   }
   ```
   Name it `peninsula-cyber-cognito-auth`.
2. IAM Console → **Users** → **Create user** → name it `peninsula-cyber-server` → don't grant console access → attach the policy you just created directly.
3. Open the new user → **Security credentials** tab → **Create access key** → choose **Third-party service** as the use case → copy the **Access key ID** and **Secret access key** immediately (the secret is shown only once).
4. You'll put these in the server's `.env` in step 5 as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` — the AWS SDK picks them up automatically; no code changes needed. Treat them like any other secret: never commit them, and rotate the access key if it's ever exposed.

## 3. Install Node and Nginx on the instance

SSH in (Lightsail's browser-based SSH button works, or `ssh -i your-key.pem ubuntu@<static-ip>`), then:

```bash
sudo apt update && sudo apt upgrade -y

# Node 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Nginx (reverse proxy + TLS termination) and Certbot (free TLS certs)
sudo apt install -y nginx certbot python3-certbot-nginx

# pm2 (keeps Node running, restarts it on crash or reboot)
sudo npm install -g pm2

node --version   # confirm v20.x
```

## 4. Get the code onto the instance

**If you're using GitHub** (recommended — makes future updates a `git pull`):

```bash
# on your own machine, one-time:
cd /path/to/peninsula_cyber
git init
git add .
git commit -m "Initial commit"
# create an empty repo on GitHub, then:
git remote add origin https://github.com/<your-org>/peninsula-cyber.git
git push -u origin main
```

```bash
# on the Lightsail instance:
git clone https://github.com/<your-org>/peninsula-cyber.git
cd peninsula-cyber
```

**If you'd rather not use GitHub**, copy the folder directly from your machine (run this from Windows PowerShell, adjusting the key path):

```powershell
scp -i your-key.pem -r C:\Users\Kristoffer\Documents\code\peninsula_cyber ubuntu@<static-ip>:~/peninsula-cyber
```

Either way, **do not** copy your local `.env` or `node_modules` — `.env` holds secrets you'll set fresh on the server (see next step), and `node_modules` should be reinstalled on the server's own architecture:

```bash
cd ~/peninsula-cyber
npm install --omit=dev
```

## 5. Configure environment variables

```bash
cd ~/peninsula-cyber
cp .env.example .env
nano .env
```

Fill in:
- `SESSION_SECRET` — generate a fresh one just for production: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `NODE_ENV=production` — this makes session cookies require HTTPS (`secure: true` in `server/index.js`), which only works once TLS is set up in step 8. Until then, leave it as `development` for initial testing over plain HTTP, then flip it once HTTPS is live.
- `PORT=3000`
- `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET` (if applicable) — from your Cognito setup.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — the access key pair from step 2.
- HubSpot variables, if connecting that.

`.env` is already in `.gitignore`, so it's never committed — you set it independently on every environment.

## 6. Run the app with pm2

```bash
cd ~/peninsula-cyber
pm2 start server/index.js --name peninsula-cyber
pm2 save
pm2 startup    # prints a command — copy/paste and run it, so pm2 restarts on reboot
```

Verify it's up locally on the instance:

```bash
curl -I http://localhost:3000/index.html   # expect HTTP/1.1 200 OK
```

## 7. Configure Nginx as a reverse proxy

```bash
sudo nano /etc/nginx/sites-available/peninsula-cyber
```

```nginx
server {
    listen 80;
    server_name peninsulacyber.org www.peninsulacyber.org;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Replace `peninsulacyber.org` with your real domain, then enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/peninsula-cyber /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t     # should say "syntax is ok" / "test is successful"
sudo systemctl reload nginx
```

`server/index.js` already sets `app.set('trust proxy', 1)`, so Express correctly reads the client's real IP from `X-Forwarded-For` (this matters for the login rate limiter) once it's sitting behind Nginx.

## 8. Point your domain at the instance

In your DNS provider (Route 53 or wherever the domain is registered):
- **A record**: `peninsulacyber.org` → the Lightsail static IP.
- **A record** (or CNAME): `www.peninsulacyber.org` → the same static IP (or `peninsulacyber.org`).

DNS propagation can take a few minutes to a few hours. Confirm it's resolved before moving on:

```bash
dig +short peninsulacyber.org
```

## 9. Enable HTTPS (Let's Encrypt)

Once DNS resolves to the instance:

```bash
sudo certbot --nginx -d peninsulacyber.org -d www.peninsulacyber.org
```

Certbot edits the Nginx config to add the certificate and a redirect from HTTP → HTTPS, and sets up automatic renewal (a systemd timer runs twice daily; certs auto-renew ~30 days before expiry, no action needed from you).

Now go back and set `NODE_ENV=production` in `.env` if you hadn't already, then restart the app so the secure-cookie setting takes effect:

```bash
pm2 restart peninsula-cyber
```

## 10. Verify everything end-to-end

- Visit `https://peninsulacyber.org` — the public site should load over HTTPS with a valid certificate.
- Visit `https://peninsulacyber.org/admin/login.html` and log in with a Cognito user you created per the README — confirm the dashboard loads.
- Submit the newsletter form on `/contact.html` and confirm it appears under Admin → Mailing List.
- Add a test event under Admin → Events and confirm it shows up on the public Events page.

---

## Updating the site after the first deploy

```bash
ssh ubuntu@<static-ip>
cd ~/peninsula-cyber
git pull                      # or re-upload via scp if not using git
npm install --omit=dev        # only needed if package.json changed
pm2 restart peninsula-cyber
```

## Backups

Everything that matters and isn't already safe elsewhere lives in `server/data/*.json` on this one instance's disk:

- **Lightsail automatic snapshots**: instance page → **Snapshots** tab → enable automatic daily snapshots. This is the simplest safety net — it backs up the whole disk, not just the data files.
- **Lighter-weight option**: cron a copy of `server/data/` to S3:
  ```bash
  # crontab -e
  0 3 * * * aws s3 sync ~/peninsula-cyber/server/data s3://your-backup-bucket/peninsula-cyber-data/
  ```
  (Requires the AWS CLI installed on the instance and either the same IAM role extended with `s3:PutObject` on that bucket, or separate credentials.)

## Cost estimate

| Item | Cost |
|---|---|
| Lightsail instance ($5/mo tier) | ~$5/month |
| Static IP (free while attached to a running instance) | $0 |
| Let's Encrypt TLS certificate | $0 |
| Cognito User Pool (a handful of admin users) | $0 — free tier covers far more than a few staff accounts |
| Route 53 hosted zone (if you move DNS there) | ~$0.50/month + your domain registration |

Realistically **~$5–6/month** all-in, not counting the domain registration itself.

## Troubleshooting

- **Page loads but has no styling, no events, and the nav menu/forms don't work**: you're viewing the site over plain `http://` with `NODE_ENV=production`. In production the app sends a `Content-Security-Policy: upgrade-insecure-requests` header, which tells the browser to fetch the CSS/JS/images over `https://` — that fails until TLS is set up in step 9. Fix it by either finishing step 9 and browsing the `https://` URL, or temporarily setting `NODE_ENV=development` in `.env` and running `pm2 restart peninsula-cyber --update-env`. (Check the browser's DevTools console/network tab — you'll see the CSS and JS requests failing with `ERR_SSL_PROTOCOL_ERROR` or `ERR_CONNECTION_REFUSED` against an `https://` address.) Switch back to `production` once HTTPS works.
- **502 Bad Gateway from Nginx**: the Node app isn't running or isn't listening on port 3000. Check `pm2 status` and `pm2 logs peninsula-cyber`.
- **Admin login fails with "Cognito is not configured on the server"**: one of `COGNITO_REGION` / `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID` is missing from `.env` on the server (not your local machine).
- **Admin login fails with "Cognito authentication failed: Could not load credentials from any providers"**: the AWS SDK can't find any AWS credentials at all. Confirm `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are actually set in the server's `.env` (step 2), then `pm2 restart peninsula-cyber` — env vars are only read at process start.
- **Admin login fails with `NotAuthorizedException`**: either the password is wrong, or the App Client doesn't have `ALLOW_ADMIN_USER_PASSWORD_AUTH` enabled (see README step 2), or the instance's IAM role/credentials don't grant `cognito-idp:AdminInitiateAuth`.
- **Certbot fails to get a certificate**: almost always DNS hasn't propagated yet, or port 80 isn't reachable (check the Lightsail firewall). Run `dig +short yourdomain.org` and confirm it matches the static IP before retrying.
- **Changes to `server/data/*.json` disappear after a redeploy**: if you're re-copying the whole project directory (via `scp -r` or a fresh `git clone` into a new folder) instead of updating in place, you'll overwrite the live data files with the ones from your local machine. Always update in place (`git pull` inside the existing `~/peninsula-cyber` checkout), never redeploy by replacing the whole directory.
