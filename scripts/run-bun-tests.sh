#!/bin/sh
set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Backend tests need an explicit, migrated, throwaway database (see "DB-backed tests" in
# docs/development.md). The role URLs default to it so packages/backend/.env cannot
# redirect admin or runtime connections.
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Point it at a throwaway, migrated PostgreSQL;" >&2
  echo "see \"DB-backed tests\" in docs/development.md." >&2
  exit 1
fi
ADMIN_DATABASE_URL=${ADMIN_DATABASE_URL:-$DATABASE_URL}
APP_DATABASE_URL=${APP_DATABASE_URL:-$DATABASE_URL}
export ADMIN_DATABASE_URL APP_DATABASE_URL

echo "==> Shared tests"
bun test packages/shared/test scripts/eslint scripts/lib scripts/check-bun-version.test.ts \
  scripts/dev-doctor.test.ts scripts/workspace-manifests.test.ts scripts/check-docs.test.ts \
  scripts/compose-topology.test.ts

echo "==> Backend tests"
cd "$REPO_ROOT/packages/backend"
NODE_ENV=test bun test src

echo "==> Frontend tests"
cd "$REPO_ROOT"
NODE_ENV=test bun run --filter '@quro/frontend' test
