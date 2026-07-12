#!/bin/sh
set -eu

umask 077

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

create_backup() {
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  temporary="${BACKUP_DIR}/.renowa-${timestamp}.dump.tmp"
  backup="${BACKUP_DIR}/renowa-${timestamp}.dump"

  mkdir -p "$BACKUP_DIR"
  pg_dump \
    --host="${PGHOST:-db}" \
    --port="${PGPORT:-5432}" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --file="$temporary"

  mv "$temporary" "$backup"
  (cd "$BACKUP_DIR" && sha256sum "$(basename "$backup")" > "$(basename "$backup").sha256")
  find "$BACKUP_DIR" -type f \( -name 'renowa-*.dump' -o -name 'renowa-*.dump.sha256' \) \
    -mtime "+$RETENTION_DAYS" -delete

  echo "Backup concluído: $(basename "$backup")"
}

while true; do
  create_backup
  [ "${BACKUP_ONCE:-false}" = 'true' ] && exit 0
  sleep "$INTERVAL_SECONDS"
done
