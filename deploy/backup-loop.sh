#!/bin/sh
# Daily compressed database backup, kept for KEEP_DAYS days.
# Runs forever inside the `backup` container; files land in ./backups on the host.
set -eu

KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p /backups

while true; do
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  out="/backups/nabd-${stamp}.sql"

  # Dump to a plain file first, THEN compress: in a plain `pg_dump | gzip`
  # a failing pg_dump would still leave a valid-looking (but empty) .gz.
  if pg_dump --no-owner --clean --if-exists > "${out}.part" && mv "${out}.part" "${out}" && gzip -9 "${out}"; then
    echo "[backup] ok: ${out}.gz ($(du -h "${out}.gz" | cut -f1))"
  else
    echo "[backup] FAILED at ${stamp}" >&2
    rm -f "${out}.part" "${out}"
  fi

  find /backups -name 'nabd-*.sql.gz' -mtime +"${KEEP_DAYS}" -delete
  sleep 86400
done
