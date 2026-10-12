#!/bin/sh
# Builds the synthetic 0.7.0 installation that the upgrade test starts from, and writes it to
# scripts/upgrade-fixture/v0.7.0 (see docs/upgrade-fixture.md):
#
#   1. PostgreSQL 16.11 and an S3 test double on an internal Docker network without internet
#      access. Nothing here starts the 0.7.0 server, so none of its schedulers run.
#   2. The published 0.7.0 backend image, pinned by digest, migrates the database and bootstraps
#      its runtime role with its own `run-migrate.sh`, then runs its demo seed.
#   3. normalize.sql pins the seed's clock and salt; edge-cases.sql adds the synthetic rows.
#   4. store-documents.ts stores the fixture PDFs through 0.7.0's own S3 upload code.
#   5. The database is dumped as plain SQL with the 16.11 server's own pg_dump, and the bucket is
#      exported object by object with a SHA-256 manifest.
#
# Usage:
#   sh scripts/upgrade-fixture/generate.sh          regenerate the committed fixture
#   sh scripts/upgrade-fixture/generate.sh --check  generate into a temporary directory and fail
#                                                    when it differs from the committed fixture
#
# Needs Docker and network access to pull the images. Passwords are generated per run and never
# reach the dump (roles are not part of a database dump). Every container and network it
# creates is removed on exit.
set -eu

REPO=$(cd "$(dirname "$0")/../.." && pwd)
HERE="$REPO/scripts/upgrade-fixture"
FIXTURE="$HERE/v0.7.0"
# The published 0.7.0 backend image (built from the v0.7.0 tag), pinned by its index digest.
OLD_IMAGE=ghcr.io/pieter-ohearn/quro-backend:v0.7.0@sha256:54fe1e7b485c83b8ca448faa843619c3e2e6e566491f0d929a970323bad2923d
# The database 0.7.0 shipped with. Its pg_dump writes the fixture, so the minor version is pinned.
PG_IMAGE=postgres:16.11-alpine3.23
# A test double for the S3-compatible store 0.7.0 ran (Apache-2.0, pinned by digest).
S3_IMAGE=adobe/s3mock:4.11.0@sha256:cd49108c0094bc3f420b24bff354073032a9ec1a6f4cc89f8e8f483a308cf99e
# 0.7.0's defaults: database and role names, bucket.
DB=quro
ADMIN_USER=quro_admin
APP_USER=quro_app
BUCKET=quro-documents
# pg_dump 16.11 writes a random \restrict key unless one is given; a fixed one keeps the dump stable.
RESTRICT_KEY=quroUpgradeFixture070

CHECK=false
case "${1:-}" in
  '') ;;
  --check) CHECK=true ;;
  *)
    echo >&2 "usage: sh scripts/upgrade-fixture/generate.sh [--check]"
    exit 2
    ;;
esac

RUN="quro-fixture-gen-$$"
NET="$RUN-net"
WORK=$(mktemp -d)
OUT="$WORK/v0.7.0"
SECRETS="$WORK/secrets"

step() { printf '\n==> %s\n' "$1"; }
fail() {
  echo >&2 "FAIL: $1"
  exit 1
}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker logs --tail 40 "$RUN-db" 2>&1 | sed 's/^/db: /' >&2 || true
  fi
  docker rm -f "$RUN-db" "$RUN-s3" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# old_image ARGS...: runs the 0.7.0 backend image the way its Compose file did: secrets as files,
# database host `db` (0.7.0's scripts hard-code it), storage at `minio`.
old_image() {
  docker run --rm --network "$NET" \
    -e POSTGRES_DB="$DB" -e POSTGRES_ADMIN_USER="$ADMIN_USER" -e POSTGRES_APP_USER="$APP_USER" \
    -e MINIO_APP_USER="$APP_USER" -e S3_ENDPOINT=http://minio:9090 -e S3_REGION=eu-west-1 \
    -e S3_BUCKET="$BUCKET" -e S3_FORCE_PATH_STYLE=true \
    -v "$SECRETS/postgres_admin_password:/run/secrets/postgres_admin_password:ro" \
    -v "$SECRETS/postgres_app_password:/run/secrets/postgres_app_password:ro" \
    -v "$SECRETS/minio_app_secret_key:/run/secrets/minio_app_secret_key:ro" \
    -v "$HERE:/fixture-src:ro" \
    "$@"
}

psql_admin() { docker exec -i "$RUN-db" psql -X -q -v ON_ERROR_STOP=1 -U "$ADMIN_USER" -d "$DB" "$@"; }

step "Pull the pinned images"
for image in "$OLD_IMAGE" "$PG_IMAGE" "$S3_IMAGE"; do
  docker image inspect "$image" >/dev/null 2>&1 || docker pull -q "$image" >/dev/null
done

mkdir -p "$SECRETS" "$OUT"
for name in postgres_admin_password postgres_app_password minio_app_secret_key; do
  (umask 077 && od -An -N16 -tx1 /dev/urandom | tr -d ' \n' >"$SECRETS/$name")
done

step "PostgreSQL 16 and the S3 test double on an internal network"
docker network create --internal "$NET" >/dev/null
docker run -d --name "$RUN-db" --network "$NET" --network-alias db \
  -e POSTGRES_USER="$ADMIN_USER" -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_admin_password \
  -e POSTGRES_DB="$DB" -v "$SECRETS/postgres_admin_password:/run/secrets/postgres_admin_password:ro" \
  --tmpfs /var/lib/postgresql/data "$PG_IMAGE" >/dev/null
docker run -d --name "$RUN-s3" --network "$NET" --network-alias minio \
  -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS="$BUCKET" "$S3_IMAGE" >/dev/null
tries=0
# The image first runs a temporary server that only listens on its socket, so ask over TCP.
until docker exec "$RUN-db" pg_isready -h 127.0.0.1 -U "$ADMIN_USER" -d "$DB" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -le 60 ] || fail "PostgreSQL did not become ready"
  sleep 1
done
tries=0
until docker logs "$RUN-s3" 2>&1 | grep -q 'Started S3MockApplication'; do
  tries=$((tries + 1))
  [ "$tries" -le 90 ] || fail "the S3 test double did not start"
  sleep 1
done

step "0.7.0 migrates and bootstraps its runtime role (run-migrate.sh)"
old_image --entrypoint /bin/sh "$OLD_IMAGE" /app/docker/backend/run-migrate.sh

step "0.7.0 demo seed"
old_image "$OLD_IMAGE" bun run db:seed-demo

step "Pin the seed's volatile values, then add the synthetic rows"
psql_admin <"$HERE/normalize.sql"
psql_admin <"$HERE/edge-cases.sql"

step "Store the PDFs with 0.7.0's S3 upload code"
old_image "$OLD_IMAGE" bun /fixture-src/store-documents.ts attach

step "Dump the database with the 16.11 server's pg_dump"
docker exec "$RUN-db" pg_dump -U "$ADMIN_USER" -d "$DB" --format=plain --restrict-key="$RESTRICT_KEY" \
  >"$OUT/database.sql"
grep -q '^-- PostgreSQL database dump complete' "$OUT/database.sql" || fail "the dump is incomplete"

step "Export the bucket"
old_image --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$OUT:/out" "$OLD_IMAGE" \
  bun /fixture-src/store-documents.ts export /out

step "Contents"
psql_admin -At <"$REPO/scripts/pg-table-fingerprint.sql" | LC_ALL=C sort \
  | awk -F'|' '$1 == "table" { printf "  %-40s %s\n", $2, $3; rows += $3 } END { print "  rows: " rows }'
echo "  objects: $(wc -l <"$OUT/documents.sha256" | tr -d ' ')"

if [ "$CHECK" = true ]; then
  step "Compare with the committed fixture"
  if diff -r "$FIXTURE" "$OUT"; then
    echo "identical"
  else
    fail "the committed fixture differs from a fresh generation"
  fi
else
  rm -rf "$FIXTURE"
  cp -R "$OUT" "$FIXTURE"
  echo
  echo "Wrote $FIXTURE"
fi
