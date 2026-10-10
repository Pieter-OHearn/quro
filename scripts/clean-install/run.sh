#!/bin/sh
# Clean-install test. Installs Quro from empty directories the way docs/install.md describes,
# with docs/compose.example.yaml, and checks what an operator relies on:
#
#   1. Compose install: `quro init` (dry run, repeat, preserved edits), first start, local sign-in,
#      a ledger write, a document upload and download, maintenance commands, concurrent
#      `quro migrate` runs, restart and stop/start with the data intact.
#   2. Existing PostgreSQL and S3 endpoints with `docker run` only: an owner role without
#      CREATEROLE and a runtime role created by the database administrator, an S3 store, readiness
#      for a schema behind and ahead of the image, an interrupted migration and a restart.
#   3. The image as another UID with a read-only root filesystem.
#
# Upgrades from an earlier release are a separate test: add it next to this one, starting from
# a fixture of that release's data, and reuse wait_ready and exercise.ts.
#
#   QURO_BACKEND_IMAGE=quro-backend:ci QURO_FRONTEND_IMAGE=quro-frontend:ci \
#     sh scripts/clean-install/run.sh
#
# QURO_BACKEND_IMAGE and QURO_FRONTEND_IMAGE are the images under test (built from the checkout
# when missing). QURO_INSTALL_PORT (default 18085) and QURO_INSTALL_API_PORT (default 18086) are
# loopback ports. All data and passwords are synthetic and generated for the run; schedulers are
# off, so nothing calls a price or bank provider. Every container, network and volume is removed
# at the end.
set -eu

REPO=$(cd "$(dirname "$0")/../.." && pwd)
QURO_BACKEND_IMAGE=${QURO_BACKEND_IMAGE:-quro-backend:ci}
QURO_FRONTEND_IMAGE=${QURO_FRONTEND_IMAGE:-quro-frontend:ci}
QURO_INSTALL_PORT=${QURO_INSTALL_PORT:-18085}
API_PORT=${QURO_INSTALL_API_PORT:-18086}
export QURO_BACKEND_IMAGE QURO_FRONTEND_IMAGE QURO_INSTALL_PORT
IMAGE=$QURO_BACKEND_IMAGE
# A test double for an operator's S3-compatible store (Apache-2.0, pinned by digest).
S3_IMAGE=adobe/s3mock:4.11.0@sha256:cd49108c0094bc3f420b24bff354073032a9ec1a6f4cc89f8e8f483a308cf99e
PG_IMAGE=$(sed -n 's/^ *image: *\(postgres:[^ ]*\).*/\1/p' "$REPO/docs/compose.example.yaml" | head -n 1)
RUN="quro-install-$$"
WORK=$(mktemp -d)
# Traversable by UID 1000, which owns the configuration files below it on Linux.
chmod 0755 "$WORK"
INSTALL="$WORK/install"
EXT="$WORK/external"
CODE_PATTERN='[0-9A-Z]{6}(-[0-9A-Z]{6}){3}'

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo >&2 "FAIL: $*"
  exit 1
}
contains() { printf '%s' "$1" | grep -qF -- "$2" || fail "expected output to contain: $2"; }
compose() {
  docker compose -p "$RUN" --project-directory "$INSTALL" \
    -f "$INSTALL/compose.yaml" -f "$INSTALL/compose.ci.yaml" "$@"
}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    compose ps -a 2>/dev/null || true
    compose logs --no-color --tail 60 2>/dev/null || true
    docker logs --tail 60 "$RUN-serve" 2>/dev/null || true
  fi
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$RUN-ext-db" "$RUN-s3" "$RUN-serve" "$RUN-killed" >/dev/null 2>&1 || true
  docker network rm "$RUN-ext" >/dev/null 2>&1 || true
  # Files written by UID 1000 may not be removable by the user running this script.
  docker run --rm --user 0:0 -v "$WORK:/work" --entrypoint sh "$IMAGE" -c 'rm -rf /work/*' \
    >/dev/null 2>&1 || true
  rm -rf "$WORK"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

on_linux_as_other_uid() { [ "$(uname -s)" = Linux ] && [ "$(id -u)" != 1000 ]; }

# The documented preparation: on Linux the backend's UID owns the configuration and documents
# directories (Docker Desktop on macOS does not enforce bind-mount ownership).
prepare_directories() {
  mkdir -p "$1/config" "$1/data/documents"
  if on_linux_as_other_uid; then sudo chown 1000:1000 "$1/config" "$1/data/documents"; fi
}

# Runs a command as the owner of the configuration files, as an operator would with sudo.
as_config_owner() {
  if on_linux_as_other_uid; then sudo -u '#1000' "$@"; else "$@"; fi
}

# Reads a generated secret without printing it, through the image as UID 1000.
read_secret() {
  docker run --rm -v "$1:/config:ro" --entrypoint cat "$IMAGE" "/config/secrets/$2"
}

no_secret_in() {
  for value in $SECRETS; do
    if printf '%s' "$1" | grep -qF -- "$value"; then fail "a generated secret appeared in $2"; fi
  done
}

wait_ready() {
  tries=0
  until curl -fsS "$1/api/readiness" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -le 120 ] || fail "$1 did not become ready"
    sleep 2
  done
}

readiness_reason() {
  curl -sS "$1/api/readiness" | bun -e \
    'const r = await Bun.stdin.json(); console.log(r.checks.schema.reason ?? "ready")'
}

for pair in "$QURO_BACKEND_IMAGE packages/backend/Dockerfile" \
  "$QURO_FRONTEND_IMAGE packages/frontend/Dockerfile"; do
  # shellcheck disable=SC2086
  set -- $pair
  if ! docker image inspect "$1" >/dev/null 2>&1; then
    step "Building $1"
    docker build -q -f "$REPO/$2" -t "$1" "$REPO" >/dev/null
  fi
done
echo "host $(uname -s) $(uname -m), image $(docker image inspect -f '{{.Os}}/{{.Architecture}}' "$IMAGE")"

# ── 1. Compose install ───────────────────────────────────────────────────────

step "Prepare an empty directory with the example Compose file"
mkdir -p "$INSTALL"
cp "$REPO/docs/compose.example.yaml" "$INSTALL/compose.yaml"
cp "$REPO/scripts/clean-install/compose.ci.yaml" "$INSTALL/compose.ci.yaml"
prepare_directories "$INSTALL"
cd "$INSTALL"

step "quro init --dry-run changes nothing"
out=$(docker run --rm -v "$INSTALL/config:/config" "$IMAGE" init --dry-run)
contains "$out" "Would create /config/quro.env."
contains "$out" "Dry run: nothing was changed."
[ -z "$(ls -A config)" ] || fail "the dry run wrote files"

step "quro init writes the settings file and the secrets once"
out=$(docker run --rm -v "$INSTALL/config:/config" "$IMAGE" init)
echo "$out"
contains "$out" "Created /config/quro.env."
contains "$out" "Created /config/secrets/postgres_admin_password (generated, mode 0600; value not shown)."
SECRETS="$(read_secret "$INSTALL/config" postgres_admin_password) $(read_secret "$INSTALL/config" postgres_app_password)"
no_secret_in "$out" "the init output"
out=$(docker run --rm -v "$INSTALL/config:/config" "$IMAGE" init)
contains "$out" "Nothing to do"

step "quro init keeps an edited settings file"
as_config_owner sh -c 'printf "\n# Edited by the operator.\nQRO_REGISTRATION_MODE=invite\n" >> config/quro.env'
before=$(cksum <config/quro.env)
out=$(docker run --rm -v "$INSTALL/config:/config" "$IMAGE" init)
contains "$out" "Kept /config/quro.env (exists; not changed)."
[ "$(cksum <config/quro.env)" = "$before" ] || fail "init changed the edited settings file"

step "docker compose up from empty volumes"
compose up -d
wait_ready "http://127.0.0.1:$QURO_INSTALL_PORT"
[ "$(compose exec -T backend id -u)" = 1000 ] || fail "the backend does not run as UID 1000"
contains "$(compose ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}')" "migrate exited 0"

step "First account, local sign-in, ledger write, document upload and download"
code=$(compose exec -T backend quro user invite | grep -Eo "$CODE_PATTERN" | head -n 1)
[ -n "$code" ] || fail "quro user invite printed no code"
bun "$REPO/scripts/clean-install/exercise.ts" setup "http://127.0.0.1:$QURO_INSTALL_PORT" \
  "$WORK/install-state.json" "$code"
stored=$(compose exec -T backend sh -c 'find /var/lib/quro/documents -name "*.pdf" | wc -l')
[ "$stored" -eq 1 ] || fail "expected one stored document, found $stored"

step "Maintenance entry points"
out=$(compose run --rm -T migrate doctor)
echo "$out"
contains "$out" "All checks passed."
no_secret_in "$out" "doctor output"
compose run --rm -T migrate doctor --json | bun -e \
  'const r = await Bun.stdin.json(); if (r.status !== "ok" || r.exitCode !== 0) process.exit(1)'
out=$(compose run --rm -T migrate migrate --dry-run)
contains "$out" "Dry run: nothing was changed."
out=$(compose run --rm -T migrate migrate)
contains "$out" "No migrations to apply."
contains "$out" "quro_app signs in; apply grants only."
compose exec -T backend quro health
compose exec -T backend quro version --json
compose exec -T backend quro user status
compose exec -T backend quro user list >/dev/null

step "Two quro migrate runs at the same time"
compose run --rm -T migrate migrate >"$WORK/migrate-a.log" 2>&1 &
first=$!
compose run --rm -T migrate migrate >"$WORK/migrate-b.log" 2>&1 &
second=$!
wait "$first" || fail "the first concurrent migrate failed: $(cat "$WORK/migrate-a.log")"
wait "$second" || fail "the second concurrent migrate failed: $(cat "$WORK/migrate-b.log")"

step "Restart keeps the data"
compose restart
wait_ready "http://127.0.0.1:$QURO_INSTALL_PORT"
bun "$REPO/scripts/clean-install/exercise.ts" verify "http://127.0.0.1:$QURO_INSTALL_PORT" \
  "$WORK/install-state.json"

step "Stop and start (docker compose down, then up) keeps the data"
compose down
compose up -d
wait_ready "http://127.0.0.1:$QURO_INSTALL_PORT"
bun "$REPO/scripts/clean-install/exercise.ts" verify "http://127.0.0.1:$QURO_INSTALL_PORT" \
  "$WORK/install-state.json"
no_secret_in "$(compose logs --no-color 2>&1)" "the container logs"
compose down -v

# ── 2. Existing PostgreSQL and S3, without Compose ───────────────────────────

step "Existing PostgreSQL (owner without CREATEROLE) and an S3-compatible store"
docker network create "$RUN-ext" >/dev/null
prepare_directories "$EXT"
docker run --rm -v "$EXT/config:/config" "$IMAGE" init >/dev/null
admin_password=$(read_secret "$EXT/config" postgres_admin_password)
app_password=$(read_secret "$EXT/config" postgres_app_password)
SECRETS="$admin_password $app_password"
as_config_owner sh -c "umask 077 && od -An -tx1 -N24 /dev/urandom | tr -d ' \n' >'$EXT/config/secrets/s3_secret_access_key'"
as_config_owner sed -i.orig \
  -e 's/^POSTGRES_HOST=.*/POSTGRES_HOST=customer-db.internal/' \
  -e 's/^POSTGRES_DB=.*/POSTGRES_DB=finance/' \
  -e 's/^POSTGRES_ADMIN_USER=.*/POSTGRES_ADMIN_USER=finance_owner/' \
  -e 's/^POSTGRES_APP_USER=.*/POSTGRES_APP_USER=finance_app/' \
  -e 's/^QRO_DOCUMENT_STORAGE=.*/QRO_DOCUMENT_STORAGE=s3/' \
  "$EXT/config/quro.env"
as_config_owner sh -c "printf 'S3_ENDPOINT=http://objects.internal:9090\nS3_REGION=us-east-1\nS3_BUCKET=quro-documents\nS3_ACCESS_KEY_ID=install-test\nQRO_DISABLE_SCHEDULERS=true\n' >> '$EXT/config/quro.env'"

od -An -tx1 -N24 /dev/urandom | tr -d ' \n' >"$WORK/superuser_password"
docker run -d --name "$RUN-ext-db" --network "$RUN-ext" --network-alias customer-db.internal \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/superuser \
  -v "$WORK/superuser_password:/run/secrets/superuser:ro" "$PG_IMAGE" >/dev/null
docker run -d --name "$RUN-s3" --network "$RUN-ext" --network-alias objects.internal \
  -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=quro-documents "$S3_IMAGE" >/dev/null
tries=0
until docker exec "$RUN-ext-db" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -le 60 ] || fail "the external database did not start"
  sleep 1
done
# The database administrator's part: an owner without CREATEROLE and a runtime role. The
# passwords come from the files `quro init` generated and reach psql on stdin, not argv.
printf "create role finance_owner login nocreaterole password '%s';\ncreate database finance owner finance_owner;\ncreate role finance_app login password '%s';\n" \
  "$admin_password" "$app_password" |
  docker exec -i "$RUN-ext-db" psql -X -q -v ON_ERROR_STOP=1 -U postgres >/dev/null

psql_ext() { docker exec -i "$RUN-ext-db" psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d finance; }

backend_run() {
  docker run --rm --network "$RUN-ext" --env-file "$EXT/config/quro.env" \
    -v "$EXT/config/secrets/postgres_admin_password:/run/secrets/postgres_admin_password:ro" \
    -v "$EXT/config/secrets/postgres_app_password:/run/secrets/postgres_app_password:ro" \
    -v "$EXT/config/secrets/s3_secret_access_key:/run/secrets/s3_secret_access_key:ro" \
    "$@"
}

step "The server reports a schema behind the image until quro migrate runs"
docker run -d --name "$RUN-serve" --network "$RUN-ext" -p "127.0.0.1:$API_PORT:3000" \
  --env-file "$EXT/config/quro.env" \
  -v "$EXT/config/secrets/postgres_app_password:/run/secrets/postgres_app_password:ro" \
  -v "$EXT/config/secrets/s3_secret_access_key:/run/secrets/s3_secret_access_key:ro" \
  "$IMAGE" >/dev/null
tries=0
until curl -sS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -le 60 ] || fail "the server did not start"
  sleep 1
done
[ "$(readiness_reason "http://127.0.0.1:$API_PORT")" = schema_empty ] || fail "readiness did not report the missing schema"
if docker exec "$RUN-serve" quro health >/dev/null 2>&1; then fail "quro health passed without a schema"; fi

step "quro migrate --dry-run changes nothing"
out=$(backend_run "$IMAGE" migrate --dry-run)
contains "$out" "Runtime role: finance_app signs in; apply grants only."
contains "$out" "Dry run: nothing was changed."
[ "$(echo "select to_regnamespace('drizzle') is null" | psql_ext)" = t ] || fail "the dry run changed the schema"

step "A quro migrate killed part way applies nothing"
# The migrator records each migration after running it, inside one transaction. A SHARE lock on
# the history table lets the run start, then holds it at its first record; the run is killed there.
echo "create schema drizzle authorization finance_owner; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint); alter table drizzle.__drizzle_migrations owner to finance_owner;" | psql_ext
printf 'begin;\nlock table drizzle.__drizzle_migrations in share mode;\nselect pg_sleep(300);\n' | psql_ext >/dev/null 2>&1 &
holder=$!
backend_run -d --name "$RUN-killed" "$IMAGE" migrate >/dev/null
tries=0
blocked=""
while [ -z "$blocked" ]; do
  tries=$((tries + 1))
  [ "$tries" -le 120 ] || fail "the migration never reached its first record"
  sleep 0.5
  blocked=$(echo "select pid from pg_locks where relation = 'drizzle.__drizzle_migrations'::regclass and not granted" | psql_ext)
done
docker kill "$RUN-killed" >/dev/null
echo "select pg_terminate_backend($blocked); select pg_terminate_backend(pid) from pg_stat_activity where query like '%pg_sleep(300)%' and pid <> pg_backend_pid();" | psql_ext >/dev/null
wait "$holder" || true
[ "$(echo "select count(*) from drizzle.__drizzle_migrations" | psql_ext)" = 0 ] || fail "the killed run recorded a migration"
[ "$(echo "select to_regclass('public.users') is null" | psql_ext)" = t ] || fail "the killed run left a table behind"

step "The next quro migrate completes"
out=$(backend_run "$IMAGE" migrate)
echo "$out"
contains "$out" "migration(s): 0000_clumsy_praxagora to "
no_secret_in "$out" "the migrate output"
wait_ready "http://127.0.0.1:$API_PORT"
out=$(backend_run "$IMAGE" doctor)
echo "$out"
contains "$out" "documents: s3: S3 bucket quro-documents at http://objects.internal:9090 is usable."
contains "$out" "All checks passed."

step "Sign-in, ledger and S3 documents through the server"
code=$(docker exec "$RUN-serve" quro user invite | grep -Eo "$CODE_PATTERN" | head -n 1)
bun "$REPO/scripts/clean-install/exercise.ts" setup "http://127.0.0.1:$API_PORT" \
  "$WORK/external-state.json" "$code"
docker restart "$RUN-serve" >/dev/null
wait_ready "http://127.0.0.1:$API_PORT"
bun "$REPO/scripts/clean-install/exercise.ts" verify "http://127.0.0.1:$API_PORT" \
  "$WORK/external-state.json"

step "A schema newer than the image is refused and reported"
echo "insert into drizzle.__drizzle_migrations (hash, created_at) values ('newer-image', 9999999999999);" | psql_ext
[ "$(readiness_reason "http://127.0.0.1:$API_PORT")" = schema_ahead ] || fail "readiness did not report the newer schema"
set +e
out=$(backend_run "$IMAGE" migrate 2>&1)
status=$?
set -e
[ "$status" -eq 3 ] || fail "quro migrate exited $status for a newer schema, expected 3"
contains "$out" "newer than this image"
echo "delete from drizzle.__drizzle_migrations where hash = 'newer-image';" | psql_ext
wait_ready "http://127.0.0.1:$API_PORT"
no_secret_in "$(docker logs "$RUN-serve" 2>&1)" "the server log"

# ── 3. Another UID, read-only root filesystem ────────────────────────────────

step "The image runs as any UID with a read-only root filesystem"
mkdir -p "$WORK/uid/config"
if on_linux_as_other_uid; then sudo chown 12345:12345 "$WORK/uid/config"; fi
docker run --rm --user 12345:12345 --read-only --tmpfs /tmp "$IMAGE" version
docker run --rm --user 12345:12345 --read-only --tmpfs /tmp -v "$WORK/uid/config:/config" "$IMAGE" init >/dev/null
out=$(docker run --rm --user 12345:12345 --read-only --tmpfs /tmp -v "$WORK/uid/config:/config" "$IMAGE" init)
contains "$out" "Nothing to do"

step "Clean install passed"
