#!/bin/sh
set -eu

# Adds a tag to the candidate images the release workflow built, by digest, without
# rebuilding them, and checks the tag now resolves to that exact digest.
#   REGISTRY=ghcr.io/owner BACKEND_DIGEST=sha256:... FRONTEND_DIGEST=sha256:... \
#   sh scripts/lib/promote-images.sh <tag>

TAG=${1:-}
if ! printf '%s' "$TAG" | grep -Eq '^(latest|v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?)$'; then
  echo "Usage: promote-images.sh <latest|vX.Y.Z|vX.Y.Z-rc.N>" >&2
  exit 1
fi
: "${REGISTRY:?REGISTRY is not set}"

# Check every digest before tagging anything, so a bad input cannot leave a partial set.
for digest in "${BACKEND_DIGEST:-}" "${FRONTEND_DIGEST:-}"; do
  if ! printf '%s' "$digest" | grep -Eq '^sha256:[0-9a-f]{64}$'; then
    echo "BACKEND_DIGEST and FRONTEND_DIGEST must be sha256 digests" >&2
    exit 1
  fi
done

promote() {
  image=$1
  digest=$2
  docker buildx imagetools create --tag "$REGISTRY/$image:$TAG" "$REGISTRY/$image@$digest"
  actual=$(docker buildx imagetools inspect "$REGISTRY/$image:$TAG" --format '{{json .Manifest.Digest}}')
  if [ "$actual" != "\"$digest\"" ]; then
    echo "$REGISTRY/$image:$TAG resolves to $actual, expected $digest" >&2
    exit 1
  fi
  echo "$REGISTRY/$image:$TAG -> $digest"
}

promote quro-backend "$BACKEND_DIGEST"
promote quro-frontend "$FRONTEND_DIGEST"
