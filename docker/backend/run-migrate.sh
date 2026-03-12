#!/bin/sh
set -eu

. /app/docker/backend/common-env.sh

load_admin_database_env
load_runtime_database_env

cd /app/packages/backend
bun run db:migrate
bun run db:bootstrap-runtime-role
