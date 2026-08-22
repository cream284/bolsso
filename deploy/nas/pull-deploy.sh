#!/bin/sh
set -eu

ROOT=/volume1/docker/bolsso
REPOSITORY=cream284/bolsso
BRANCH=main
COMPOSE_FILE="$ROOT/runtime/docker-compose.yml"
STATE_FILE="$ROOT/state/deployed.sha"
LOCK_FILE="$ROOT/state/deploy.lock"
LOG_FILE="$ROOT/logs/deploy.log"
DOCKER_COMPOSE=/usr/local/bin/docker-compose

mkdir -p "$ROOT/state" "$ROOT/logs" "$ROOT/releases"
touch "$LOG_FILE"
exec >>"$LOG_FILE" 2>&1

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

if [ "$(id -u)" -ne 0 ]; then
  log "ERROR: this script must run as root from DSM Task Scheduler"
  exit 1
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "SKIP: another deployment is already running"
  exit 0
fi

if [ ! -x "$DOCKER_COMPOSE" ]; then
  log "ERROR: docker-compose was not found at $DOCKER_COMPOSE"
  exit 1
fi

API_URL="https://api.github.com/repos/$REPOSITORY/commits/$BRANCH"
REMOTE_JSON="$(curl -fsSL --connect-timeout 15 --max-time 60 -H 'Accept: application/vnd.github+json' -H 'User-Agent: bolsso-nas-deployer' "$API_URL")"
REMOTE_SHA="$(printf '%s\n' "$REMOTE_JSON" | sed -n 's/^[[:space:]]*"sha":[[:space:]]*"\([0-9a-f]\{40\}\)".*/\1/p' | sed -n '1p')"

case "$REMOTE_SHA" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) log "ERROR: GitHub returned an invalid commit SHA"; exit 1 ;;
esac

DEPLOYED_SHA=""
if [ -f "$STATE_FILE" ]; then
  DEPLOYED_SHA="$(sed -n '1p' "$STATE_FILE")"
fi

if [ "$REMOTE_SHA" = "$DEPLOYED_SHA" ]; then
  exit 0
fi

log "START: deploying $REMOTE_SHA"
WORK_DIR="$(mktemp -d "$ROOT/state/deploy.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT HUP INT TERM
ARCHIVE="$WORK_DIR/source.tar.gz"
STAGED="$WORK_DIR/release"
RELEASE="$ROOT/releases/$REMOTE_SHA"

curl -fsSL --connect-timeout 15 --max-time 180 \
  -H 'User-Agent: bolsso-nas-deployer' \
  "https://github.com/$REPOSITORY/archive/$REMOTE_SHA.tar.gz" \
  -o "$ARCHIVE"
mkdir -p "$STAGED"
tar -xzf "$ARCHIVE" --strip-components=1 -C "$STAGED"

if [ ! -d "$STAGED/backend/pb_migrations" ] || [ ! -d "$STAGED/backend/pb_hooks" ]; then
  log "ERROR: release does not contain the expected backend directories"
  exit 1
fi

if [ ! -d "$RELEASE" ]; then
  mv "$STAGED" "$RELEASE"
fi
chown -R root:root "$RELEASE"
chmod -R go-w "$RELEASE"

PREVIOUS_RELEASE=""
if [ -L "$ROOT/current" ]; then
  PREVIOUS_RELEASE="$(readlink "$ROOT/current")"
fi
ln -sfn "$RELEASE" "$ROOT/current"

if ! "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" up -d --build --remove-orphans; then
  log "ERROR: container build or start failed"
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    ln -sfn "$PREVIOUS_RELEASE" "$ROOT/current"
    "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" up -d --remove-orphans || true
  else
    rm -f "$ROOT/current"
    "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" down || true
  fi
  exit 1
fi

HEALTHY=0
attempt=1
while [ "$attempt" -le 24 ]; do
  if curl -fsS --max-time 5 http://127.0.0.1:18090/api/health >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 5
  attempt=$((attempt + 1))
done

if [ "$HEALTHY" -ne 1 ]; then
  log "ERROR: health check failed; restoring the previous release"
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    ln -sfn "$PREVIOUS_RELEASE" "$ROOT/current"
    "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" up -d --remove-orphans || true
  else
    rm -f "$ROOT/current"
    "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" down || true
  fi
  exit 1
fi

printf '%s\n' "$REMOTE_SHA" >"$STATE_FILE"
log "DONE: $REMOTE_SHA is healthy"
