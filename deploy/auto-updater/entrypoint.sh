#!/usr/bin/env bash
set -euo pipefail

POLL_INTERVAL="${POLL_INTERVAL:-3600}"
APPLY_SCRIPT="${APPLY_RELEASE_SCRIPT:-/stack/deploy/auto-update/apply-release.sh}"
STACK_DIR="${STACK_DIR:-/stack}"
COMPOSE_FILE="${STACK_COMPOSE_FILE:-docker-compose.release.yml}"

echo "Auto-updater starting (poll interval: ${POLL_INTERVAL}s)"

while true; do
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") Checking for updates..."
  bash "$APPLY_SCRIPT" \
    --stack-dir "$STACK_DIR" \
    --compose-file "$COMPOSE_FILE" \
    || echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") Update check failed (see above)"
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") Next check in ${POLL_INTERVAL}s"
  sleep "$POLL_INTERVAL"
done
