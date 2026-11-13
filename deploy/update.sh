#!/usr/bin/env bash
# Pull the latest code from GitHub and restart the platform with it.
# Your data (database, uploads, certificates, backups) is kept.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Taking a safety backup first"
if sudo docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  sudo docker compose exec -T db sh -c 'pg_dump -U nabd -d nabd --no-owner --clean --if-exists' \
    | gzip -9 > "backups/before-update-$(date -u +%Y%m%d-%H%M%S).sql.gz" || echo "(backup skipped)"
fi

echo "==> Pulling the latest code"
git pull --ff-only

echo "==> Rebuilding and restarting"
sudo docker compose up -d --build
sudo docker image prune -f >/dev/null

echo "==> Status"
sudo docker compose ps
