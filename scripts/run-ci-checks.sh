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
    elif [ "$1" = "gitleaks" ]; then
      echo "Install gitleaks and retry, for example:" >&2
      echo "  brew install gitleaks" >&2
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

postgres_is_ready() {
  bun -e "import net from 'node:net';
const socket = net.createConnection({ host: process.env.QRO_DB_HOST, port: Number(process.env.QRO_DB_PORT) });
const finish = (code) => {
  socket.destroy();
  process.exit(code);
};
socket.setTimeout(1000);
socket.on('connect', () => finish(0));
socket.on('timeout', () => finish(1));
socket.on('error', () => finish(1));" >/dev/null 2>&1
}

wait_for_postgres() {
  attempts=0
  max_attempts=30

  while [ "$attempts" -lt "$max_attempts" ]; do
    if postgres_is_ready; then
      return 0
    fi

    attempts=$((attempts + 1))
    sleep 1
  done

  return 1
}

SKIP_DB_CHECKS=0

if [ "${QRO_PRECOMMIT:-0}" = "1" ]; then
  SKIP_DB_CHECKS=1
fi

# DB-backed checks run only against an explicit, throwaway database: no localhost default
# and no Compose service is started (see "DB-backed tests" in docs/development.md).
ensure_postgres() {
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL is not set. Point it at a throwaway PostgreSQL before running ci:check;" >&2
    echo "see \"DB-backed tests\" in docs/development.md." >&2
    exit 1
  fi

  if ! DATABASE_TARGET=$(
    bun --no-env-file -e "const url = new URL(process.env.DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) process.exit(1);
process.stdout.write(\`\${url.hostname}|\${url.port || '5432'}\`);" 2>/dev/null
  ); then
    echo "DATABASE_URL is not a postgres:// URL with a host (value not shown)." >&2
    exit 1
  fi
  QRO_DB_HOST=${DATABASE_TARGET%|*}
  QRO_DB_PORT=${DATABASE_TARGET#*|}
  export QRO_DB_HOST QRO_DB_PORT

  # Keep packages/backend/.env from redirecting admin or runtime connections.
  ADMIN_DATABASE_URL=${ADMIN_DATABASE_URL:-$DATABASE_URL}
  APP_DATABASE_URL=${APP_DATABASE_URL:-$DATABASE_URL}
  export ADMIN_DATABASE_URL APP_DATABASE_URL

  if ! wait_for_postgres; then
    echo "Postgres is not reachable at $QRO_DB_HOST:$QRO_DB_PORT from DATABASE_URL." >&2
    echo "Start the throwaway database, then rerun ci:check." >&2
    exit 1
  fi
}

prepare_test_database() {
  ensure_postgres
  run_check "Database migrate" bun run db:migrate
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

if [ "${QRO_PRECOMMIT:-0}" = "1" ]; then
  require_command gitleaks
  run_check "Secret scan" gitleaks git --pre-commit --redact --staged --verbose
fi

run_check "Bun version" bun run check:bun-version
run_check "Format" bun run check:format
run_check "Lint" bun run check:lint
run_check "Typecheck" bun run check:typecheck
if [ "$SKIP_DB_CHECKS" -eq 1 ]; then
  echo "Skipping database-backed tests during pre-commit (set QRO_PRECOMMIT=0 to run everything)."
else
  prepare_test_database
  run_check "Tests" bun run check:test
fi
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
