#!/bin/sh
# Daily compressed database backup, kept for KEEP_DAYS days.
# Runs forever inside the `backup` container; files land in ./backups on the host.
#
# Optional off-server copy: set OFFSITE_BUCKET (plus AWS_ACCESS_KEY_ID /
# AWS_SECRET_ACCESS_KEY, and OFFSITE_ENDPOINT for Cloudflare R2 or any
# S3-compatible store) in .env and every backup is also uploaded there, so
# losing this server does not lose the data. A failed upload never stops the
# local backups.
set -eu

KEEP_DAYS="${KEEP_DAYS:-14}"
OFFSITE_BUCKET="${OFFSITE_BUCKET:-}"
OFFSITE_PREFIX="${OFFSITE_PREFIX:-nabd-backups}"
mkdir -p /backups

if [ -n "${OFFSITE_BUCKET}" ]; then
  if apk add --no-cache aws-cli >/dev/null 2>&1; then
    echo "[backup] off-server copy enabled -> s3://${OFFSITE_BUCKET}/${OFFSITE_PREFIX}/"
  else
    echo "[backup] could not install aws-cli; off-server copy disabled" >&2
    OFFSITE_BUCKET=""
  fi
fi

offsite() {
  [ -n "${OFFSITE_BUCKET}" ] || return 0
  ep=""
  [ -z "${OFFSITE_ENDPOINT:-}" ] || ep="--endpoint-url ${OFFSITE_ENDPOINT}"
  # shellcheck disable=SC2086
  if AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}" aws s3 cp "$1" "s3://${OFFSITE_BUCKET}/${OFFSITE_PREFIX}/$(basename "$1")" ${ep} --only-show-errors; then
    echo "[backup] uploaded off-server: $(basename "$1")"
  else
    echo "[backup] off-server upload FAILED for $(basename "$1")" >&2
  fi
}

while true; do
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  out="/backups/nabd-${stamp}.sql"

  # Dump to a plain file first, THEN compress: in a plain `pg_dump | gzip`
  # a failing pg_dump would still leave a valid-looking (but empty) .gz.
  if pg_dump --no-owner --clean --if-exists > "${out}.part" && mv "${out}.part" "${out}" && gzip -9 "${out}"; then
    echo "[backup] ok: ${out}.gz ($(du -h "${out}.gz" | cut -f1))"
    offsite "${out}.gz"
  else
    echo "[backup] FAILED at ${stamp}" >&2
    rm -f "${out}.part" "${out}"
  fi

  find /backups -name 'nabd-*.sql.gz' -mtime +"${KEEP_DAYS}" -delete
  sleep 86400
done
