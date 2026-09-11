#!/bin/sh
# Sourced by the locked deployer. Snapshots never leave the private NAS.

capture_deployment() {
  umask 077
  mkdir -p "$ROOT/backups"
  # Refuse before downtime if two copies of data plus a safety margin cannot fit.
  data_kb=$(du -sk "$ROOT/data" "$ROOT/runtime" "$ROOT/secrets" | awk '{sum += $1} END {print sum}')
  free_kb=$(df -Pk "$ROOT" | awk 'END {print $4}')
  [ "$free_kb" -gt "$((data_kb * 3 + 1048576))" ] || { log "ERROR: insufficient snapshot/restore space"; return 1; }
  SNAPSHOT=$(mktemp -d "$ROOT/backups/deploy.XXXXXX")
  printf 'services:\n' >"$SNAPSHOT/images.yml"
  image_ids=""
  services="pocketbase api rule-converter"
  if [ ! -L "$ROOT/current" ]; then
    [ ! -f "$ROOT/data/pb_data/data.db" ] || { log "ERROR: existing database has no recovery release"; return 1; }
    services=""
    touch "$SNAPSHOT/initial"
  fi
  for service in $services; do
    container=$("$DOCKER_COMPOSE" -f "$COMPOSE_FILE" ps -q "$service") || return 1
    [ -n "$container" ] || { log "ERROR: expected running service is missing: $service"; return 1; }
    image_id=$(docker inspect --format '{{.Image}}' "$container") || return 1
    case "$image_id" in sha256:*) ;; *) return 1;; esac
    printf '  %s:\n    image: "%s"\n' "$service" "$image_id" >>"$SNAPSHOT/images.yml"
    image_ids="$image_ids $image_id"
  done
  # Saving image objects makes recovery independent of tag changes and registries.
  if [ -n "$image_ids" ]; then docker image save -o "$SNAPSHOT/images.tar" $image_ids || return 1; else touch "$SNAPSHOT/images.tar"; fi
  free_kb=$(df -Pk "$ROOT" | awk 'END {print $4}')
  [ "$free_kb" -gt "$((data_kb * 3 + 1048576))" ] || return 1
  tar -cpf "$SNAPSHOT/config.tar" -C "$ROOT" runtime secrets || return 1
  if [ -L "$ROOT/current" ]; then readlink "$ROOT/current" >"$SNAPSHOT/previous-release" || return 1; else : >"$SNAPSHOT/previous-release"; fi
  for marker in deployed.sha verified.sha; do
    if [ -f "$ROOT/state/$marker" ]; then cp "$ROOT/state/$marker" "$SNAPSHOT/$marker"; fi
  done
  printf '%s\n' "${SNAPSHOT##*/}" >"$ROOT/state/deploy.pending.next"
  mv "$ROOT/state/deploy.pending.next" "$ROOT/state/deploy.pending"
  if [ -n "$services" ]; then "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" stop || return 1; fi
  tar -cpf "$SNAPSHOT/data.tar" -C "$ROOT/data" pb_data || return 1
  (cd "$SNAPSHOT" && sha256sum data.tar config.tar images.tar images.yml previous-release >checksums) || return 1
  touch "$SNAPSHOT/ready"
  sync
}

recover_deployment() {
  [ -f "$ROOT/state/deploy.pending" ] || return 0
  export BOLSSO_DEPLOY_MAINTENANCE=0
  name=$(sed -n '1p' "$ROOT/state/deploy.pending")
  case "$name" in deploy.*) ;; *) log "ERROR: invalid recovery journal"; return 1;; esac
  case "$name" in *[!a-zA-Z0-9.]*|*..*) return 1;; esac
  snapshot="$ROOT/backups/$name"
  [ -d "$snapshot" ] || return 1
  if [ ! -f "$snapshot/ready" ]; then
    # No candidate mutation occurs before ready. A crash during capture needs only restart.
    if [ ! -f "$snapshot/initial" ]; then "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" up -d --no-build || return 1; fi
  else
    (cd "$snapshot" && sha256sum -c checksums) || { log "ERROR: recovery checksum failed; manual review required"; return 1; }
    previous=$(sed -n '1p' "$snapshot/previous-release")
    if [ ! -f "$snapshot/initial" ]; then
      case "$previous" in "$ROOT"/releases/*) ;; *) return 1;; esac
      [ -d "$previous/backend" ] || return 1
    fi
    # Use fixed service containers, so recovery can resume even if interruption
    # happened between moving the old runtime/secrets directories and restoring them.
    for service in bolsso-api bolsso-rule-converter bolsso-pocketbase; do
      container=$(docker ps -aq --filter "name=^/$service$") || return 1
      if [ -n "$container" ]; then docker rm -f "$container" || return 1; fi
    done
    restore=$(mktemp -d "$ROOT/state/restore.XXXXXX") || return 1
    mkdir "$restore/data" || return 1
    tar -xpf "$snapshot/data.tar" -C "$restore/data" || return 1
    tar -xpf "$snapshot/config.tar" -C "$restore" || return 1
    # Keep failed data/configuration for investigation; never erase it to roll back.
    failed=$(mktemp -d "$snapshot/failed.XXXXXX") || return 1
    for part in data/pb_data runtime secrets; do
      mkdir -p "$failed/$(dirname "$part")" || return 1
      if [ -e "$ROOT/$part" ]; then mv "$ROOT/$part" "$failed/$part" || return 1; fi
      mv "$restore/$part" "$ROOT/$part" || return 1
    done
    if [ -f "$snapshot/initial" ]; then
      rm -f "$ROOT/current"
    else
      ln -sfn "$previous" "$ROOT/current" || return 1
      docker image load -i "$snapshot/images.tar" || return 1
      "$DOCKER_COMPOSE" -f "$COMPOSE_FILE" -f "$snapshot/images.yml" up -d --no-build --force-recreate || return 1
    fi
    for marker in deployed.sha verified.sha; do
      if [ -f "$snapshot/$marker" ]; then cp "$snapshot/$marker" "$ROOT/state/$marker" || return 1; else rm -f "$ROOT/state/$marker" || return 1; fi
    done
  fi
  if [ -f "$snapshot/initial" ]; then
    rm -f "$ROOT/state/deploy.pending" "$ROOT/state/deploy.opening"
    log "RECOVERED: failed initial installation preserved and stopped"
    return 0
  fi
  attempt=1
  until curl -fsS --connect-timeout 5 --max-time 10 http://127.0.0.1:18091/api/health >/dev/null; do
    [ "$attempt" -lt 24 ] || { log "ERROR: recovery health check failed; journal retained"; return 1; }
    sleep 5
    attempt=$((attempt + 1))
  done
  rm -f "$ROOT/state/deploy.pending"
  rm -f "$ROOT/state/deploy.opening"
  log "RECOVERED: previous data, configuration and runtime restored"
}
