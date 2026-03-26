#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="${1:-${IMAGE_NAME:-new-api}}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
PLATFORM="linux/$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')"

echo "Building ${IMAGE_NAME}:${IMAGE_TAG} (${PLATFORM})"

docker build \
    --platform "$PLATFORM" \
    -t "${IMAGE_NAME}:${IMAGE_TAG}" \
    -t "${IMAGE_NAME}:latest" \
    .

echo "Done: ${IMAGE_NAME}:${IMAGE_TAG}"
