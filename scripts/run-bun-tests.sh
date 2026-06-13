#!/bin/sh
set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

echo "==> Shared tests"
bun test packages/shared/test

echo "==> Backend tests"
cd "$REPO_ROOT/packages/backend"
NODE_ENV=test bun test src

echo "==> Frontend tests"
cd "$REPO_ROOT"
NODE_ENV=test bun run --filter '@quro/frontend' test
