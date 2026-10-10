#!/bin/sh
# Upgrade test: takes the synthetic 0.7.0 installation in scripts/upgrade-fixture/v0.7.0 to the
# code in this checkout and checks that nothing was lost or changed beyond what
# scripts/upgrade-fixture/expectations.ts declares (docs/upgrade-fixture.md).
#
#   1. PostgreSQL 16.11 (the 0.7.0 database) loads database.sql; an S3 test double receives the
#      fixture's documents, as the 0.7.0 MinIO bucket held them.
#   2. PostgreSQL 16 to 18 by dump and restore (docs/postgresql-upgrade.md): dump with the old
#      server's own pg_dump, restore with the new server's own pg_restore into an empty database
#      on a new data directory, before any new migration runs. Every table and sequence must be
#      identical across the two majors.
#   3. `quro migrate` from the backend image built from this checkout applies the migrations and
#      the runtime role's grants, as an operator runs it; a second run must change nothing.
#   4. verify.ts compares the upgraded database with the 0.7.0 one and checks every document the
#      rows refer to against the store.
#   5. Self-check: a one-cent change, a removed attachment row and a missing object must each
#      make the comparison fail, so a passing run is not vacuous.
#
# Usage: sh scripts/upgrade-fixture/upgrade.sh
# Needs Docker and Bun with the repository's dependencies installed. No application server is
# started; the containers publish ports on 127.0.0.1 only and hold synthetic data. Every container
# and network it creates is removed on exit.
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
  docker rm -f "$RUN-old" "$RUN-new" "$RUN-s3" >/dev/null 2>&1 || true
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

verify() {
  bun "$HERE/verify.ts" "$1" --fixture "$FIXTURE" --endpoint "$S3_URL" --bucket "$BUCKET" \
    --before "$(url_for "$RUN-old" "$DB")" --after "$(url_for "$RUN-new" "$2")"
}

# expect_failure LABEL DATABASE: the comparison must fail, naming the difference.
expect_failure() {
  if verify compare "$2" >"$WORK/self-check.log" 2>&1; then
    cat "$WORK/self-check.log" >&2
    fail "self-check: $1 was not detected"
  fi
  echo "$1: detected"
  grep '^  - ' "$WORK/self-check.log" | head -n 3
}

# quro ARGS...: the backend image's operator command against the new server, with the settings
# and password files an operator gives it. It runs as the invoking user so the files stay private.
quro() {
  docker run --rm --network "$NET" --user "$(id -u):$(id -g)" \
    -e POSTGRES_HOST="$RUN-new" -e POSTGRES_DB="$DB" \
    -e POSTGRES_ADMIN_USER="$ADMIN_USER" -e POSTGRES_APP_USER="$APP_USER" \
    -e POSTGRES_ADMIN_PASSWORD_FILE=/run/secrets/postgres_admin_password \
    -e POSTGRES_APP_PASSWORD_FILE=/run/secrets/postgres_app_password \
    -e QRO_DISABLE_SCHEDULERS=true \
    -v "$WORK/postgres_admin_password:/run/secrets/postgres_admin_password:ro" \
    -v "$WORK/postgres_app_password:/run/secrets/postgres_app_password:ro" \
    "$IMAGE" "$@"
}

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  step "Building $IMAGE"
  docker build -q -f "$REPO/packages/backend/Dockerfile" -t "$IMAGE" "$REPO" >/dev/null
fi
docker network create "$NET" >/dev/null
(umask 077 && printf '%s' "$ADMIN_PASSWORD" >"$WORK/postgres_admin_password" &&
  printf '%s' "$APP_PASSWORD" >"$WORK/postgres_app_password")

step "PostgreSQL 16 ($PG_OLD_IMAGE) loads the 0.7.0 fixture"
start_server "$RUN-old" "$PG_OLD_IMAGE" /var/lib/postgresql/data
psql_in "$RUN-old" "$DB" <"$FIXTURE/database.sql" >/dev/null
fingerprint "$RUN-old" "$DB" >"$WORK/before.snap"
echo "loaded $(grep -c '^table|' "$WORK/before.snap") tables, $(awk -F'|' '$1 == "table" { n += $3 } END { print n + 0 }' "$WORK/before.snap") rows"

step "The S3 test double receives the fixture's documents"
docker run -d --name "$RUN-s3" -p 127.0.0.1::9090 \
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

step "quro migrate from this checkout's backend image ($IMAGE)"
migrate_out=$(quro migrate)
echo "$migrate_out"
case "$migrate_out" in *'Applied '*) ;; *) fail "quro migrate applied no migration" ;; esac
second_out=$(quro migrate)
case "$second_out" in *'No migrations to apply.'*) ;; *) fail "a second quro migrate was not a no-op: $second_out" ;; esac
echo "a second run changed nothing"

step "Compare the upgraded database and the store with the 0.7.0 fixture"
verify compare "$DB"

step "Self-check: the comparison notices damage"
echo "create database quro_self_check template $DB;" | psql_in "$RUN-new" postgres
echo "update savings_accounts set balance = balance + 0.01 where id = (select min(id) from savings_accounts);" |
  psql_in "$RUN-new" quro_self_check
expect_failure "a one-cent change" quro_self_check
echo "drop database quro_self_check; create database quro_self_check template $DB;" | psql_in "$RUN-new" postgres
echo "delete from payslips where id = (select min(id) from payslips where document_storage_key is not null);" |
  psql_in "$RUN-new" quro_self_check
expect_failure "a removed attachment row" quro_self_check
key=$(sed -n '1s/^[0-9a-f]*  //p' "$FIXTURE/documents.sha256")
bun -e 'const [endpoint, bucket, key] = process.argv.slice(1);
  await new Bun.S3Client({ endpoint, bucket, region: "us-east-1", accessKeyId: "fixture", secretAccessKey: "fixture" }).delete(key);' \
  "$S3_URL" "$BUCKET" "$key"
expect_failure "a missing object" "$DB"
