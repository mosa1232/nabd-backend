#!/usr/bin/env bash
# Restore the database from a backup made by this kit:
#
#   bash deploy/restore.sh backups/nabd-20261113-030000.sql.gz
#
# This REPLACES the current database contents with the backup.
set -euo pipefail
cd "$(dirname "$0")/.."

file="${1:-}"
[ -n "$file" ] && [ -f "$file" ] || { echo "usage: bash deploy/restore.sh backups/<file>.sql.gz" >&2; exit 1; }

read -r -p "This will REPLACE the current database with $file. Type YES to continue: " answer
[ "$answer" = "YES" ] || { echo "cancelled"; exit 1; }

echo "==> Stopping the app (the database stays up)"
sudo docker compose stop app

echo "==> Restoring"
gunzip -c "$file" | sudo docker compose exec -T db psql -v ON_ERROR_STOP=1 -U nabd -d nabd >/dev/null

echo "==> Starting the app"
sudo docker compose start app
echo "Done."
