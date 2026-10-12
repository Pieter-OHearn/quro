#!/bin/sh
# Runs before nginx renders its configuration. nginx writes only below /tmp (pid file, temporary
# files, the rendered server configuration), so a read-only root filesystem needs /tmp as tmpfs.
set -eu

if ! mkdir -p /tmp/nginx/conf.d 2>/dev/null || [ ! -w /tmp/nginx/conf.d ]; then
  echo >&2 "/tmp is not writable: with a read-only root filesystem, mount a tmpfs at /tmp"
  exit 2
fi
