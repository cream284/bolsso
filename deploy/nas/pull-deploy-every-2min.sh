#!/bin/sh
set -eu

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH

ROOT=/volume1/docker/bolsso
minute="$(date '+%M')"

case "$minute" in
  ''|*[!0-9]*)
    printf '%s\n' "Invalid system minute: $minute" >&2
    exit 1
    ;;
esac

minute="${minute#0}"
if [ $((minute % 2)) -ne 0 ]; then
  exit 0
fi

exec "$ROOT/bin/pull-deploy.sh"
