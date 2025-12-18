#!/usr/bin/env bash
set -euo pipefail

# Build and push Docker images for gateway, movie-service and user-service
# Defaults:
#   DOCKER_USERNAME -> andresmg42
#   DOCKER_PASSWORD -> (optional) if provided, will login non-interactively
#   TAG -> latest

DOCKER_USERNAME="${DOCKER_USERNAME:-andresmg42}"
TAG="${TAG:-latest}"
BUILD_ARGS="${BUILD_ARGS:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GATEWAY_DIR="$REPO_ROOT/../gateway/express-gateway"
MOVIE_DIR="$REPO_ROOT/../services/movie-service"
USER_DIR="$REPO_ROOT/../services/user-service"

GATEWAY_REPO="$DOCKER_USERNAME/gateway"
MOVIE_REPO="$DOCKER_USERNAME/movie-service"
USER_REPO="$DOCKER_USERNAME/user-service"

function ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker CLI not found. Install Docker and retry." >&2
    exit 1
  fi
}

function docker_login_if_needed() {
  if [ -n "${DOCKER_PASSWORD:-}" ]; then
    echo "Logging into Docker Hub as $DOCKER_USERNAME"
    echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
  else
    echo "No DOCKER_PASSWORD provided; assuming you're already logged in or will login interactively."
  fi
}

function build_and_push() {
  local path="$1" repo="$2"
  if [ ! -d "$path" ]; then
    echo "Directory not found: $path" >&2
    exit 1
  fi
  echo "\n==> Building $repo:$TAG from $path"
  docker build -t "$repo:$TAG" $BUILD_ARGS "$path"
  echo "Pushing $repo:$TAG"
  docker push "$repo:$TAG"
}

ensure_docker
docker_login_if_needed

build_and_push "$GATEWAY_DIR" "$GATEWAY_REPO"
build_and_push "$MOVIE_DIR" "$MOVIE_REPO"
build_and_push "$USER_DIR" "$USER_REPO"

echo "\nAll images built and pushed as $DOCKER_USERNAME/*:$TAG"

cat <<'USAGE' >&2
Usage examples:

# Provide credentials via env vars (non-interactive):
# DOCKER_USERNAME=andresmg42 DOCKER_PASSWORD=your_password TAG=v1.0 ./infrastructure/scripts/build-and-publish.sh

# Or login interactively beforehand and run:
# docker login
# TAG=v1.0 ./infrastructure/scripts/build-and-publish.sh

You can override repo names or build args by editing the script or exporting BUILD_ARGS.
USAGE