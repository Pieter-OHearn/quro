#!/bin/sh
set -eu

. /app/docker/backend/common-env.sh

load_runtime_database_env
load_storage_env
load_optional_api_keys

cd /app/packages/backend
exec "$@"
