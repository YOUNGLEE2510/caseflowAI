#!/bin/sh
set -eu
umask 077
while true; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  partial="/backups/$stamp.archive.gz.partial"
  if mongodump --host mongo --username "$MONGO_BACKUP_USER" --password "$MONGO_BACKUP_PASSWORD" --authenticationDatabase admin --db "${MONGODB_DB:-caseflow_ai}" --archive="$partial" --gzip; then
    mv "$partial" "/backups/$stamp.archive.gz"
    sha256sum "/backups/$stamp.archive.gz" > "/backups/$stamp.archive.gz.sha256"
    find /backups -type f -name '*.archive.gz' -mtime +7 -delete
    find /backups -type f -name '*.archive.gz.sha256' -mtime +7 -delete
    echo "MongoDB backup completed: $stamp"
  else
    rm -f "$partial"
    echo "MongoDB backup failed" >&2
    if [ "${1:-}" = "--once" ]; then exit 1; fi
  fi
  if [ "${1:-}" = "--once" ]; then exit 0; fi
  sleep 86400
done
