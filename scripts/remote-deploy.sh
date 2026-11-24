#!/usr/bin/env bash
#
# Runs ON the EC2 host, streamed over SSH by the Jenkins pipeline.
#
# Usage: bash -s -- <IMAGE> [CONTAINER_NAME] [HOST_PORT]
#   IMAGE          full image reference to deploy (required)
#   CONTAINER_NAME docker container name (default: awesome-cars)
#   HOST_PORT      port published on the host (default: 3000)
#
# It pulls the image, replaces the running container, waits for /health,
# and rolls back to the previously deployed image if the new one is unhealthy.

set -euo pipefail

IMAGE="${1:?usage: remote-deploy.sh <IMAGE> [CONTAINER_NAME] [HOST_PORT]}"
CONTAINER="${2:-awesome-cars}"
HOST_PORT="${3:-3000}"

APP_PORT=3000
STATE_DIR="${HOME}/.awesome-cars-deploy"
STATE_FILE="${STATE_DIR}/previous-image"
HEALTH_RETRIES=20
HEALTH_DELAY=3

log() { printf '[deploy] %s\n' "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: docker is not installed on this host."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  log "ERROR: cannot talk to the docker daemon. Is this user in the 'docker' group?"
  exit 1
fi

mkdir -p "$STATE_DIR"

current_image=""
if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  current_image="$(docker container inspect -f '{{.Config.Image}}' "$CONTAINER")"
fi

log "Pulling ${IMAGE}"
docker pull "$IMAGE"

# Remember the image currently running so we can roll back to it.
if [ -n "$current_image" ] && [ "$current_image" != "$IMAGE" ]; then
  printf '%s\n' "$current_image" > "$STATE_FILE"
  log "Rollback image saved: ${current_image}"
fi

start_container() {
  local image="$1"
  docker run -d \
    --name "$CONTAINER" \
    --restart unless-stopped \
    -p "${HOST_PORT}:${APP_PORT}" \
    -e NODE_ENV=production \
    -e PORT="$APP_PORT" \
    -e APP_VERSION="${image##*:}" \
    "$image"
}

wait_for_health() {
  local status
  for _ in $(seq 1 "$HEALTH_RETRIES"); do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 5 "http://127.0.0.1:${HOST_PORT}/health" >/dev/null 2>&1; then
        return 0
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget -qO- --timeout=5 "http://127.0.0.1:${HOST_PORT}/health" >/dev/null 2>&1; then
        return 0
      fi
    else
      # No HTTP client available on the host: rely on the container healthcheck.
      sleep 5
      status="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo unknown)"
      if [ "$status" = "healthy" ]; then
        return 0
      fi
    fi
    sleep "$HEALTH_DELAY"
  done
  return 1
}

log "Replacing container '${CONTAINER}'"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

if ! start_container "$IMAGE" >/dev/null; then
  log "ERROR: failed to start the new container (port ${HOST_PORT} already in use?)"
  if [ -s "$STATE_FILE" ]; then
    log "Rolling back to $(cat "$STATE_FILE")"
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    start_container "$(cat "$STATE_FILE")" >/dev/null || true
  fi
  exit 1
fi

if ! wait_for_health; then
  log "ERROR: health check failed. Last container logs:"
  docker logs --tail 50 "$CONTAINER" 2>&1 || true

  if [ -s "$STATE_FILE" ]; then
    rollback_image="$(cat "$STATE_FILE")"
    log "Rolling back to ${rollback_image}"
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    start_container "$rollback_image" >/dev/null || true
  else
    log "No rollback image available; removing the failed container."
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  exit 1
fi

log "Deployment healthy: ${IMAGE}"

# Housekeeping: drop dangling images and old unused layers.
docker image prune -f >/dev/null 2>&1 || true

docker ps --filter "name=^/${CONTAINER}$" \
  --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
