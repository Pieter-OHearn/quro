#!/bin/sh
set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

chmod +x "$REPO_ROOT/.githooks/pre-commit"
git config core.hooksPath .githooks

echo "Configured Git hooks to use $REPO_ROOT/.githooks"
echo "The checked-in pre-commit hook now runs 'bun run ci:check'."
