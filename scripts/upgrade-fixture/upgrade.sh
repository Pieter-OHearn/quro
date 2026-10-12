#!/bin/sh
# Upgrade test: takes the synthetic 0.7.0 installation in scripts/upgrade-fixture/v0.7.0 to the
# code in this checkout the way docs/upgrade.md tells an operator to, injects the failures that
# guide covers, and checks that nothing was lost or changed beyond what
# scripts/upgrade-fixture/expectations.ts declares (docs/upgrade-fixture.md).
#
#   1. PostgreSQL 16.11 (the 0.7.0 database) loads database.sql; an S3 test double receives the
#      fixture's documents, as the 0.7.0 MinIO bucket held them.
#   2. PostgreSQL 16 to 18 by dump and restore: dump with the old server's own pg_dump, restore
#      with the new server's own pg_restore into an empty database on a new data directory,
#      before any new migration runs. Every table and sequence must be identical.
#   3. Before `quro migrate`: the new image's server starts but stays unhealthy (readiness 503,
#      `quro health` 1, Docker health status unhealthy), `quro migrate --status` reports the
#      pending migration, and a 0.7.0-style configuration is refused with exit code 2.
#   4. Failures: a migration that fails, and one killed part way, change nothing; two runs started
#      at once apply the migrations once. A further run changes nothing.
#   5. The server becomes ready without a restart; a schema newer than the image is refused by
#      `quro migrate`, `quro migrate --status` and readiness.
#   6. verify.ts compares the upgraded database with the 0.7.0 one and checks every document the
#      rows refer to against the S3 store.
#   7. `quro documents migrate-from-s3`: a missing object stops it with nothing added; once the
#      object is back it copies everything, and the comparison is repeated against the documents
#      directory.
#   8. Self-check: a one-cent change, a removed attachment row and a missing object must each
#      make the comparison fail, so a passing run is not vacuous.
#   9. On S3 and then on the filesystem store, a browser signed in on 0.7.0 stays signed in, and
#      every user signs in and downloads their documents.
#  10. A document missing from S3 stops `migrate-from-s3` until its attachment is removed in the
#      app, the guide's other way out.
#
# Usage: sh scripts/upgrade-fixture/upgrade.sh
# Needs Docker, curl and Bun with the repository's dependencies installed. Containers publish
# ports on 127.0.0.1 only, hold synthetic data and run with schedulers off, so nothing calls a
# price or bank provider. Every container and network it creates is removed on exit.
#
# Environment:
#   QURO_BACKEND_IMAGE  backend image under test (default quro-backend:ci; built when missing)
#   PG_OLD_IMAGE  the 0.7.0 database (default postgres:16.11-alpine3.23)
#   PG_NEW_IMAGE  the database to upgrade to (default: the db image in docker-compose.yml)
set -eu

REPO=$(cd "$(dirname "$0")/../.." && pwd)
HERE="$REPO/scripts/upgrade-fixture"
FIXTURE="$HERE/v0.7.0"
PG_OLD_IMAGE=${PG_OLD_IMAGE:-postgres:16.11-alpine3.23}
PG_NEW_IMAGE=${PG_NEW_IMAGE:-$(sed -n 's/^ *image: *\(postgres:[^ ]*\) *$/\1/p' "$REPO/docker-compose.yml" | head -n 1)}
[ -n "$PG_NEW_IMAGE" ] || {
  echo >&2 "Could not read the db image from docker-compose.yml"
  exit 1
}
# Same test double as generate.sh (Apache-2.0, pinned by digest).
IMAGE=${QURO_BACKEND_IMAGE:-quro-backend:ci}
S3_IMAGE=adobe/s3mock:4.11.0@sha256:cd49108c0094bc3f420b24bff354073032a9ec1a6f4cc89f8e8f483a308cf99e
DB=quro
ADMIN_USER=quro_admin
APP_USER=quro_app
BUCKET=quro-documents

RUN="quro-upgrade-fixture-$$"
NET="$RUN-net"
WORK=$(mktemp -d)
# Traversable by the containers, which run as the invoking user.
chmod 0755 "$WORK"
DOCUMENTS="$WORK/documents"
# The advisory lock `quro migrate` holds: `quro` in ASCII, then 1 (src/db/migrateDatabase.ts).
MIGRATION_LOCK_CLASS=$(printf '%d' 0x7175726f)
MIGRATION_LOCK_OBJECT=1
FIXTURE_MIGRATION=0038_session_hashes_and_auth_codes
# Throwaway credentials for containers that live for a few minutes on the loopback interface.
ADMIN_PASSWORD=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')
APP_PASSWORD=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')

step() { printf '\n==> %s\n' "$1"; }
fail() {
  echo >&2 "FAIL: $1"
  exit 1
}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    for container in "$RUN-serve" "$RUN-migrate-a" "$RUN-migrate-b"; do
      docker logs --tail 30 "$container" 2>/dev/null || true
    done
  fi
  docker rm -f "$RUN-old" "$RUN-new" "$RUN-s3" "$RUN-serve" "$RUN-killed" "$RUN-migrate-a" \
    "$RUN-migrate-b" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
  if [ "$status" -eq 0 ]; then
    printf '\nPASS: upgrade from the 0.7.0 fixture\n'
  else
    printf >&2 '\nFAIL: upgrade test stopped with status %s\n' "$status"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# start_server NAME IMAGE DATA_DIR: a server on tmpfs, published on a free loopback port.
start_server() {
  docker run -d --name "$1" --network "$NET" -p 127.0.0.1::5432 --tmpfs "$3" \
    -e POSTGRES_USER="$ADMIN_USER" -e POSTGRES_PASSWORD="$ADMIN_PASSWORD" -e POSTGRES_DB="$DB" \
    "$2" >/dev/null
  tries=0
  # The image first runs a temporary server that only listens on its socket, so ask over TCP.
  until docker exec "$1" pg_isready -h 127.0.0.1 -U "$ADMIN_USER" -d "$DB" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || fail "$1 did not become ready"
    sleep 1
  done
  # The runtime role exists before the data arrives, as on an installed system.
  echo "create role $APP_USER login password '$APP_PASSWORD';" | psql_in "$1" "$DB" >/dev/null
}

host_port() { docker port "$1" "$2" | head -n 1 | sed 's/.*://'; }
psql_in() { docker exec -i "$1" psql -X -q -v ON_ERROR_STOP=1 -U "$ADMIN_USER" -d "$2"; }
url_for() { echo "postgres://$ADMIN_USER:$ADMIN_PASSWORD@127.0.0.1:$(host_port "$1" 5432)/$2"; }

# fingerprint CONTAINER DATABASE: the query the upgrade guide has operators run, sorted.
fingerprint() {
  docker exec -i "$1" psql -X -q -At -U "$ADMIN_USER" -d "$2" <"$REPO/scripts/pg-table-fingerprint.sql" | LC_ALL=C sort
}

# compare DATABASE [--documents-dir DIR]: verify.ts against the 0.7.0 database and DATABASE on
# the new server, with the documents in S3 or in DIR.
compare() {
  database=$1
  shift
  BEFORE_DATABASE_URL=$(url_for "$RUN-old" "$DB") AFTER_DATABASE_URL=$(url_for "$RUN-new" "$database") \
    bun "$HERE/verify.ts" compare --fixture "$FIXTURE" --endpoint "$S3_URL" --bucket "$BUCKET" "$@"
}

# expect_failure LABEL DATABASE EXPECTED: the comparison must run to the end and report a
# difference containing EXPECTED; failing for any other reason does not count.
expect_failure() {
  if compare "$2" >"$WORK/self-check.log" 2>&1; then
    cat "$WORK/self-check.log" >&2
    fail "self-check: $1 was not detected"
  fi
  if ! grep -q 'difference(s):' "$WORK/self-check.log" || ! grep -qF -- "$3" "$WORK/self-check.log"; then
    cat "$WORK/self-check.log" >&2
    fail "self-check: $1 did not produce the expected difference ($3)"
  fi
  echo "$1: detected"
  grep '^  - ' "$WORK/self-check.log" | head -n 3
}

contains() { printf '%s' "$1" | grep -qF -- "$2" || fail "expected the output to contain: $2"; }

# The settings and password files an operator gives the backend image, for the new server. The
# containers run as the invoking user so the files stay private; the paths come from mktemp and
# hold no spaces.
QURO_ENV="-e POSTGRES_HOST=$RUN-new -e POSTGRES_DB=$DB -e POSTGRES_ADMIN_USER=$ADMIN_USER
  -e POSTGRES_APP_USER=$APP_USER -e POSTGRES_ADMIN_PASSWORD_FILE=/run/secrets/postgres_admin_password
  -e POSTGRES_APP_PASSWORD_FILE=/run/secrets/postgres_app_password -e QRO_DISABLE_SCHEDULERS=true
  -v $WORK/postgres_admin_password:/run/secrets/postgres_admin_password:ro
  -v $WORK/postgres_app_password:/run/secrets/postgres_app_password:ro
  -v $WORK/s3_secret_access_key:/run/secrets/s3_secret_access_key:ro
  -v $DOCUMENTS:/var/lib/quro/documents"
# Documents in the 0.7.0 bucket, read through the S3 API, as an install that keeps S3 has them.
S3_ENV="-e QRO_DOCUMENT_STORAGE=s3 -e S3_ENDPOINT=http://$RUN-s3:9090 -e S3_REGION=us-east-1
  -e S3_BUCKET=$BUCKET -e S3_ACCESS_KEY_ID=fixture"
FILESYSTEM_ENV="-e QRO_DOCUMENT_STORAGE=filesystem"

# quro ARGS...: the backend image's operator command against the new server.
quro() {
  # shellcheck disable=SC2086
  docker run --rm --network "$NET" --user "$(id -u):$(id -g)" $QURO_ENV "$IMAGE" "$@"
}

# quro_s3 ARGS...: the same, with the documents still in S3.
quro_s3() {
  # shellcheck disable=SC2086
  docker run --rm --network "$NET" --user "$(id -u):$(id -g)" $QURO_ENV $S3_ENV "$IMAGE" "$@"
}

# quro_detached NAME ARGS...: a `quro` command left running in the background.
quro_detached() {
  name=$1
  shift
  # shellcheck disable=SC2086
  docker run -d --name "$name" --network "$NET" --user "$(id -u):$(id -g)" $QURO_ENV "$IMAGE" "$@" >/dev/null
}

# expect_exit CODE COMMAND...: runs the command, keeps its output in $out and requires the code.
expect_exit() {
  expected=$1
  shift
  set +e
  out=$("$@" 2>&1)
  got=$?
  set -e
  if [ "$got" -ne "$expected" ]; then
    echo "$out" >&2
    fail "$* exited $got, expected $expected"
  fi
}

# serve STORAGE_SETTINGS: the new image's server with the example Compose file's health check
# (at a shorter interval), published on a free loopback port.
serve() {
  docker rm -f "$RUN-serve" >/dev/null 2>&1 || true
  # shellcheck disable=SC2086
  docker run -d --name "$RUN-serve" --network "$NET" --user "$(id -u):$(id -g)" -p 127.0.0.1::3000 \
    --health-cmd 'quro health' --health-interval 2s --health-timeout 6s --health-retries 2 \
    $QURO_ENV $1 "$IMAGE" serve >/dev/null
  API="http://127.0.0.1:$(host_port "$RUN-serve" 3000)"
  tries=0
  until curl -fsS "$API/api/health" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || fail "the server did not start"
    sleep 1
  done
}

readiness() { curl -sS "$API/api/readiness"; }
# ready, or the reason of the first failing check.
readiness_reason() {
  readiness | bun -e 'const r = await Bun.stdin.json();
    const failing = Object.values(r.checks).find((check) => !check.ready);
    console.log(failing ? failing.reason : "ready")'
}
wait_ready() {
  tries=0
  until [ "$(readiness_reason)" = ready ]; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || fail "the server did not become ready: $(readiness)"
    sleep 1
  done
}
health_status() { docker inspect -f '{{.State.Health.Status}}' "$RUN-serve"; }
wait_health() {
  tries=0
  until [ "$(health_status)" = "$1" ]; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || fail "the container's health status did not become $1"
    sleep 1
  done
}
# json_field PATH: one field of the JSON object on standard input, as JSON.
json_field() { bun -e "const r = await Bun.stdin.json(); console.log(JSON.stringify(r.$1))"; }

exercise() {
  AFTER_DATABASE_URL=$(url_for "$RUN-new" "$DB") bun "$HERE/exercise.ts" "$@"
}

# sql_new SQL: one statement in the new database as the owner role, unaligned output.
sql_new() { echo "$1" | docker exec -i "$RUN-new" psql -X -q -At -v ON_ERROR_STOP=1 -U "$ADMIN_USER" -d "$DB"; }

# hold SQL: keeps a session open in the background that runs SQL and then sleeps; release ends it.
hold() {
  printf '%s\nselect pg_sleep(300);\n' "$1" |
    docker exec -i "$RUN-new" psql -X -q -U "$ADMIN_USER" -d "$DB" >/dev/null 2>&1 &
  holder=$!
}
release() {
  sql_new "select pg_terminate_backend(pid) from pg_stat_activity where query like '%pg_sleep(300)%' and pid <> pg_backend_pid();" >/dev/null
  wait "$holder" || true
}
# wait_for SQL VALUE WHAT: polls until SQL returns VALUE.
wait_for() {
  tries=0
  until [ "$(sql_new "$1")" = "$2" ]; do
    tries=$((tries + 1))
    [ "$tries" -le 120 ] || fail "timed out waiting for $3"
    sleep 0.5
  done
}

s3_object() {
  bun -e 'const [action, endpoint, bucket, key, path] = process.argv.slice(1);
    const client = new Bun.S3Client({ endpoint, bucket, region: "us-east-1", accessKeyId: "fixture", secretAccessKey: "fixture" });
    if (action === "delete") await client.delete(key); else await client.write(key, Bun.file(path));' \
    "$1" "$S3_URL" "$BUCKET" "$2" "$FIXTURE/documents/$2"
}
stored_documents() { find "$DOCUMENTS" -name '*.pdf' -not -path '*/.*' | wc -l | tr -d ' '; }

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  step "Building $IMAGE"
  docker build -q -f "$REPO/packages/backend/Dockerfile" -t "$IMAGE" "$REPO" >/dev/null
fi
docker network create "$NET" >/dev/null
(umask 077 && printf '%s' "$ADMIN_PASSWORD" >"$WORK/postgres_admin_password" &&
  printf '%s' "$APP_PASSWORD" >"$WORK/postgres_app_password" &&
  printf 'fixture' >"$WORK/s3_secret_access_key")
mkdir -m 0700 "$DOCUMENTS"

step "PostgreSQL 16 ($PG_OLD_IMAGE) loads the 0.7.0 fixture"
start_server "$RUN-old" "$PG_OLD_IMAGE" /var/lib/postgresql/data
psql_in "$RUN-old" "$DB" <"$FIXTURE/database.sql" >/dev/null
fingerprint "$RUN-old" "$DB" >"$WORK/before.snap"
echo "loaded $(grep -c '^table|' "$WORK/before.snap") tables, $(awk -F'|' '$1 == "table" { n += $3 } END { print n + 0 }' "$WORK/before.snap") rows"

step "The S3 test double receives the fixture's documents"
docker run -d --name "$RUN-s3" --network "$NET" -p 127.0.0.1::9090 \
  -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS="$BUCKET" "$S3_IMAGE" >/dev/null
tries=0
until docker logs "$RUN-s3" 2>&1 | grep -q 'Started S3MockApplication'; do
  tries=$((tries + 1))
  [ "$tries" -le 90 ] || fail "the S3 test double did not start"
  sleep 1
done
S3_URL="http://127.0.0.1:$(host_port "$RUN-s3" 9090)"
bun "$HERE/verify.ts" load-store --fixture "$FIXTURE" --endpoint "$S3_URL" --bucket "$BUCKET"

step "Dump with the 16 server's own pg_dump"
docker exec "$RUN-old" pg_dump -U "$ADMIN_USER" -d "$DB" --format=custom >"$WORK/before-upgrade.dump"
# A pipe would hide a failing pg_dump; the archive must also be readable.
docker exec -i "$RUN-old" pg_restore --list <"$WORK/before-upgrade.dump" >/dev/null || fail "the dump is not a readable archive"
echo "dump written: $(wc -c <"$WORK/before-upgrade.dump" | tr -d ' ') bytes"

step "PostgreSQL 18 ($PG_NEW_IMAGE) on a new data directory, restored with its own pg_restore"
start_server "$RUN-new" "$PG_NEW_IMAGE" /var/lib/postgresql
major=$(docker exec "$RUN-new" psql -X -At -U "$ADMIN_USER" -d "$DB" -c "select current_setting('server_version_num')::int / 10000")
[ "$major" -ge 18 ] || fail "expected PostgreSQL 18 or later, got $major"
docker exec -i "$RUN-new" pg_restore -U "$ADMIN_USER" -d "$DB" --exit-on-error <"$WORK/before-upgrade.dump"
fingerprint "$RUN-new" "$DB" >"$WORK/restored.snap"
if ! diff "$WORK/before.snap" "$WORK/restored.snap"; then fail "the restore on $major differs from the 16 database"; fi
echo "identical on PostgreSQL $major before migrating"

step "Before quro migrate: the new image starts, is not ready and says why"
serve "$S3_ENV"
reason=$(readiness_reason)
# The 0.7.0 runtime role cannot read the migration history until `quro migrate` grants it.
case "$reason" in schema_unreadable | schema_behind) ;; *) fail "readiness reported $reason before quro migrate" ;; esac
echo "GET /api/health 200; GET /api/readiness 503 ($reason)"
expect_exit 1 docker exec "$RUN-serve" quro health
echo "quro health (exit 1): $out"
wait_health unhealthy
echo "Docker health status: unhealthy"
expect_exit 1 quro migrate --status --json
[ "$(printf '%s' "$out" | json_field status)" = '"behind"' ] || fail "migrate --status: $out"
[ "$(printf '%s' "$out" | json_field pending)" = "[\"$FIXTURE_MIGRATION\"]" ] || fail "migrate --status: $out"
echo "quro migrate --status (exit 1): behind, pending $FIXTURE_MIGRATION"

step "A configuration written for 0.7.0 is refused before anything starts"
expect_exit 2 docker run --rm --network "$NET" -e POSTGRES_DB="$DB" -e POSTGRES_APP_USER="$APP_USER" \
  -e MINIO_APP_USER=quro_app -e S3_ENDPOINT=http://minio:9000 -e S3_BUCKET="$BUCKET" "$IMAGE" serve
echo "$out"
contains "$out" "POSTGRES_HOST"
contains "$out" "QRO_DOCUMENT_STORAGE"
contains "$out" "MINIO_APP_USER"
expect_exit 2 docker run --rm "$IMAGE" bun run start
# shellcheck disable=SC2016
contains "$out" 'entry point is now `quro`'
echo "a 0.7.0 command (bun run start), exit 2: $(echo "$out" | head -n 1)"

step "A migration that fails changes nothing"
sql_new "create table public.auth_codes (id integer);"
expect_exit 1 quro migrate
echo "$out" | tail -n 1
contains "$out" 'relation "auth_codes" already exists'
contains "$out" "none from this run was recorded"
sql_new "drop table public.auth_codes;"
fingerprint "$RUN-new" "$DB" >"$WORK/after-failure.snap"
diff "$WORK/restored.snap" "$WORK/after-failure.snap" || fail "the failed migration changed the database"
echo "database unchanged"

step "A quro migrate killed part way changes nothing"
# The migrator records each migration after running it, inside one transaction. A SHARE lock on
# the history table lets the run apply the migration, then holds it at its record: it is killed
# there.
hold "begin; lock table drizzle.__drizzle_migrations in share mode;"
quro_detached "$RUN-killed" migrate
wait_for "select count(*) from pg_locks where relation = 'drizzle.__drizzle_migrations'::regclass and not granted" 1 \
  "the migration to reach its record"
docker kill "$RUN-killed" >/dev/null
sql_new "select pg_terminate_backend(pid) from pg_locks where relation = 'drizzle.__drizzle_migrations'::regclass and not granted;" >/dev/null
release
docker rm "$RUN-killed" >/dev/null
fingerprint "$RUN-new" "$DB" >"$WORK/after-kill.snap"
diff "$WORK/restored.snap" "$WORK/after-kill.snap" || fail "the killed migration changed the database"
echo "killed while recording $FIXTURE_MIGRATION; database unchanged"

step "Two quro migrate runs at once: one applies the migration, the other waits and changes nothing"
# The test holds the lock first, so both runs are certainly waiting at the same time.
hold "select pg_advisory_lock($MIGRATION_LOCK_CLASS, $MIGRATION_LOCK_OBJECT);"
wait_for "select count(*) from pg_locks where locktype = 'advisory' and granted and classid = $MIGRATION_LOCK_CLASS and objid = $MIGRATION_LOCK_OBJECT" 1 \
  "the test to hold the migration lock"
quro_detached "$RUN-migrate-a" migrate
quro_detached "$RUN-migrate-b" migrate
wait_for "select count(*) from pg_locks where locktype = 'advisory' and not granted and classid = $MIGRATION_LOCK_CLASS and objid = $MIGRATION_LOCK_OBJECT" 2 \
  "two waiting runs"
release
for run in a b; do
  [ "$(docker wait "$RUN-migrate-$run")" = 0 ] || fail "concurrent run $run failed: $(docker logs "$RUN-migrate-$run" 2>&1)"
  docker logs "$RUN-migrate-$run" >"$WORK/migrate-$run.log" 2>&1
  docker rm "$RUN-migrate-$run" >/dev/null
done
cat "$WORK/migrate-a.log"
[ "$(cat "$WORK/migrate-a.log" "$WORK/migrate-b.log" | grep -c "^Applied 1 migration(s): $FIXTURE_MIGRATION.")" = 1 ] ||
  fail "the migration was not applied exactly once"
[ "$(cat "$WORK/migrate-a.log" "$WORK/migrate-b.log" | grep -c '^No migrations to apply.')" = 1 ] ||
  fail "the waiting run did not find the work done"
[ "$(cat "$WORK/migrate-a.log" "$WORK/migrate-b.log" | grep -c 'waiting for it to finish')" = 2 ] ||
  fail "the runs did not wait for the lock"
echo "both runs exited 0; the migration was applied once"
second_out=$(quro migrate)
case "$second_out" in *'No migrations to apply.'*) ;; *) fail "a further quro migrate was not a no-op: $second_out" ;; esac
echo "a further run changed nothing"

step "The server becomes ready without a restart"
wait_ready
wait_health healthy
docker exec "$RUN-serve" quro health
out=$(quro migrate --status --json)
[ "$(printf '%s' "$out" | json_field status)" = '"current"' ] || fail "migrate --status: $out"
echo "readiness 200, Docker health status healthy, quro migrate --status (exit 0): current"

step "A schema newer than the image is refused"
sql_new "insert into drizzle.__drizzle_migrations (hash, created_at) values ('newer-image', 9999999999999);"
expect_exit 3 quro migrate --status
contains "$out" "Status: ahead."
expect_exit 3 quro migrate
contains "$out" "newer than this image"
[ "$(readiness_reason)" = schema_ahead ] || fail "readiness did not report the newer schema"
expect_exit 1 docker exec "$RUN-serve" quro health
echo "quro migrate --status 3, quro migrate 3, readiness schema_ahead, quro health 1"
sql_new "delete from drizzle.__drizzle_migrations where hash = 'newer-image';"
wait_ready
# As the guide says: stop the server while the documents are copied.
docker rm -f "$RUN-serve" >/dev/null

step "Compare the upgraded database and the S3 store with the 0.7.0 fixture"
compare "$DB"

step "quro documents migrate-from-s3: a missing object stops it, and nothing is added"
missing=$(grep -o 'users/2/salary/payslips/[^ ]*' "$FIXTURE/documents.sha256")
s3_object delete "$missing"
expect_exit 1 quro_s3 documents migrate-from-s3
echo "$out" | tail -n 3
contains "$out" "$missing"
contains "$out" "missing from S3"
[ "$(stored_documents)" = 0 ] || fail "a failed migrate-from-s3 added documents"
echo "exit 1; nothing added to the documents directory"

step "With the object put back, it copies every document"
s3_object write "$missing"
out=$(quro_s3 documents migrate-from-s3)
echo "$out" | tail -n 3
contains "$out" "Every needed document is in /var/lib/quro/documents."
[ ! -e "$DOCUMENTS/.migrate-from-s3" ] || fail "the staging directory was left behind"
echo "$(stored_documents) documents in the documents directory"

step "Compare the upgraded database and the documents directory with the 0.7.0 fixture"
compare "$DB" --documents-dir "$DOCUMENTS"

step "Self-check: the comparison notices damage"
echo "create database quro_self_check template $DB;" | psql_in "$RUN-new" postgres
echo "update savings_accounts set balance = balance + 0.01 where id = (select min(id) from savings_accounts);" |
  psql_in "$RUN-new" quro_self_check
expect_failure "a one-cent change" quro_self_check "public.savings_accounts: row contents differ"
echo "drop database quro_self_check; create database quro_self_check template $DB;" | psql_in "$RUN-new" postgres
echo "delete from payslips where id = (select min(id) from payslips where document_storage_key is not null);" |
  psql_in "$RUN-new" quro_self_check
expect_failure "a removed attachment row" quro_self_check "no longer refers to its document"
echo "drop database quro_self_check;" | psql_in "$RUN-new" postgres
key=$(sed -n '1s/^[0-9a-f]*  //p' "$FIXTURE/documents.sha256")
s3_object delete "$key"
expect_failure "a missing object" "$DB" "$key): not in the store"
s3_object write "$key"

# Signing in changes the sessions table, so the server checks come after every comparison.
step "Browsers stay signed in; users sign in and download their documents (S3 storage)"
serve "$S3_ENV"
wait_ready
exercise check "$API" --fixture "$FIXTURE"

step "The same on the filesystem store"
serve "$FILESYSTEM_ENV"
wait_ready
exercise check "$API" --fixture "$FIXTURE"

step "A document missing from S3: remove its attachment in the app, and migrate-from-s3 passes"
# The object is gone from S3 and the documents directory does not have it either, as on an install
# that has not copied its documents yet.
s3_object delete "$key"
rm "${DOCUMENTS:?}/${key:?}"
expect_exit 1 quro_s3 documents migrate-from-s3
contains "$out" "$key"
contains "$out" "missing from S3"
echo "migrate-from-s3: exit 1, $key missing from S3"
row=$(sql_new "select id from pension_transactions where document_storage_key = '$key'")
[ -n "$row" ] || fail "no pension transaction refers to $key"
serve "$S3_ENV"
wait_ready
exercise remove-document "$API" pension_transactions "$row"
out=$(quro_s3 documents migrate-from-s3)
contains "$out" "Every needed document is in /var/lib/quro/documents."
echo "migrate-from-s3 passes once the attachment is removed"
