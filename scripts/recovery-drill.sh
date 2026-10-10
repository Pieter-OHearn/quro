#!/bin/sh
# Recovery drill for `quro backup` and `quro restore` (docs/backup-and-restore.md). It runs on a
# throwaway Docker stack with synthetic data only: a private network with no published ports, two
# PostgreSQL servers (the instance and an isolated restore target) and the backend image. Every
# Docker resource it creates is removed on exit.
#
#   1. Source instance: migrated, demo seed, scripts/fixtures/pg-upgrade-synthetic.sql and
#      scripts/fixtures/recovery-drill.sql (a partner with a joint and a private account, ledgers
#      of QURO_DRILL_ROWS rows), and QURO_DRILL_DOCUMENTS payslip PDFs uploaded through the API.
#   2. `quro backup`: encrypted, copied to an off-device volume, retention QURO_BACKUP_KEEP=2.
#   3. Failure cases against the empty target, each refused with nothing changed: missing archive
#      (2), no confirmation (3), wrong key (1), changed bytes (1), truncated (1), newer release (3).
#   4. `quro restore` into the isolated target, then compare: table fingerprints (every row, the
#      migration history), ledger totals, the runtime role's privileges, document checksums, and
#      sign-in plus what the demo user sees through the API (accounts incl. the joint one, not the
#      partner's private one, payslips, document downloads).
#   5. A backup while a client keeps writing (maintenance mode), a third backup for retention,
#      and a restore of the under-load archive over the restored target (pre-restore archive).
#   6. Elapsed times for the recovery objectives.
#
# Usage: sh scripts/recovery-drill.sh
# Environment:
#   QURO_BACKEND_IMAGE      backend image to test (default quro-backend:ci; built when missing)
#   PG_IMAGE                database image (default: the db image in docker-compose.yml)
#   QURO_DRILL_ROWS         synthetic ledger size (default 1000; the reference dataset is 25000)
#   QURO_DRILL_DOCUMENTS    number of uploaded PDFs (default 20; reference 200)
#   QURO_DRILL_DOCUMENT_KIB size of each PDF in KiB (default 64; reference 512)
set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

IMAGE=${QURO_BACKEND_IMAGE:-quro-backend:ci}
PG_IMAGE=${PG_IMAGE:-$(sed -n 's/^ *image: *\(postgres:[^ ]*\) *$/\1/p' docker-compose.yml | head -n 1)}
[ -n "$PG_IMAGE" ] || { echo >&2 "Could not read the db image from docker-compose.yml"; exit 1; }
ROWS=${QURO_DRILL_ROWS:-1000}
DOCUMENTS=${QURO_DRILL_DOCUMENTS:-20}
DOCUMENT_KIB=${QURO_DRILL_DOCUMENT_KIB:-64}

RUN="quro-drill-$$"
NET="$RUN-net"
VOLUMES="$RUN-pg-source $RUN-pg-target $RUN-docs-source $RUN-docs-target $RUN-backups $RUN-offsite"
WORK=$(mktemp -d)
DB=quro
# Throwaway credentials for containers that live for a few minutes on a private network. The
# files are world-readable so the backend can read them whatever user it runs as.
mkdir -p "$WORK/secrets" "$WORK/other-key"
od -An -N16 -tx1 /dev/urandom | tr -d ' \n' >"$WORK/secrets/postgres_admin_password"
od -An -N16 -tx1 /dev/urandom | tr -d ' \n' >"$WORK/secrets/postgres_app_password"
od -An -N32 -tx1 /dev/urandom | tr -d ' \n' >"$WORK/secrets/backup_key"
od -An -N32 -tx1 /dev/urandom | tr -d ' \n' >"$WORK/other-key/backup_key"
chmod 755 "$WORK/secrets" "$WORK/other-key"
chmod 644 "$WORK/secrets/"* "$WORK/other-key/"*
ADMIN_PASSWORD=$(cat "$WORK/secrets/postgres_admin_password")

step() { printf '\n==> %s\n' "$1"; }
fail() { echo >&2 "FAIL: $1"; exit 1; }
now() { perl -MTime::HiRes=time -e 'printf "%.2f\n", time'; }
elapsed() { perl -e "printf '%.1f', $2 - $1"; }

cleanup() {
  status=$?
  docker rm -f "$RUN-db-source" "$RUN-db-target" "$RUN-api-source" "$RUN-api-target" "$RUN-writer" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  # shellcheck disable=SC2086
  docker volume rm $VOLUMES >/dev/null 2>&1 || true
  rm -rf "$WORK"
  if [ "$status" -eq 0 ]; then echo; echo "PASS: recovery drill"; else echo >&2; echo >&2 "FAIL: recovery drill stopped with status $status"; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  step "Building $IMAGE"
  docker build -q -f packages/backend/Dockerfile -t "$IMAGE" . >/dev/null
fi
docker network create --internal "$NET" >/dev/null
for volume in $VOLUMES; do docker volume create "$volume" >/dev/null; done

# start_db NAME VOLUME
start_db() {
  docker run -d --name "$1" --network "$NET" --network-alias "$1" \
    -e POSTGRES_USER=quro_admin -e POSTGRES_PASSWORD="$ADMIN_PASSWORD" -e POSTGRES_DB="$DB" \
    -v "$2:/var/lib/postgresql" "$PG_IMAGE" >/dev/null
  tries=0
  until docker exec "$1" pg_isready -h 127.0.0.1 -U quro_admin -d "$DB" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || fail "$1 did not become ready"
    sleep 1
  done
}

# backend HOST DOCUMENTS_VOLUME [docker run options...] -- COMMAND...: a one-off backend container
# configured the way an operator configures it (settings and secret files, no URLs).
backend() {
  host=$1
  documents=$2
  shift 2
  options=""
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do options="$options $1"; shift; done
  shift
  # shellcheck disable=SC2086
  docker run --rm --network "$NET" \
    -v "$WORK/secrets:/run/secrets:ro" -v "$documents:/var/lib/quro/documents" \
    -v "$RUN-backups:/var/lib/quro/backups" -v "$RUN-offsite:/var/lib/quro/offsite" \
    -e POSTGRES_HOST="$host" -e POSTGRES_DB="$DB" \
    -e POSTGRES_ADMIN_USER=quro_admin -e POSTGRES_APP_USER=quro_app \
    -e QRO_DOCUMENT_STORAGE=filesystem -e QRO_DISABLE_SCHEDULERS=true \
    $options "$IMAGE" "$@"
}

quro() {
  host=$1
  documents=$2
  shift 2
  options=""
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do options="$options $1"; shift; done
  shift
  # shellcheck disable=SC2086
  backend "$host" "$documents" --entrypoint quro $options -- "$@"
}

# start_api NAME HOST DOCUMENTS_VOLUME: the API server, as `docker compose up` runs it.
start_api() {
  docker run -d --name "$1" --network "$NET" --network-alias "$1" \
    -v "$WORK/secrets:/run/secrets:ro" -v "$3:/var/lib/quro/documents" \
    -e POSTGRES_HOST="$2" -e POSTGRES_DB="$DB" -e POSTGRES_APP_USER=quro_app \
    -e QRO_DISABLE_SCHEDULERS=true -e QRO_DOCUMENT_STORAGE=filesystem "$IMAGE" >/dev/null
  client wait "http://$1:3000"
}

client() {
  docker run --rm --network "$NET" -v "$REPO_ROOT/scripts/recovery-drill-client.ts:/drill/client.ts:ro" \
    --entrypoint bun "$IMAGE" /drill/client.ts "$@"
}

psql_on() {
  container=$1
  shift
  docker exec -i "$container" psql -X -q -At -v ON_ERROR_STOP=1 -U quro_admin -d "$DB" "$@"
}

fingerprint() {
  psql_on "$1" <scripts/pg-table-fingerprint.sql | LC_ALL=C sort
}

# Ledger totals per table: row counts and sums of the money columns the demo data fills.
ledgers() {
  psql_on "$1" -c "select 'savings_accounts', count(*), sum(balance) from savings_accounts
    union all select 'savings_transactions', count(*), sum(amount) from savings_transactions
    union all select 'budget_transactions', count(*), sum(amount) from budget_transactions
    union all select 'payslips', count(*), sum(net) from payslips
    union all select 'debts', count(*), sum(remaining_balance) from debts
    union all select 'pension_pots', count(*), sum(balance) from pension_pots order by 1"
}

# Privileges the runtime role needs on every application table.
grants() {
  psql_on "$1" -c "select count(*) filter (where has_table_privilege('quro_app', c.oid, 'select,insert,update,delete')) || '/' || count(*)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'"
}

document_hashes() {
  docker run --rm -v "$1:/documents:ro" --entrypoint sh "$IMAGE" -c \
    'cd /documents && find . -type f ! -path "*/.*" -exec sha256sum {} + | LC_ALL=C sort'
}

# expect_exit CODE LABEL COMMAND...
expect_exit() {
  wanted=$1
  label=$2
  shift 2
  set +e
  "$@" >"$WORK/out.txt" 2>&1
  got=$?
  set -e
  if [ "$got" != "$wanted" ]; then
    cat "$WORK/out.txt" >&2
    fail "$label: exit code $got, expected $wanted"
  fi
  echo "$label: exit code $got ($(tail -n 1 "$WORK/out.txt"))"
}

archives() {
  docker run --rm -v "$1:/dir:ro" --entrypoint sh "$IMAGE" -c 'cd /dir && ls -1 quro-backup-* 2>/dev/null || true'
}

KEY_OPTIONS="-e QRO_BACKUP_ENCRYPTION_KEY_FILE=/run/secrets/backup_key"
ROUTINE="$KEY_OPTIONS -e QRO_BACKUP_OFFSITE_DIR=/var/lib/quro/offsite -e QRO_BACKUP_KEEP=2"

step "Source instance on $PG_IMAGE: $ROWS ledger rows, $DOCUMENTS documents of $DOCUMENT_KIB KiB"
start_db "$RUN-db-source" "$RUN-pg-source"
backend "$RUN-db-source" "$RUN-docs-source" --entrypoint bun -- run db:migrate >/dev/null
backend "$RUN-db-source" "$RUN-docs-source" --entrypoint bun -- run db:bootstrap-runtime-role >/dev/null
backend "$RUN-db-source" "$RUN-docs-source" --entrypoint bun -- run db:seed-demo >/dev/null
psql_on "$RUN-db-source" <scripts/fixtures/pg-upgrade-synthetic.sql >/dev/null
psql_on "$RUN-db-source" -v rows="$ROWS" <scripts/fixtures/recovery-drill.sql >/dev/null
start_api "$RUN-api-source" "$RUN-db-source" "$RUN-docs-source"
client upload "http://$RUN-api-source:3000" "$DOCUMENTS" "$DOCUMENT_KIB"
client snapshot "http://$RUN-api-source:3000" >"$WORK/source-view.json"
fingerprint "$RUN-db-source" >"$WORK/source.fp"
ledgers "$RUN-db-source" >"$WORK/source.ledgers"
document_hashes "$RUN-docs-source" >"$WORK/source.documents"
echo "source: $(grep -c '^table|' "$WORK/source.fp") tables, $(awk -F'|' '$1 == "table" { n += $3 } END { print n + 0 }' "$WORK/source.fp") rows, $(wc -l <"$WORK/source.documents" | tr -d ' ') documents"

step "quro backup (encrypted, off-device copy, keep 2) while the server runs"
started=$(now)
# shellcheck disable=SC2086
quro "$RUN-db-source" "$RUN-docs-source" $ROUTINE -- backup >"$WORK/backup-a.txt"
backup_seconds=$(elapsed "$started" "$(now)")
cat "$WORK/backup-a.txt"
ARCHIVE_A=$(sed -n 's|^Archive written and verified: /var/lib/quro/backups/\([^ ]*\) .*|\1|p' "$WORK/backup-a.txt")
[ -n "$ARCHIVE_A" ] || fail "no archive name in the backup output"
pause_seconds=$(sed -n 's/^Changes resumed after \([0-9.]*\) s$/\1/p' "$WORK/backup-a.txt")
[ "$(archives "$RUN-offsite")" = "$ARCHIVE_A" ] || fail "the off-device copy is missing"

step "Unencrypted archive for the wrong-version case"
quro "$RUN-db-source" "$RUN-docs-source" -- backup --label version-test >"$WORK/backup-plain.txt"
PLAIN=$(sed -n 's|^Archive written and verified: /var/lib/quro/backups/\([^ ]*\) .*|\1|p' "$WORK/backup-plain.txt")
# Rewrite its manifest as if a newer release had written it, entries in the same order.
docker run --rm -v "$RUN-backups:/backups" --entrypoint sh "$IMAGE" -c "
  set -e; mkdir /tmp/x && cd /tmp/x && tar -xf /backups/$PLAIN
  sed -i 's/\"version\": \"[^\"]*\"/\"version\": \"v99.0.0\"/' manifest.json
  tar --format=ustar --no-recursion -cf /backups/newer-release.tar database.dump \$(find documents -type f | LC_ALL=C sort) manifest.json"

step "Failure cases against the empty, isolated target: refused, nothing changed"
start_db "$RUN-db-target" "$RUN-pg-target"
docker run --rm -v "$RUN-backups:/backups" --entrypoint sh "$IMAGE" -c "
  set -e; cd /backups
  cp $ARCHIVE_A damaged.tar.enc && printf 'synthetic damage' | dd of=damaged.tar.enc bs=1 seek=\$((\$(wc -c <damaged.tar.enc) / 2)) conv=notrunc 2>/dev/null
  head -c \$((\$(wc -c <$ARCHIVE_A) / 2)) $ARCHIVE_A >truncated.tar.enc"
CONFIRM="-e QRO_RESTORE_CONFIRM=restore-db"
# shellcheck disable=SC2086
expect_exit 2 "missing archive" quro "$RUN-db-target" "$RUN-docs-target" $CONFIRM $KEY_OPTIONS -- restore /var/lib/quro/backups/no-such-archive.tar.enc
# shellcheck disable=SC2086
expect_exit 3 "no confirmation" quro "$RUN-db-target" "$RUN-docs-target" $KEY_OPTIONS -- restore "/var/lib/quro/backups/$ARCHIVE_A"
docker run --rm -v "$WORK/other-key:/other:ro" -v "$WORK/secrets:/secrets:ro" --entrypoint sh "$IMAGE" -c 'cmp -s /other/backup_key /secrets/backup_key' && fail "the two keys are equal"
# shellcheck disable=SC2086
expect_exit 1 "wrong key" backend "$RUN-db-target" "$RUN-docs-target" --entrypoint quro $CONFIRM -v "$WORK/other-key:/run/other:ro" -e QRO_BACKUP_ENCRYPTION_KEY_FILE=/run/other/backup_key -- restore "/var/lib/quro/backups/$ARCHIVE_A"
# shellcheck disable=SC2086
expect_exit 1 "changed bytes" quro "$RUN-db-target" "$RUN-docs-target" $CONFIRM $KEY_OPTIONS -- restore /var/lib/quro/backups/damaged.tar.enc
# shellcheck disable=SC2086
expect_exit 1 "truncated" quro "$RUN-db-target" "$RUN-docs-target" $CONFIRM $KEY_OPTIONS -- restore /var/lib/quro/backups/truncated.tar.enc
# shellcheck disable=SC2086
expect_exit 3 "newer release" quro "$RUN-db-target" "$RUN-docs-target" $CONFIRM -- restore /var/lib/quro/backups/newer-release.tar
expect_exit 1 "verify a damaged archive" quro "$RUN-db-target" "$RUN-docs-target" $KEY_OPTIONS -- backup verify /var/lib/quro/backups/damaged.tar.enc
tables=$(psql_on "$RUN-db-target" -c "select count(*) from pg_tables where schemaname in ('public', 'drizzle')")
[ "$tables" = "0" ] || fail "a refused restore created $tables tables"
[ -z "$(document_hashes "$RUN-docs-target")" ] || fail "a refused restore wrote documents"
echo "target still empty"

step "quro restore into the isolated target"
started=$(now)
# shellcheck disable=SC2086
quro "$RUN-db-target" "$RUN-docs-target" $CONFIRM $KEY_OPTIONS -- restore "/var/lib/quro/backups/$ARCHIVE_A" | tee "$WORK/restore-a.txt"
restore_seconds=$(elapsed "$started" "$(now)")
grep -q 'Restored and verified' "$WORK/restore-a.txt" || fail "restore did not report verification"

step "Compare the target with the source"
fingerprint "$RUN-db-target" >"$WORK/target.fp"
diff "$WORK/source.fp" "$WORK/target.fp" || fail "table fingerprints differ"
echo "fingerprints: identical ($(grep -c '^table|' "$WORK/target.fp") tables, migration history included)"
ledgers "$RUN-db-target" >"$WORK/target.ledgers"
diff "$WORK/source.ledgers" "$WORK/target.ledgers" || fail "ledger totals differ"
sed 's/^/ledger: /' "$WORK/target.ledgers"
[ "$(grants "$RUN-db-source")" = "$(grants "$RUN-db-target")" ] || fail "runtime role privileges differ"
echo "runtime role privileges: $(grants "$RUN-db-target") tables"
document_hashes "$RUN-docs-target" >"$WORK/target.documents"
diff "$WORK/source.documents" "$WORK/target.documents" || fail "document checksums differ"
echo "documents: $(wc -l <"$WORK/target.documents" | tr -d ' ') files, identical SHA-256"
start_api "$RUN-api-target" "$RUN-db-target" "$RUN-docs-target"
client snapshot "http://$RUN-api-target:3000" >"$WORK/target-view.json"
diff "$WORK/source-view.json" "$WORK/target-view.json" || fail "the demo user's view differs"
grep -q '"Joint household"' "$WORK/target-view.json" || fail "the partner's joint account is not visible"
if grep -q '"Partner private"' "$WORK/target-view.json"; then fail "the partner's private account is visible"; fi
echo "sign-in, accounts (joint visible, private hidden), payslips and $(grep -c '"[0-9]*": "' "$WORK/target-view.json") document downloads: identical"
docker rm -f "$RUN-api-target" >/dev/null

step "Backup while a client keeps writing"
docker run -d --name "$RUN-writer" --network "$NET" -v "$REPO_ROOT/scripts/recovery-drill-client.ts:/drill/client.ts:ro" \
  --entrypoint bun "$IMAGE" /drill/client.ts write-loop "http://$RUN-api-source:3000" 8 >/dev/null
sleep 2
# shellcheck disable=SC2086
quro "$RUN-db-source" "$RUN-docs-source" $ROUTINE -- backup >"$WORK/backup-b.txt"
ARCHIVE_B=$(sed -n 's|^Archive written and verified: /var/lib/quro/backups/\([^ ]*\) .*|\1|p' "$WORK/backup-b.txt")
[ "$(docker wait "$RUN-writer")" = "0" ] || fail "the writing client failed"
statuses=$(docker logs "$RUN-writer")
docker rm "$RUN-writer" >/dev/null
echo "writes during the backup: $statuses"
echo "$statuses" | grep -Eq '"(201)"' || fail "no write succeeded around the backup"
if echo "$statuses" | grep -Eq '"([0-9]{3})"' && echo "$statuses" | grep -Eo '"[0-9]{3}"' | grep -Evq '"(201|503)"'; then
  fail "a write failed with something other than 503"
fi
grep -q '^Warning' "$WORK/backup-b.txt" && fail "the archive misses documents its database refers to"
echo "archive taken under load: every referenced document is in it"

step "Retention keeps the two newest unlabelled archives in both places"
sleep 1
# shellcheck disable=SC2086
quro "$RUN-db-source" "$RUN-docs-source" $ROUTINE -- backup >"$WORK/backup-c.txt"
for volume in "$RUN-backups" "$RUN-offsite"; do
  listed=$(archives "$volume")
  echo "$listed" | grep -q "$ARCHIVE_A" && fail "retention kept the oldest archive in $volume"
  echo "$listed" | grep -q "$ARCHIVE_B" || fail "retention deleted a newer archive in $volume"
  [ "$(echo "$listed" | grep -Ec '^quro-backup-[0-9]{8}-[0-9]{6}Z\.tar\.enc$')" = "2" ] || fail "retention left the wrong count in $volume"
done
archives "$RUN-backups" | grep -q 'version-test' || fail "retention deleted a labelled archive"
echo "oldest deleted, labelled kept"

step "Restore the under-load archive over the restored target"
# shellcheck disable=SC2086
expect_exit 3 "non-empty target without permission" quro "$RUN-db-target" "$RUN-docs-target" $CONFIRM $KEY_OPTIONS -- restore "/var/lib/quro/backups/$ARCHIVE_B"
# shellcheck disable=SC2086
quro "$RUN-db-target" "$RUN-docs-target" $CONFIRM -e QRO_RESTORE_ALLOW_NON_EMPTY=1 $KEY_OPTIONS -- restore "/var/lib/quro/backups/$ARCHIVE_B" >"$WORK/restore-b.txt"
grep -q 'Pre-restore archive: ' "$WORK/restore-b.txt" || fail "no pre-restore archive"
grep -q 'Restored and verified' "$WORK/restore-b.txt" || fail "the second restore was not verified"
echo "$(grep 'Pre-restore archive: ' "$WORK/restore-b.txt")"

archive_bytes=$(docker run --rm -v "$RUN-backups:/b:ro" --entrypoint sh "$IMAGE" -c "wc -c < /b/$ARCHIVE_B")
step "Timings (dataset: $ROWS ledger rows, $DOCUMENTS documents of $DOCUMENT_KIB KiB)"
echo "backup: ${backup_seconds} s end to end, changes paused for ${pause_seconds:-?} s"
echo "restore: ${restore_seconds} s end to end, including both checksum passes and the comparison"
echo "archive: $archive_bytes bytes (encrypted)"
