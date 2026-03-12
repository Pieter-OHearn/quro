#!/bin/sh
set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

chmod +x "$REPO_ROOT/.githooks/pre-commit"
git config core.hooksPath .githooks

echo "Configured Git hooks to use $REPO_ROOT/.githooks"
echo "The checked-in pre-commit hook runs a staged gitleaks scan and then 'bun run ci:check'."
echo "Install gitleaks first if it is not already on your PATH, for example: brew install gitleaks"
