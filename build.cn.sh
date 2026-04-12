#!/usr/bin/env bash
set -euo pipefail

REGISTRY="maas-token-cn-beijing.cr.volces.com/new-api/newapi"
IMAGE_TAG="${1:-$(git rev-parse --short HEAD)}"

echo "Building ${REGISTRY}:${IMAGE_TAG}"

docker build --platform linux/amd64 \
  -f Dockerfile.cn \
  -t "${REGISTRY}:${IMAGE_TAG}" \
  -t "${REGISTRY}:latest" \
  .

echo "Pushing ${REGISTRY}:${IMAGE_TAG}"
docker push "${REGISTRY}:${IMAGE_TAG}"
docker push "${REGISTRY}:latest"

echo "Done: ${REGISTRY}:${IMAGE_TAG}"
