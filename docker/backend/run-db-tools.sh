#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  echo >&2 "Usage: backup | restore <path> | psql [args]"
  exit 1
fi

. /app/docker/backend/common-env.sh

load_admin_database_env
load_runtime_database_env

cd /app/packages/backend

subcommand="$1"
shift

case "$subcommand" in
  backup)
    exec bun run db:backup -- "$@"
    ;;
  restore)
    exec bun run db:restore -- "$@"
    ;;
  psql)
    export PGHOST=db
    export PGPORT=5432
    export PGUSER="${POSTGRES_ADMIN_USER:?POSTGRES_ADMIN_USER is required}"
    export PGDATABASE="${POSTGRES_DB:?POSTGRES_DB is required}"
    export PGPASSWORD="${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD is required}"
    exec psql "$@"
    ;;
  *)
    echo >&2 "Unknown db-tools command: $subcommand"
    echo >&2 "Supported commands: backup, restore <path>, psql [args]"
    exit 1
    ;;
esac
