#!/bin/sh
set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

echo "==> Shared tests"
bun test packages/shared/test

echo "==> Backend tests"
cd "$REPO_ROOT/packages/backend"
bun test src

echo "==> Frontend tests"
cd "$REPO_ROOT"
bun run --filter '@quro/frontend' test
