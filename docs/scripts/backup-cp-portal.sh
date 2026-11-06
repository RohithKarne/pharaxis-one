#!/usr/bin/env bash
#
# backup-cp-portal.sh — a dated copy of CP Portal's uploaded files and its database.
#
#     ./docs/scripts/backup-cp-portal.sh
#
# Uploaded files (documents, logos, safety letters) live only in the backend's
# uploads folder, which git ignores, so nothing else keeps a copy (§41.10 item 5).
# Each run writes one folder:
#
#     ~/Pharaxis-Backups/cp-portal/<YYYY-MM-DD_HHMM>/uploads.tar.gz
#     ~/Pharaxis-Backups/cp-portal/<YYYY-MM-DD_HHMM>/database.sql.gz
#
# and keeps the newest 14, deleting older ones. Database settings come from the
# backend's .env; the password is passed to mysqldump in its environment, never
# on the command line. Override the destination with CP_BACKUP_DIR.
#
# Same machine, same disk: this protects against a deleted file or a broken
# migration, not against losing the laptop. The files are not encrypted.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$REPO_ROOT/apps/cp-portal/backend"
DEST_ROOT="${CP_BACKUP_DIR:-$HOME/Pharaxis-Backups/cp-portal}"
KEEP=14
MYSQLDUMP="$(command -v mysqldump || echo /usr/local/mysql/bin/mysqldump)"

env_value() { grep -E "^$1=" "$BACKEND/.env" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
DB_HOST="$(env_value MYSQL_HOST)";      DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="$(env_value MYSQL_PORT)";      DB_PORT="${DB_PORT:-3306}"
DB_USER="$(env_value MYSQL_USER)"
DB_NAME="$(env_value MYSQL_DATABASE)"
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || { echo "backup: MYSQL_USER or MYSQL_DATABASE missing from $BACKEND/.env" >&2; exit 1; }

STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="$DEST_ROOT/$STAMP"
mkdir -p "$OUT"
chmod 700 "$DEST_ROOT"

tar -czf "$OUT/uploads.tar.gz" -C "$BACKEND" uploads
MYSQL_PWD="$(env_value MYSQL_PASSWORD)" "$MYSQLDUMP" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  --single-transaction --routines --no-tablespaces "$DB_NAME" | gzip > "$OUT/database.sql.gz"

# Refuse to call it a backup if either part is empty.
[ -s "$OUT/uploads.tar.gz" ] && [ "$(gzip -dc "$OUT/database.sql.gz" | head -c 1 | wc -c)" -gt 0 ] \
  || { echo "backup: $OUT is incomplete" >&2; exit 1; }

# Keep the newest $KEEP; folder names sort by date.
ls -1d "$DEST_ROOT"/????-??-??_???? | sort -r | tail -n +"$((KEEP + 1))" | while read -r old; do rm -rf "$old"; done

echo "backup: $OUT  uploads $(du -h "$OUT/uploads.tar.gz" | cut -f1), database $(du -h "$OUT/database.sql.gz" | cut -f1)"
