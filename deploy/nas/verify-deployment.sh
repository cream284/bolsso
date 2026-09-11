#!/bin/sh
set -eu

origin="${1:?API origin is required}"
case "$origin" in
  http://127.0.0.1:*|https://*) ;;
  *) printf '%s\n' 'Invalid verification origin.' >&2; exit 1 ;;
esac
origin="${origin%/}"

check_json() {
  path="$1"
  expected="$2"
  if ! response="$(curl -fsS --connect-timeout 5 --max-time 10 --max-filesize 65536 "$origin$path")"; then
    printf 'Verification failed: %s\n' "$path" >&2
    return 1
  fi
  if ! printf '%s' "$response" | grep -Eq "$expected"; then
    printf 'Unexpected response: %s\n' "$path" >&2
    return 1
  fi
}

check_json /api/health '"code"[[:space:]]*:[[:space:]]*200'
check_json /api/bolsso/rules/converter-health '"status"[[:space:]]*:[[:space:]]*"ok"'
check_json '/api/collections/rules/records?perPage=1' '"items"[[:space:]]*:[[:space:]]*\[[[:space:]]*\]'
check_json '/api/collections/member_directory/records?perPage=1' '"items"[[:space:]]*:[[:space:]]*\[[[:space:]]*\]'
printf '%s\n' 'Health, converter route and anonymous read restrictions verified.'
