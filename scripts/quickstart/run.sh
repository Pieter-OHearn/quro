#!/bin/sh
# README quickstart test. Runs the commands of the README quickstart as written, from an empty
# directory, then checks the healthy state the README describes, creates the first account with
# the printed setup code, runs the quickstart a second time (every step must be safe to repeat)
# and removes the install with the commands of docs/uninstall.md.
#
#   QURO_BACKEND_IMAGE=quro-backend:ci QURO_FRONTEND_IMAGE=quro-frontend:ci \
#     sh scripts/quickstart/run.sh
#
# The commands come from the README through scripts/quickstart/commands.ts. Before a release
# exists, its artifacts are replaced: the example Compose file is read from this checkout, and
# the images are the ones under test (built from the checkout when missing). A Compose override,
# passed with COMPOSE_FILE so the commands stay unchanged, swaps in those images, publishes the
# app on a free loopback port instead of 3000 (QURO_QUICKSTART_PORT, default 18087) and turns the
# schedulers off, so nothing calls a price or bank provider. Every container, network and volume
# is removed at the end.
set -eu

REPO=$(cd "$(dirname "$0")/../.." && pwd)
QURO_BACKEND_IMAGE=${QURO_BACKEND_IMAGE:-quro-backend:ci}
QURO_FRONTEND_IMAGE=${QURO_FRONTEND_IMAGE:-quro-frontend:ci}
QURO_QUICKSTART_PORT=${QURO_QUICKSTART_PORT:-18087}
export QURO_BACKEND_IMAGE QURO_FRONTEND_IMAGE QURO_QUICKSTART_PORT
BASE="http://127.0.0.1:$QURO_QUICKSTART_PORT"
WORK=$(mktemp -d)
# Traversable by UID 1000, which owns the configuration files below it on Linux.
chmod 0755 "$WORK"
COMPOSE_PROJECT_NAME="quro-quickstart-$$"
COMPOSE_FILE="compose.yaml:$WORK/quickstart.ci.yaml"
export COMPOSE_PROJECT_NAME COMPOSE_FILE
CODE_PATTERN='[0-9A-Z]{6}(-[0-9A-Z]{6}){3}'

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo >&2 "FAIL: $*"
  exit 1
}
contains() { printf '%s' "$1" | grep -qF -- "$2" || fail "expected output to contain: $2"; }
wait_ready() {
  tries=0
  until curl -fsS "$BASE/api/readiness" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || fail "$BASE did not become ready"
    sleep 1
  done
}

cleanup() {
  status=$?
  if [ -d "$WORK/quro" ]; then
    cd "$WORK/quro"
    if [ "$status" -ne 0 ]; then
      docker compose ps -a 2>/dev/null || true
      docker compose logs --no-color --tail 60 2>/dev/null || true
    fi
    docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  # Files written by UID 1000 may not be removable by the user running this script.
  docker run --rm --user 0:0 -v "$WORK:/work" --entrypoint sh "$QURO_BACKEND_IMAGE" \
    -c 'rm -rf /work/*' >/dev/null 2>&1 || true
  rm -rf "$WORK"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

for pair in "$QURO_BACKEND_IMAGE packages/backend/Dockerfile" \
  "$QURO_FRONTEND_IMAGE packages/frontend/Dockerfile"; do
  # shellcheck disable=SC2086
  set -- $pair
  if ! docker image inspect "$1" >/dev/null 2>&1; then
    step "Building $1"
    docker build -q -f "$REPO/$2" -t "$1" "$REPO" >/dev/null
  fi
done

cat >"$WORK/quickstart.ci.yaml" <<'EOF'
services:
  migrate:
    image: ${QURO_BACKEND_IMAGE:?}
    pull_policy: never
  backend:
    image: ${QURO_BACKEND_IMAGE:?}
    pull_policy: never
    environment:
      QRO_DISABLE_SCHEDULERS: 'true'
  frontend:
    image: ${QURO_FRONTEND_IMAGE:?}
    pull_policy: never
    ports: !override
      - '127.0.0.1:${QURO_QUICKSTART_PORT:?}:80'
EOF

bun "$REPO/scripts/quickstart/commands.ts" quickstart "$QURO_BACKEND_IMAGE" >"$WORK/quickstart.sh"
bun "$REPO/scripts/quickstart/commands.ts" uninstall-keep "$QURO_BACKEND_IMAGE" >"$WORK/keep.sh"
bun "$REPO/scripts/quickstart/commands.ts" uninstall-delete "$QURO_BACKEND_IMAGE" >"$WORK/delete.sh"

step "The README quickstart, as written"
cat "$WORK/quickstart.sh"
cd "$WORK"
started=$(date +%s)
status=0
sh "$WORK/quickstart.sh" </dev/null >"$WORK/first.log" 2>&1 || status=$?
# The setup code is a credential of this throwaway instance; keep it out of the CI log anyway.
sed -E "s/$CODE_PATTERN/<setup code>/g" "$WORK/first.log"
[ "$status" -eq 0 ] || fail "the quickstart commands failed with exit code $status"
echo "Quickstart commands took $(($(date +%s) - started)) s"
code=$(grep -Eo "$CODE_PATTERN" "$WORK/first.log" | head -n 1)
[ -n "$code" ] || fail "the quickstart printed no setup code"
cd "$WORK/quro"

step "The healthy state the README describes"
wait_ready
states=$(docker compose ps --format '{{.Service}} {{.Status}}')
echo "$states"
printf '%s\n' "$states" | grep -Eq '^db Up .*\(healthy\)' || fail "db is not healthy"
printf '%s\n' "$states" | grep -Eq '^backend Up .*\(healthy\)' || fail "backend is not healthy"
printf '%s\n' "$states" | grep -Eq '^frontend Up' || fail "frontend is not up"
if printf '%s\n' "$states" | grep -q '^migrate'; then fail "migrate is still listed as running"; fi
contains "$(docker compose ps -a --format '{{.Service}} {{.Status}}')" "migrate Exited (0)"
readiness=$(curl -fsS "$BASE/api/readiness")
contains "$readiness" '"status":"ready"'
out=$(docker compose run --rm -T migrate doctor)
echo "$out"
contains "$out" "All checks passed."

step "First account with the printed setup code"
bun "$REPO/scripts/clean-install/exercise.ts" setup "$BASE" "$WORK/state.json" "$code"

step "The quickstart again: nothing changes"
cd "$WORK"
sh "$WORK/quickstart.sh" </dev/null >"$WORK/second.log" 2>&1 || {
  sed -E "s/$CODE_PATTERN/<setup code>/g" "$WORK/second.log"
  fail "the second quickstart run failed"
}
contains "$(cat "$WORK/second.log")" "Nothing to do: the configuration directory is complete."
cd "$WORK/quro"
wait_ready
bun "$REPO/scripts/clean-install/exercise.ts" verify "$BASE" "$WORK/state.json"

step "Uninstall, keeping the data (docs/uninstall.md)"
sh "$WORK/keep.sh"
[ -z "$(docker compose ps -a -q)" ] || fail "containers are left after docker compose down"
docker volume inspect "${COMPOSE_PROJECT_NAME}_postgres" >/dev/null || fail "the database volume is gone"
docker compose up -d
wait_ready
bun "$REPO/scripts/clean-install/exercise.ts" verify "$BASE" "$WORK/state.json"

step "Uninstall, deleting the database (docs/uninstall.md)"
sh "$WORK/delete.sh"
if docker volume inspect "${COMPOSE_PROJECT_NAME}_postgres" >/dev/null 2>&1; then
  fail "the database volume is still there"
fi

step "README quickstart passed"
