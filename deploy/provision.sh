#!/usr/bin/env bash
# One-time hardening + Docker install for a fresh Ubuntu 24.04 DigitalOcean droplet.
# Run as root:  ssh root@DROPLET_IP 'bash -s' < deploy/provision.sh
# Or copy it up and:  sudo bash provision.sh
#
# IMPORTANT: this disables SSH password login and root SSH login. Your droplet
# MUST already have your SSH public key (DigitalOcean adds it at create time).
# After it finishes, open a NEW terminal and confirm `ssh deploy@DROPLET_IP`
# works BEFORE closing this session.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"

echo "==> Updating system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades

echo "==> Creating sudo user '$DEPLOY_USER'"
if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  # Passwordless sudo so the GitHub Actions deploy can run non-interactively.
  echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
  chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"
fi
# Give the deploy user the same SSH keys root has.
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [ -f /root/.ssh/authorized_keys ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

echo "==> Hardening SSH (key-only, no root login)"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd

echo "==> Firewall (allow SSH + HTTP + HTTPS only)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> fail2ban (brute-force protection on SSH)"
systemctl enable --now fail2ban

echo "==> Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades || true
systemctl enable --now unattended-upgrades || true

echo "==> Adding 2G swap (prevents OOM when building images on small droplets)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Installing Docker Engine + Compose plugin"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "$DEPLOY_USER"
systemctl enable --now docker

echo "==> Done."
echo "Now, in a NEW terminal, verify:  ssh $DEPLOY_USER@<this-droplet-ip>"
echo "Then continue the deploy steps in deploy/README.md as '$DEPLOY_USER'."
