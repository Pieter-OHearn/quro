#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  echo >&2 "Usage: backup | restore <path> | psql [args]"
  exit 1
fi

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
    exec bun run db:psql -- "$@"
    ;;
  *)
    echo >&2 "Unknown db-tools command: $subcommand"
    echo >&2 "Supported commands: backup, restore <path>, psql [args]"
    exit 1
    ;;
esac
