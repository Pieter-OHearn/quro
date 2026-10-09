#!/bin/sh
set -eu

# The backend reads its database settings and password files itself (packages/backend/src/config),
# so this wrapper only runs the two steps in order.
cd /app/packages/backend
bun run db:migrate
bun run db:bootstrap-runtime-role
