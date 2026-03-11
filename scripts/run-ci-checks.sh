#!/bin/sh
set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

PYTHON_VENV_BIN="$REPO_ROOT/.venv/bin"

if [ -d "$PYTHON_VENV_BIN" ]; then
  PATH="$PYTHON_VENV_BIN:$PATH"
  export PATH
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    if [ "$1" = "ruff" ] || [ "$1" = "pip-audit" ]; then
      echo "Install Python tooling into .venv or your PATH, for example:" >&2
      echo "  python3 -m venv .venv && . .venv/bin/activate && pip install -r services/pension-parser/requirements.txt ruff pip-audit" >&2
    fi
    exit 1
  fi
}

run_check() {
  label=$1
  shift

  echo "==> $label"
  "$@"
}

has_staged_parser_changes() {
  git diff --cached --name-only --diff-filter=ACMR -- services/pension-parser | grep -q .
}

allow_precommit_python_skip() {
  [ "${QRO_PRECOMMIT:-0}" = "1" ] || return 1
  has_staged_parser_changes && return 1
  return 0
}

skip_python_check() {
  label=$1
  missing_command=$2

  echo "Skipping $label during pre-commit because $missing_command is unavailable and no staged files under services/pension-parser/ were found." >&2
}

require_command bun

run_check "Format" bun run check:format
run_check "Lint" bun run check:lint
run_check "Typecheck" bun run check:typecheck
run_check "Tests" bun run check:test
run_check "Build" bun run check:build

if command -v python3 >/dev/null 2>&1; then
  if command -v ruff >/dev/null 2>&1; then
    run_check "Python format" bun run check:python:format
    run_check "Python lint" bun run check:python:lint
    run_check "Python compile" bun run check:python:build
  elif allow_precommit_python_skip; then
    skip_python_check "Python format/lint/build checks" "ruff"
  else
    require_command ruff
  fi
elif allow_precommit_python_skip; then
  skip_python_check "Python format/lint/build checks" "python3"
else
  require_command python3
fi

run_check "JavaScript security audit" bun run check:security:js

if command -v pip-audit >/dev/null 2>&1; then
  run_check "Python security audit" bun run check:security:python
elif allow_precommit_python_skip; then
  skip_python_check "Python security audit" "pip-audit"
else
  require_command pip-audit
fi

echo "All CI checks passed."
