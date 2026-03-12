#!/bin/sh
set -eu

if [ -f /run/secrets/hugging_face_hub_token ]; then
  hugging_face_token=$(tr -d '\r\n' < /run/secrets/hugging_face_hub_token)
  if [ -n "$hugging_face_token" ]; then
    export HUGGING_FACE_HUB_TOKEN="$hugging_face_token"
  fi
fi

exec python3 -m vllm.entrypoints.openai.api_server "$@"
