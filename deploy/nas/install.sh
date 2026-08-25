#!/bin/sh
set -eu

ROOT=/volume1/docker/bolsso
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' "Run this installer with sudo." >&2
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/docker-compose.yml" ] || [ ! -f "$SCRIPT_DIR/pull-deploy.sh" ]; then
  printf '%s\n' "The installer must stay beside the NAS deployment files." >&2
  exit 1
fi
if [ -f "$SCRIPT_DIR/private-test-runner.sh" ] && ! /bin/sh -n "$SCRIPT_DIR/private-test-runner.sh"; then
  printf '%s\n' "The private NAS test runner has invalid shell syntax." >&2
  exit 1
fi

umask 077
mkdir -p "$ROOT/runtime" "$ROOT/bin" "$ROOT/private-tests" "$ROOT/data/pb_data" "$ROOT/secrets" "$ROOT/state" "$ROOT/logs" "$ROOT/releases"

install -o root -g root -m 0644 "$SCRIPT_DIR/Dockerfile" "$ROOT/runtime/Dockerfile"
install -o root -g root -m 0644 "$SCRIPT_DIR/Caddyfile" "$ROOT/runtime/Caddyfile"
install -o root -g root -m 0644 "$SCRIPT_DIR/docker-compose.yml" "$ROOT/runtime/docker-compose.yml"
install -o root -g root -m 0755 "$SCRIPT_DIR/pull-deploy.sh" "$ROOT/bin/pull-deploy.sh"
if [ -f "$SCRIPT_DIR/private-test-runner.sh" ]; then
  install -o root -g root -m 0700 "$SCRIPT_DIR/private-test-runner.sh" "$ROOT/private-tests/run.sh"
  touch "$ROOT/state/private-tests.required"
fi

if [ ! -f "$ROOT/secrets/runtime.env" ]; then
  ENCRYPTION_KEY="$(openssl rand -hex 16)"
  printf 'PB_ENCRYPTION_KEY=%s\n' "$ENCRYPTION_KEY" >"$ROOT/secrets/runtime.env"
elif [ ! -f "$ROOT/state/deployed.sha" ]; then
  ENCRYPTION_KEY="$(sed -n 's/^PB_ENCRYPTION_KEY=//p' "$ROOT/secrets/runtime.env")"
  if [ "${#ENCRYPTION_KEY}" -ne 32 ]; then
    ENCRYPTION_KEY="$(openssl rand -hex 16)"
    printf 'PB_ENCRYPTION_KEY=%s\n' "$ENCRYPTION_KEY" >"$ROOT/secrets/runtime.env"
  fi
fi
unset ENCRYPTION_KEY
chmod 0600 "$ROOT/secrets/runtime.env"
chown -R 1000:1000 "$ROOT/data/pb_data"
if [ -x /usr/syno/bin/synoacltool ]; then
  find "$ROOT/data/pb_data" -depth -exec /usr/syno/bin/synoacltool -del {} \; >/dev/null 2>&1 || true
fi
find "$ROOT/data/pb_data" -type d -exec chmod 0700 {} \;
find "$ROOT/data/pb_data" -type f -exec chmod 0600 {} \;
chown -R root:root "$ROOT/runtime" "$ROOT/bin" "$ROOT/private-tests" "$ROOT/secrets" "$ROOT/state" "$ROOT/logs" "$ROOT/releases"

if ! /usr/local/bin/docker info >/dev/null 2>&1; then
  /usr/syno/bin/synopkg start Docker || true
fi

attempt=1
while ! /usr/local/bin/docker info >/dev/null 2>&1; do
  if [ "$attempt" -ge 24 ]; then
    printf '%s\n' "Docker did not become ready within 120 seconds." >&2
    exit 1
  fi
  sleep 5
  attempt=$((attempt + 1))
done

if ! BOLSSO_FORCE_DEPLOY=1 "$ROOT/bin/pull-deploy.sh"; then
  printf '%s\n' "Deployment failed. Recent deploy log:" >&2
  tail -n 80 "$ROOT/logs/deploy.log" >&2 || true
  exit 1
fi

printf '%s\n' \
  "Installation finished." \
  "API health: http://127.0.0.1:18090/api/health" \
  "Private admin: http://127.0.0.1:18091/_/" \
  "Deploy log: $ROOT/logs/deploy.log"
