#!/bin/sh
# Runs before nginx renders its configuration. The backend address is a setting, never a
# service name built into the image; without it the container stops instead of guessing.
set -eu

if [ -z "${QRO_API_URL:-}" ]; then
  echo >&2 "QRO_API_URL is required: the backend address for /api, for example http://backend:3000"
  exit 2
fi
if ! printf '%s' "$QRO_API_URL" | grep -Eq '^https?://[A-Za-z0-9._-]+(:[0-9]+)?$'; then
  echo >&2 "QRO_API_URL must be http://host:port or https://host:port, without a path"
  exit 2
fi
