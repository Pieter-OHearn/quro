#!/bin/sh
# Rehearses the PostgreSQL 16 to 18 upgrade documented in docs/postgresql-upgrade.md on a
# throwaway stack: synthetic data only, private Docker network, no published ports, nothing
# outside the Docker resources it creates (all removed on exit).
#
#   1. PostgreSQL 16 on its own volume holds the synthetic 0.7.0 installation from
#      scripts/upgrade-fixture/v0.7.0 (docs/upgrade-fixture.md): the data a 16 install has.
#   2. Row counts and a content checksum per table are recorded.
#   3. The database is dumped with the old server's own pg_dump (the documented step).
#   4. PostgreSQL 18 starts on a NEW volume, and the backend image's `db:restore` loads the dump
#      into the empty database. Counts and checksums must match step 2. Then `quro migrate`.
#   5. The backend image's `db:backup` dumps the 18 server and `db:restore` loads that into a
#      second, empty database on 18: the round trip with the shipped client tools.
#   6. The 16 volume must be untouched: 18 refuses to start on it, and 16 still starts on it
#      with the same counts and checksums.
#
# Usage: sh scripts/rehearse-pg-upgrade.sh
# Environment:
#   QURO_BACKEND_IMAGE  backend image to test (default quro-backend:ci; built when missing)
#   PG_OLD_IMAGE        server image to upgrade from (default postgres:16.11-alpine3.23)
#   PG_NEW_IMAGE        server image to upgrade to (default: the db image in docker-compose.yml)
set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

IMAGE=${QURO_BACKEND_IMAGE:-quro-backend:ci}
PG_OLD_IMAGE=${PG_OLD_IMAGE:-postgres:16.11-alpine3.23}
PG_NEW_IMAGE=${PG_NEW_IMAGE:-$(sed -n 's/^ *image: *\(postgres:[^ ]*\) *$/\1/p' docker-compose.yml | head -n 1)}
[ -n "$PG_NEW_IMAGE" ] || { echo >&2 "Could not read the db image from docker-compose.yml"; exit 1; }

RUN="quro-rehearsal-$$"
NET="$RUN-net"
V_OLD="$RUN-pg-old"
V_NEW="$RUN-pg-new"
# Mounted at the image's backup directory, which belongs to the image's unprivileged user.
V_DUMPS="$RUN-dumps"
# The documents directory every backend container mounts; `db:backup` archives it.
V_DOCUMENTS="$RUN-documents"
WORK=$(mktemp -d)
ADMIN_USER=quro_admin
APP_USER=quro_app
DB=quro
# Throwaway credentials for containers that exist for a few minutes on a private network.
ADMIN_PASSWORD=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')
APP_PASSWORD=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')

step() { printf '\n==> %s\n' "$1"; }
fail() { echo >&2 "FAIL: $1"; exit 1; }

cleanup() {
  status=$?
  docker rm -f "$RUN-old" "$RUN-new" "$RUN-old-again" "$RUN-refuse" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker volume rm "$V_OLD" "$V_NEW" "$V_DUMPS" "$V_DOCUMENTS" >/dev/null 2>&1 || true
  rm -rf "$WORK"
  if [ "$status" -eq 0 ]; then echo; echo "PASS: PostgreSQL upgrade rehearsal"; else echo >&2; echo >&2 "FAIL: rehearsal stopped with status $status"; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  step "Building $IMAGE"
  docker build -q -f packages/backend/Dockerfile -t "$IMAGE" . >/dev/null
fi

docker network create "$NET" >/dev/null
docker volume create "$V_OLD" >/dev/null
docker volume create "$V_NEW" >/dev/null
docker volume create "$V_DUMPS" >/dev/null
docker volume create "$V_DOCUMENTS" >/dev/null

# start_server NAME IMAGE VOLUME MOUNT_PATH
start_server() {
  docker run -d --name "$1" --network "$NET" --network-alias "$1" \
    -e POSTGRES_USER="$ADMIN_USER" -e POSTGRES_PASSWORD="$ADMIN_PASSWORD" -e POSTGRES_DB="$DB" \
    -v "$3:$4" "$2" >/dev/null
  # The image first runs a temporary server that only listens on its socket, so ask over TCP.
  tries=0
  until docker exec "$1" pg_isready -h 127.0.0.1 -U "$ADMIN_USER" -d "$DB" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || fail "$1 did not become ready"
    sleep 1
  done
}

# backend HOST DATABASE COMMAND...: runs a backend package script from the image against HOST.
backend() {
  host=$1
  database=$2
  shift 2
  admin_url="postgres://$ADMIN_USER:$ADMIN_PASSWORD@$host:5432/$database"
  app_url="postgres://$APP_USER:$APP_PASSWORD@$host:5432/$database"
  docker run --rm --network "$NET" -v "$V_DUMPS:/var/lib/quro/backups" -v "$V_DOCUMENTS:/var/lib/quro/documents" \
    -e ADMIN_DATABASE_URL="$admin_url" -e APP_DATABASE_URL="$app_url" -e DATABASE_URL="$app_url" \
    -e QRO_DISABLE_SCHEDULERS=true -e QRO_RESTORE_CONFIRM=restore-db \
    --entrypoint bun "$IMAGE" run "$@"
}

# quro_migrate HOST DATABASE: the image's `quro migrate` against HOST, as an operator runs it.
quro_migrate() {
  admin_url="postgres://$ADMIN_USER:$ADMIN_PASSWORD@$1:5432/$2"
  app_url="postgres://$APP_USER:$APP_PASSWORD@$1:5432/$2"
  docker run --rm --network "$NET" -e ADMIN_DATABASE_URL="$admin_url" -e APP_DATABASE_URL="$app_url" \
    -e DATABASE_URL="$app_url" "$IMAGE" migrate >/dev/null
}

# snapshot CONTAINER DATABASE: the sorted output of scripts/pg-table-fingerprint.sql, the same
# query the upgrade guide has operators run.
snapshot() {
  docker exec -i "$1" psql -X -q -At -U "$ADMIN_USER" -d "$2" <scripts/pg-table-fingerprint.sql | LC_ALL=C sort
}

# same_snapshot LABEL EXPECTED_FILE ACTUAL_FILE
same_snapshot() {
  if diff "$2" "$3" >"$WORK/diff.txt"; then
    echo "$1: identical ($(grep -c '^table|' "$3") tables, $(awk -F'|' '$1 == "table" { n += $3 } END { print n + 0 }' "$3") rows)"
  else
    cat "$WORK/diff.txt" >&2
    fail "$1: counts or checksums differ"
  fi
}

step "PostgreSQL 16 ($PG_OLD_IMAGE) with the synthetic 0.7.0 installation"
start_server "$RUN-old" "$PG_OLD_IMAGE" "$V_OLD" /var/lib/postgresql/data
# The runtime role exists before the data arrives, as on an installed system.
echo "create role $APP_USER login password '$APP_PASSWORD';" |
  docker exec -i "$RUN-old" psql -X -q -v ON_ERROR_STOP=1 -U "$ADMIN_USER" -d "$DB" >/dev/null
docker exec -i "$RUN-old" psql -X -q -v ON_ERROR_STOP=1 -U "$ADMIN_USER" -d "$DB" \
  <scripts/upgrade-fixture/v0.7.0/database.sql >/dev/null
snapshot "$RUN-old" "$DB" >"$WORK/before.snap"
tables=$(grep -c '^table|' "$WORK/before.snap")
rows=$(awk -F'|' '$1 == "table" { n += $3 } END { print n + 0 }' "$WORK/before.snap")
echo "recorded $tables tables and $rows rows"
[ "$rows" -gt 0 ] || fail "the fixture loaded no rows"

step "Dump with the old server's own pg_dump"
docker exec "$RUN-old" pg_dump -U "$ADMIN_USER" -d "$DB" --format=custom \
  | docker run --rm -i -v "$V_DUMPS:/var/lib/quro/backups" --entrypoint sh "$IMAGE" -c 'cat > /var/lib/quro/backups/before-upgrade.dump'
dump_bytes=$(docker run --rm -v "$V_DUMPS:/var/lib/quro/backups" --entrypoint sh "$IMAGE" -c 'wc -c < /var/lib/quro/backups/before-upgrade.dump')
[ "$dump_bytes" -gt 1000 ] || fail "the dump is empty or truncated ($dump_bytes bytes)"
# The pipe above hides a failing pg_dump, so also require a readable archive.
docker run --rm -v "$V_DUMPS:/var/lib/quro/backups" --entrypoint pg_restore "$IMAGE" --list /var/lib/quro/backups/before-upgrade.dump >/dev/null \
  || fail "the dump is not a readable archive"
echo "dump written: $dump_bytes bytes"

step "The backend image's tools can also dump the 16 server (client 18 >= server 16)"
backend "$RUN-old" "$DB" db:backup -- --output /var/lib/quro/backups/from-16-with-new-tools.dump >/dev/null

step "Stop 16 and check that $PG_NEW_IMAGE refuses its data directory"
docker stop "$RUN-old" >/dev/null
docker rm "$RUN-old" >/dev/null
for mount in /var/lib/postgresql/data /var/lib/postgresql; do
  # Detached, so a server that does start is reported instead of blocking the run.
  docker run -d --name "$RUN-refuse" -e POSTGRES_PASSWORD=unused -v "$V_OLD:$mount" "$PG_NEW_IMAGE" >/dev/null
  tries=0
  while [ "$(docker inspect -f '{{.State.Running}}' "$RUN-refuse")" = "true" ]; do
    tries=$((tries + 1))
    [ "$tries" -le 30 ] || fail "$PG_NEW_IMAGE kept running on the 16 data directory mounted at $mount"
    sleep 1
  done
  refused_status=$(docker inspect -f '{{.State.ExitCode}}' "$RUN-refuse")
  [ "$refused_status" != "0" ] || fail "$PG_NEW_IMAGE exited cleanly on the 16 data directory mounted at $mount"
  echo "refused at $mount (exit status $refused_status)"
  docker rm "$RUN-refuse" >/dev/null
done
old_major=$(docker run --rm --entrypoint cat -v "$V_OLD:/old" "$PG_OLD_IMAGE" /old/PG_VERSION)
[ "$old_major" = "16" ] || fail "the 16 data directory changed (PG_VERSION=$old_major)"

step "PostgreSQL 18 ($PG_NEW_IMAGE) on a new data directory"
start_server "$RUN-new" "$PG_NEW_IMAGE" "$V_NEW" /var/lib/postgresql
server_major=$(docker exec "$RUN-new" psql -X -At -U "$ADMIN_USER" -d "$DB" -c "select current_setting('server_version_num')::int / 10000")
checksums=$(docker exec "$RUN-new" psql -X -At -U "$ADMIN_USER" -d "$DB" -c 'show data_checksums')
echo "server major $server_major, data_checksums=$checksums"
[ "$server_major" -ge 18 ] || fail "expected PostgreSQL 18 or later, got $server_major"
[ "$checksums" = "on" ] || fail "data checksums are $checksums on the new cluster"

step "Restore the old dump into the empty database with the image's tools, compare, migrate"
# Restore first: the new release's migrations run on the restored data, never before it.
backend "$RUN-new" "$DB" db:restore -- /var/lib/quro/backups/before-upgrade.dump >/dev/null
snapshot "$RUN-new" "$DB" >"$WORK/after.snap"
same_snapshot "16 -> 18" "$WORK/before.snap" "$WORK/after.snap"
quro_migrate "$RUN-new" "$DB"
snapshot "$RUN-new" "$DB" >"$WORK/migrated.snap"
echo "quro migrate applied the migrations newer than the dump"

step "Round trip on 18: db:backup, then db:restore into a second, empty database"
backend "$RUN-new" "$DB" db:backup -- --output /var/lib/quro/backups/round-trip.dump >/dev/null
docker exec "$RUN-new" psql -X -q -U "$ADMIN_USER" -d postgres -c 'create database quro_roundtrip' >/dev/null
backend "$RUN-new" quro_roundtrip db:restore -- /var/lib/quro/backups/round-trip.dump >/dev/null
snapshot "$RUN-new" quro_roundtrip >"$WORK/roundtrip.snap"
same_snapshot "18 -> 18 round trip" "$WORK/migrated.snap" "$WORK/roundtrip.snap"

step "Self-check: the comparison notices a one-cent change"
docker exec "$RUN-new" psql -X -q -U "$ADMIN_USER" -d quro_roundtrip \
  -c "update savings_accounts set balance = balance + 0.01 where id = (select min(id) from savings_accounts)" >/dev/null
snapshot "$RUN-new" quro_roundtrip >"$WORK/mutated.snap"
if diff -q "$WORK/migrated.snap" "$WORK/mutated.snap" >/dev/null; then
  fail "a one-cent change did not change the snapshot"
fi
echo "detected"

step "The old data directory is still intact and still starts"
start_server "$RUN-old-again" "$PG_OLD_IMAGE" "$V_OLD" /var/lib/postgresql/data
snapshot "$RUN-old-again" "$DB" >"$WORK/old-again.snap"
same_snapshot "old 16 directory" "$WORK/before.snap" "$WORK/old-again.snap"
