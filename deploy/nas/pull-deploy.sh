#!/bin/sh
set -eu

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH

ROOT=/volume1/docker/bolsso
REPOSITORY=cream284/bolsso
BRANCH=main
COMPOSE_FILE="$ROOT/runtime/docker-compose.yml"
STATE_FILE="$ROOT/state/deployed.sha"
VERIFIED_FILE="$ROOT/state/verified.sha"
LOCK_FILE="$ROOT/state/deploy.lock"
LOG_FILE="$ROOT/logs/deploy.log"
DOCKER_COMPOSE=/usr/local/bin/docker-compose
PRIVATE_TEST_RUNNER="$ROOT/private-tests/run.sh"
PRIVATE_TEST_REQUIRED="$ROOT/state/private-tests.required"

mkdir -p "$ROOT/state" "$ROOT/logs" "$ROOT/releases"
touch "$LOG_FILE"
exec >>"$LOG_FILE" 2>&1

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

sync_runtime_files() {
  source_dir="$1/deploy/nas"
  install -o root -g root -m 0644 "$source_dir/Dockerfile" "$ROOT/runtime/Dockerfile"
  install -o root -g root -m 0644 "$source_dir/Caddyfile" "$ROOT/runtime/Caddyfile"
  install -o root -g root -m 0644 "$source_dir/docker-compose.yml" "$ROOT/runtime/docker-compose.yml"
}

sync_deploy_scripts() {
  source_dir="$1/deploy/nas"
  for script in pull-deploy.sh pull-deploy-every-2min.sh verify-deployment.sh deployment-recovery.sh; do
    /bin/sh -n "$source_dir/$script" || return 1
  done
  # Replacing via rename preserves the running shell's old file descriptor.
  for script in deployment-recovery.sh verify-deployment.sh pull-deploy-every-2min.sh pull-deploy.sh; do
    install -o root -g root -m 0755 "$source_dir/$script" "$ROOT/bin/.$script.next" || return 1
    mv -f "$ROOT/bin/.$script.next" "$ROOT/bin/$script" || return 1
  done
}

verify_public_release() {
  release_dir="$1"
  public_origin="$(sed -n "s/^const API_BASE = '\\(https:\/\/[^']*\\)';/\\1/p" "$release_dir/app.js")"
  if [ -z "$public_origin" ]; then
    log "ERROR: public API origin is missing"
    return 1
  fi
  /bin/sh "$release_dir/deploy/nas/verify-deployment.sh" "$public_origin" || return 1
  # Optional NAS-only authenticated read probes; never shipped in public code.
  if [ -x "$ROOT/private-tests/verify-production.sh" ]; then
    "$ROOT/private-tests/verify-production.sh" "$public_origin" || return 1
  else
    log "NOTE: authenticated production read probe is not configured"
  fi
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

. "$ROOT/bin/deployment-recovery.sh"
# Finish an interrupted recovery before contacting the registry or fetching code.
recover_deployment || exit 1
if [ -f "$ROOT/state/deploy.opening" ]; then
  rm -f "$ROOT/data/pb_data/.deployment-maintenance"
  export BOLSSO_DEPLOY_MAINTENANCE=0
  "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" up -d --no-build api
  rm -f "$ROOT/state/deploy.opening"
fi

API_URL="https://api.github.com/repos/$REPOSITORY/commits/$BRANCH"
REMOTE_JSON="$(curl -fsSL --connect-timeout 15 --max-time 60 -H 'Accept: application/vnd.github+json' -H 'User-Agent: bolsso-nas-deployer' "$API_URL")"
REMOTE_SHA="$(printf '%s' "$REMOTE_JSON" | tr -d '\r\n' | cut -d '"' -f 4)"

if [ "${#REMOTE_SHA}" -ne 40 ] || printf '%s' "$REMOTE_SHA" | grep -q '[^0-9a-f]'; then
  log "ERROR: GitHub returned an invalid commit SHA"
  exit 1
fi

DEPLOYED_SHA=""
if [ -f "$STATE_FILE" ]; then
  DEPLOYED_SHA="$(sed -n '1p' "$STATE_FILE")"
fi

FORCE_DEPLOY="${BOLSSO_FORCE_DEPLOY:-0}"
if [ "$REMOTE_SHA" = "$DEPLOYED_SHA" ] && [ "$FORCE_DEPLOY" != "1" ]; then
  if [ ! -f "$VERIFIED_FILE" ] || [ "$(sed -n '1p' "$VERIFIED_FILE")" != "$REMOTE_SHA" ]; then
    verify_public_release "$ROOT/current" || exit 1
    sync_deploy_scripts "$ROOT/current"
    printf '%s\n' "$REMOTE_SHA" >"$VERIFIED_FILE"
    log "VERIFIED: deployed release passed external checks"
  fi
  exit 0
fi

log "START: deploying $REMOTE_SHA"
WORK_DIR="$(mktemp -d "$ROOT/state/deploy.XXXXXX")"
finish_deploy() {
  result=$?
  trap - EXIT HUP INT TERM
  if [ -f "$ROOT/state/deploy.pending" ]; then
    recover_deployment || result=1
  fi
  rm -rf "$WORK_DIR"
  exit "$result"
}
trap finish_deploy EXIT
trap 'exit 1' HUP INT TERM
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
for script in pull-deploy.sh pull-deploy-every-2min.sh verify-deployment.sh deployment-recovery.sh; do
  /bin/sh -n "$STAGED/deploy/nas/$script"
done

if [ -f "$PRIVATE_TEST_REQUIRED" ] && [ ! -x "$PRIVATE_TEST_RUNNER" ]; then
  log "ERROR: private NAS test runner is missing"
  exit 1
fi
if [ -x "$PRIVATE_TEST_RUNNER" ]; then
  if [ "$("$PRIVATE_TEST_RUNNER" --protocol-version 2>/dev/null || true)" != "3" ]; then
    log "ERROR: update the NAS-only test bundle before deploying this release"
    exit 1
  fi
  log "TEST: running private NAS suite for $REMOTE_SHA"
  if ! "$PRIVATE_TEST_RUNNER" "$STAGED" "$REMOTE_SHA"; then
    log "ERROR: private NAS tests failed; production remains unchanged"
    exit 1
  fi
  log "TEST: private NAS suite passed for $REMOTE_SHA"
else
  log "ERROR: private NAS suite is required before deployment"
  exit 1
fi

if [ ! -d "$RELEASE" ]; then
  mv "$STAGED" "$RELEASE"
fi
chown -R root:root "$RELEASE"
chmod -R go-w "$RELEASE"

capture_deployment
touch "$ROOT/data/pb_data/.deployment-maintenance"
: >"$VERIFIED_FILE"
ln -sfn "$RELEASE" "$ROOT/current"
sync_runtime_files "$RELEASE"
export BOLSSO_DEPLOY_MAINTENANCE=1

if ! "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" up -d --build --force-recreate --remove-orphans; then
  log "ERROR: container build or start failed"
  exit 1
fi

HEALTHY=0
attempt=1
while [ "$attempt" -le 24 ]; do
  if /bin/sh "$RELEASE/deploy/nas/verify-deployment.sh" http://127.0.0.1:18090; then
    HEALTHY=1
    break
  fi
  sleep 5
  attempt=$((attempt + 1))
done

if [ "$HEALTHY" -ne 1 ]; then
  log "ERROR: health check failed; restoring the previous release"
  printf '%s\n' "--- container status ---"
  "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" ps || true
  printf '%s\n' "--- proxy health response ---"
  curl -sS -i --max-time 5 http://127.0.0.1:18090/api/health || true
  printf '\n%s\n' "--- direct PocketBase health response ---"
  curl -sS -i --max-time 5 http://127.0.0.1:18091/api/health || true
  printf '\n%s\n' "--- container logs ---"
  "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" logs --no-color --tail=120 || true
  exit 1
fi

sync_deploy_scripts "$RELEASE"
printf '%s\n' "$REMOTE_SHA" >"$STATE_FILE.next"
mv "$STATE_FILE.next" "$STATE_FILE"
# Commit before opening writes: no post-commit failure may restore an old snapshot.
touch "$ROOT/state/deploy.opening"
sync
rm -f "$ROOT/state/deploy.pending"
rm -f "$ROOT/data/pb_data/.deployment-maintenance"
export BOLSSO_DEPLOY_MAINTENANCE=0
"$DOCKER_COMPOSE" -f "$COMPOSE_FILE" up -d --no-build api
rm -f "$ROOT/state/deploy.opening"
if ! verify_public_release "$RELEASE"; then
  log "ERROR: internal deployment succeeded; external verification failed and will retry next run"
  exit 1
fi
printf '%s\n' "$REMOTE_SHA" >"$VERIFIED_FILE"
log "DONE: $REMOTE_SHA passed internal and external checks"
