#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu/Debian server (written for Oracle Cloud's
# free VMs, works on any VPS): installs Docker, opens the web ports in the
# server's own firewall, adds swap on small machines, creates the .env with
# fresh random secrets, and starts the platform.
#
#   bash deploy/setup-oracle.sh [your.domain.com]
#
# Safe to run again: it never overwrites an existing .env.
set -euo pipefail

DOMAIN="${1:-}"
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "run as your normal user (e.g. ubuntu), not root — it uses sudo itself"
command -v apt-get >/dev/null || die "this script supports Ubuntu/Debian (apt) only"
# `sudo -v` insists on a password even where passwordless sudo is configured
# (cloud images: AWS, Oracle…), which silently killed unattended first-boot
# runs. Try a passwordless command first; only fall back to prompting.
sudo -n true 2>/dev/null || sudo -v || die "sudo is required"

# ---------------------------------------------------------------- packages
say "Installing base packages (security updates, fail2ban, firewall persistence)"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git openssl fail2ban unattended-upgrades iptables-persistent
# fail2ban's default sshd jail slows down SSH password guessing;
# unattended-upgrades installs security patches automatically.

# ------------------------------------------------------------------ Docker
if ! command -v docker >/dev/null; then
  say "Installing Docker (official installer)"
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo systemctl enable --now docker
if ! id -nG "$USER" | grep -qw docker; then
  sudo usermod -aG docker "$USER"
  echo "(added $USER to the docker group — takes effect at your next login; this script keeps using sudo)"
fi

# ---------------------------------------------------------------- firewall
# Oracle's Ubuntu images ship with iptables rules that REJECT everything but
# SSH, ahead of any rule we append — so insert ours at the top. (You must ALSO
# open ports 80/443 in the cloud console's security list; see the guide.)
say "Opening ports 80 and 443 in the server firewall"
open_port() {
  local proto="$1" port="$2"
  sudo iptables -C INPUT -p "$proto" --dport "$port" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 1 -p "$proto" --dport "$port" -j ACCEPT
}
open_port tcp 80
open_port tcp 443
open_port udp 443
sudo netfilter-persistent save >/dev/null

# -------------------------------------------------------------------- swap
mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
if [ "$mem_kb" -lt 2000000 ] && ! swapon --show | grep -q .; then
  say "Small machine ($((mem_kb / 1024)) MB RAM): adding 2 GB of swap"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# --------------------------------------------------------------------- .env
if [ ! -f .env ]; then
  say "Creating .env with fresh random secrets"
  cp .env.production.example .env
  chmod 600 .env
  pg_pass="$(openssl rand -hex 24)"      # hex only: safe inside a connection URL
  jwt="$(openssl rand -hex 48)"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg_pass}|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${jwt}|" .env
  if [ -n "$DOMAIN" ]; then
    sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN}|" .env
    sed -i "s|^GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=https://${DOMAIN}/auth/google/callback|" .env
    sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN}|" .env
  fi
else
  echo "(.env already exists — left untouched)"
fi
mkdir -p backups

# ------------------------------------------------------------------- start
say "Building and starting the platform (the first build takes a few minutes)"
sudo docker compose up -d --build

say "Waiting for the app to answer"
# Ask the app container itself (the proxy in front redirects to HTTPS when a
# domain is set, which would make an outside check misleading).
ok=0
for i in $(seq 1 40); do
  if sudo docker compose exec -T app python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" >/dev/null 2>&1; then
    ok=1; break
  fi
  sleep 3
done
sudo docker compose ps

echo
if [ "${ok:-0}" = 1 ]; then say "The platform is up."; else echo "Not answering yet — check:  sudo docker compose logs app --tail 50"; fi
cat <<EOF

Next steps:
  1. Edit .env  ->  nano .env
       BOOTSTRAP_ADMIN_EMAIL=you@example.com     (becomes the platform admin)
       ANTHROPIC_API_KEY=...                      (optional, enables the full AI assistant)
  2. Apply changes:   sudo docker compose up -d
  3. Point your domain's DNS A record at this server's public IP.
  4. Update later with:   bash deploy/update.sh
  5. Backups are written daily to ./backups (kept ${BACKUP_KEEP_DAYS:-14} days) — copy them off this machine regularly.
EOF
