# Lovalte — Deployment Facts (for future sessions)

Non-secret infra coordinates. Secrets live ONLY in `.env.production` on the
droplet (gitignored) — never here.

| What | Value |
|---|---|
| **Droplet IP** | `164.92.243.43` |
| **Provider** | DigitalOcean Droplet, Ubuntu 24.04, 1 vCPU / 1 GB ($6/mo) |
| **Domain** | `lovalte.com` |
| **Registrar / DNS** | Hostinger (manage DNS in hPanel → Domains → DNS Zone) |
| **App URL** | `https://lovalte.com` |
| **GitHub owner** | `vegovevo` |
| **API image** | `ghcr.io/vegovevo/lovalte-api:latest` |
| **Web image** | `ghcr.io/vegovevo/lovalte-web:latest` |
| **SSH (initial)** | `ssh root@164.92.243.43` |
| **SSH (after provision)** | `ssh deploy@164.92.243.43` |
| **App dir on droplet** | `/home/deploy/Lovalte` |
| **Local SSH key** | `~/.ssh/id_ed25519` (public half added to the droplet) |

## DNS to set in Hostinger (hPanel → DNS Zone)
- `A` · name `@` · value `164.92.243.43` · TTL 300   (the apex `lovalte.com`)
- `A` · name `www` · value `164.92.243.43` · TTL 300  (optional; or CNAME www → lovalte.com)
- Remove any existing parking `A`/`AAAA` records that point elsewhere.

## Deploy flow (see deploy/README.md for the full runbook)
1. Harden: `ssh root@164.92.243.43 'bash -s' < deploy/provision.sh`
2. On droplet as `deploy`: clone repo, add Apple certs to `secrets/certs/`, fill `.env.production`.
3. Images build in GitHub Actions → GHCR; droplet pulls via `bash deploy/deploy.sh`.
4. GitHub repo secrets for auto-deploy: `DEPLOY_HOST=164.92.243.43`, `DEPLOY_USER=deploy`,
   `DEPLOY_SSH_KEY=<droplet ci private key>`, `APP_DIR=/home/deploy/Lovalte`.
