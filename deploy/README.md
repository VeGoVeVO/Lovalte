# Deploying Lovalte to a DigitalOcean Droplet (Docker + Caddy)

Cheapest viable production: **one $4/mo 512 MB droplet** running everything behind
**Caddy** (free automatic HTTPS), Postgres + Redis as memory-tuned containers.

## Will 512 MB really hold? Yes — with one rule: don't build on the droplet.
Your Render 512 MB only ran the *app* — Postgres/Redis were separate managed
services and builds ran on Render's machines. Here, one box runs Caddy + Node +
Postgres + Redis. The thing that breaks 512 MB is **building** (Vite/tsc need
~1 GB). So we **build images in GitHub Actions** (free, lots of RAM) and the
droplet only **pulls** them. At runtime the tuned stack idles ~300–400 MB and we
add 2 GB swap — comfortable for launch/low-moderate traffic.

| | $4/mo · 512 MB | $6/mo · 1 GB |
|---|---|---|
| Runtime | fine with swap + tuning | roomy |
| Headroom under load spikes | thin (dips into swap) | comfortable |
| Recommendation | great to start; **resize to 1 GB in one click** if you see swap thrashing | stress-free |

Stay on 512 MB. Resizing up later is a 1-minute reboot, no rebuild.

---

## Exactly what to pick on the "Create Droplet" page
- **Region:** the one closest to most customers (e.g. New York, Amsterdam, Frankfurt, Bangalore).
- **Datacenter / VPC:** leave defaults.
- **Choose an image → OS:** **Ubuntu 24.04 (LTS) x64**.
- **Choose Size → Shared CPU → Basic**, CPU type **Regular (SSD)**, the
  **$4/mo · 1 vCPU / 512 MB / 10 GB** option (`s-1vcpu-512mb-10gb`).
- **Choose Authentication Method:** **SSH Key** → add your key. (Never "Password".)
- **Improved metrics monitoring (free):** **enable** — on a tight box you want to
  watch memory/swap. (~15 MB; worth it.)
- **Backups:** **leave OFF** (we do free DB backups via `deploy/backup.sh` + off-site).
- **Block storage / extra volumes:** none.
- **Advanced / user-data:** leave empty.
- **Hostname:** `lovalte`. Quantity: 1.

Click **Create Droplet**, note the public IP.

## 0. Before you start
- This repo pushed to GitHub (you'll build images there).
- Apple Wallet certs (PEM): `signerCert.pem`, `signerKey.pem`, `wwdr.pem`.
- An SSH key (`ssh-keygen -t ed25519` if needed).
- A cheap domain (~$10/yr, Porkbun/Cloudflare). Apple Wallet needs a real HTTPS domain.

## 1. DNS
Registrar → add an **A record**: `app.yourdomain.com → <droplet-ip>` (TTL 300).
Verify: `nslookup app.yourdomain.com`.

## 2. Harden the droplet (one time)
```bash
ssh root@<droplet-ip> 'bash -s' < deploy/provision.sh
```
Installs Docker, creates the `deploy` user, locks SSH to keys, firewall (22/80/443),
fail2ban, auto-updates, **2 GB swap**. Then in a NEW terminal confirm:
```bash
ssh deploy@<droplet-ip>
```

## 3. Code + secrets on the droplet (as `deploy`)
```bash
git clone https://github.com/<you>/Lovalte.git && cd Lovalte
mkdir -p secrets/certs && chmod 700 secrets
# from your machine: scp signerCert.pem signerKey.pem wwdr.pem deploy@<ip>:~/Lovalte/secrets/certs/
cp deploy/env.production.sample .env.production && chmod 600 .env.production
nano .env.production   # set API_IMAGE/WEB_IMAGE (ghcr.io/<you>/...), DOMAIN, secrets, Apple ids
```
Generate secrets:
```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 48   # QR_TOKEN_SECRET
openssl rand -base64 24   # POSTGRES_PASSWORD (also paste into DATABASE_URL)
```

## 4. Build the images in CI (so the droplet can pull them)
The GitHub Actions workflow builds + pushes to GHCR. Add these repo secrets
(**Settings → Secrets and variables → Actions**):

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | droplet IP |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | a private key whose public half is in the droplet's `~/.ssh/authorized_keys` |
| `APP_DIR` | `/home/deploy/Lovalte` |

Then push to `main` (or run the workflow manually). It builds `lovalte-api` and
`lovalte-web` and pushes them to `ghcr.io/<you>/...`.

Dedicated CI key (run on the droplet):
```bash
ssh-keygen -t ed25519 -f ~/.ssh/ci -N "" && cat ~/.ssh/ci.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/ci   # paste into DEPLOY_SSH_KEY, then shred ~/.ssh/ci
```

## 5. Let the droplet pull from GHCR (one time)
GHCR images are private by default. On the droplet, log in with a GitHub
Personal Access Token (classic) that has **`read:packages`**:
```bash
echo "<YOUR_PAT>" | docker login ghcr.io -u <you> --password-stdin
```
(Or make the two packages public on GitHub → no login needed.)

## 6. First deploy
```bash
bash deploy/deploy.sh    # pulls images, runs migrations, starts everything
```
Caddy auto-issues the Let's Encrypt cert (needs DNS resolving + ports 80/443 open).
Verify:
```bash
curl -I https://app.yourdomain.com
docker compose -f docker-compose.prod.yml --env-file .env.production ps
free -h    # check RAM/swap headroom
```
Open the site → sign up → build a card → issue → the enrollment QR points at your
real HTTPS domain. After this, every push to `main` auto-builds + deploys.

## 7. Backups (don't skip)
```bash
crontab -e
0 3 * * * /home/deploy/Lovalte/deploy/backup.sh >> /home/deploy/backup.log 2>&1
```
**Off-site copy recommended** — uncomment the `rclone` line in `deploy/backup.sh`
and point it at a DigitalOcean Space ($5/mo) so a lost droplet ≠ lost data.

## Apple Wallet
- `WALLET_WEB_SERVICE_URL=https://app.yourdomain.com/wallet/` (HTTPS, trailing slash).
- `APPLE_PASS_TYPE_ID` + certs must match your Apple Developer Pass Type ID.

---

## Security checklist (handled)
- [x] SSH key-only, root + password login disabled; UFW 22/80/443; fail2ban; auto updates
- [x] Postgres/Redis internal-only (never published to host); Redis RAM-capped
- [x] Non-root containers; prod-only deps; secrets chmod 600 + certs read-only
- [x] TLS + HSTS/CSP/nosniff/frame-deny; app rate-limiting + `trustProxy`
- [x] No build on prod (no build-time RAM spikes / toolchain on the box)

## Day-2 ops
```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.production"
$C logs -f api      # logs      |  $C ps        # status
$C restart api      # restart   |  free -h / htop  # memory + swap
bash deploy/deploy.sh   # pull + migrate + restart
```

## Troubleshooting
- **A container got OOM-killed / swap thrashing:** resize the droplet to 1 GB
  (Power off → Resize → "CPU and RAM only" → 1 GB → Power on). No rebuild needed.
- **`docker pull` denied:** run the `docker login ghcr.io` from step 5 (PAT needs `read:packages`).
- **No TLS cert:** DNS must resolve to the droplet and 80/443 be open before first boot; `$C logs caddy`.
- **DB refused:** `DATABASE_URL` host must be `postgres` and its password match `POSTGRES_PASSWORD`.
