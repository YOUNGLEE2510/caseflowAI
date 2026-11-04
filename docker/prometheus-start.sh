#!/bin/sh
set -eu
umask 077
: "${METRICS_TOKEN:?Set METRICS_TOKEN for API and Prometheus}"
printf '%s' "$METRICS_TOKEN" > /tmp/metrics-token
exec /bin/prometheus --config.file=/etc/prometheus/caseflow.yml --storage.tsdb.path=/prometheus --storage.tsdb.retention.time=15d
