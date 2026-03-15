#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-$(pwd)}"
COMPOSE_FILE="${STACK_COMPOSE_FILE:-docker-compose.release.yml}"
LOCK_FILE="${STACK_LOCK_FILE:-$STACK_DIR/.auto-update.lock}"
LOG_DIR="${STACK_LOG_DIR:-$STACK_DIR/logs}"
FETCH_SCRIPT_JS="${STACK_FETCH_SCRIPT_JS:-scripts/auto-update/fetch-release.js}"
FETCH_SCRIPT_TS="${STACK_FETCH_SCRIPT_TS:-scripts/auto-update/fetch-release.ts}"

TARGET_TAG=""
QUIET=0

usage() {
  cat <<'EOF'
Usage: apply-release.sh [--stack-dir <dir>] [--compose-file <file>] [--target-tag <tag>] [--quiet]

Environment:
  GITHUB_OWNER / GITHUB_REPO   Repository to inspect (required)
  GITHUB_TOKEN                 Optional PAT for private repositories or higher rate limits
  STACK_DIR                    Directory containing docker-compose.release.yml (default: PWD)
  STACK_COMPOSE_FILE           Compose filename relative to STACK_DIR
  STACK_LOCK_FILE              File used for flock-based locking
  STACK_LOG_DIR                Directory for log output
EOF
}

abs_path() {
  local target="$1"
  if [[ -d "$target" ]]; then
    (cd "$target" && pwd)
  else
    local dir
    dir=$(cd "$(dirname "$target")" && pwd)
    printf '%s/%s' "$dir" "$(basename "$target")"
  fi
}

log() {
  if [[ "$QUIET" -eq 1 ]]; then
    return
  fi
  printf '%s %s\n' "$(date +"%Y-%m-%dT%H:%M:%S%z")" "$*"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stack-dir)
      STACK_DIR="$(abs_path "$2")"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --target-tag)
      TARGET_TAG="$2"
      shift 2
      ;;
    --quiet)
      QUIET=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${GITHUB_OWNER:-}" || -z "${GITHUB_REPO:-}" ]]; then
  echo "GITHUB_OWNER and GITHUB_REPO must be set" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another auto-update process is running (lock: $LOCK_FILE)" >&2
  exit 1
fi

LOG_FILE="$LOG_DIR/auto-update-$(date +%Y%m%d-%H%M%S).log"
touch "$LOG_FILE"

run_fetch() {
  local args=(
    --stack-dir "$STACK_DIR"
    --compose-file "$COMPOSE_FILE"
    --owner "$GITHUB_OWNER"
    --repo "$GITHUB_REPO"
  )

  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    args+=(--github-token "$GITHUB_TOKEN")
  fi
  if [[ -n "$TARGET_TAG" ]]; then
    args+=(--target-tag "$TARGET_TAG")
  fi

  if [[ -f "$STACK_DIR/$FETCH_SCRIPT_JS" ]]; then
    if command -v node >/dev/null 2>&1; then
      log "Running Node fetch script"
      node "$STACK_DIR/$FETCH_SCRIPT_JS" "${args[@]}"
    elif command -v bun >/dev/null 2>&1; then
      log "Running fetch script with Bun"
      bun "$STACK_DIR/$FETCH_SCRIPT_JS" "${args[@]}"
    else
      echo "Need Node.js or Bun to run $FETCH_SCRIPT_JS" >&2
      exit 1
    fi
  elif command -v bun >/dev/null 2>&1; then
    log "Running Bun fetch script"
    bun "$STACK_DIR/$FETCH_SCRIPT_TS" "${args[@]}"
  else
    echo "Cannot find fetch-release.js and Bun runtime is not installed" >&2
    exit 1
  fi
}

log "Starting auto-update run (target tag: ${TARGET_TAG:-latest})"
{
  run_fetch
  pushd "$STACK_DIR" >/dev/null
  docker compose -f "$COMPOSE_FILE" pull
  docker compose -f "$COMPOSE_FILE" up -d
  popd >/dev/null
  log "Auto-update completed successfully"
} | tee -a "$LOG_FILE"
