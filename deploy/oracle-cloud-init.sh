#!/bin/bash
# Paste this whole script into Oracle's "Cloud-init script" box when creating
# the instance (Create instance → Show advanced options → Management).
# On first boot the server installs and starts the whole platform by itself —
# no SSH needed. Edit the two values below first.

DOMAIN=""                 # e.g. nabd.example.com  (leave empty to start on plain HTTP by IP)
ADMIN_EMAIL=""            # the email that becomes the platform admin

set -u
LOG=/var/log/nabd-setup.log
exec > >(tee -a "$LOG") 2>&1
echo "=== nabd first-boot setup: $(date -u) ==="

# Oracle's Ubuntu image runs this as root; the platform's setup script wants
# the normal 'ubuntu' user (it uses sudo itself).
sudo -u ubuntu -H bash -c '
  set -euo pipefail
  cd ~
  [ -d nabd-backend ] || git clone https://github.com/mosa1232/nabd-backend.git
  cd nabd-backend
  bash deploy/setup-oracle.sh "'"$DOMAIN"'"
  if [ -n "'"$ADMIN_EMAIL"'" ]; then
    sed -i "s|^BOOTSTRAP_ADMIN_EMAIL=.*|BOOTSTRAP_ADMIN_EMAIL='"$ADMIN_EMAIL"'|" .env
    sudo docker compose up -d
  fi
'
echo "=== done: $(date -u) ==="
