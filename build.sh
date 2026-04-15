#!/usr/bin/env bash
# build.sh — 使用国内源构建 Docker 镜像
# 用法:
#   ./build.sh <镜像名>              # 构建镜像，tag 为 git short hash
#   ./build.sh <镜像名> <tag>        # 构建镜像，指定 tag
#   ./build.sh <镜像名> --push       # 构建并推送
#   ./build.sh <镜像名> <tag> --push # 构建指定 tag 并推送
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── 参数解析 ──────────────────────────────────────────────
if [[ -z "${1:-}" ]]; then
    echo "用法: ./build.sh <镜像名> [tag] [--push]" >&2
    echo "" >&2
    echo "示例:" >&2
    echo "  ./build.sh myapp" >&2
    echo "  ./build.sh myapp v1.0" >&2
    echo "  ./build.sh registry.cn-beijing.aliyuncs.com/ns/app --push" >&2
    exit 1
fi

IMAGE_NAME="$1"
shift

PUSH=false
IMAGE_TAG=""

for arg in "$@"; do
    case "$arg" in
        --push) PUSH=true ;;
        *)      IMAGE_TAG="$arg" ;;
    esac
done

IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
PLATFORM="linux/$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')"

echo "============================================"
echo "  镜像:    ${IMAGE_NAME}:${IMAGE_TAG}"
echo "  平台:    ${PLATFORM}"
echo "  Dockerfile: Dockerfile.cn (国内源)"
echo "  推送:    ${PUSH}"
echo "============================================"

# ── 构建 ──────────────────────────────────────────────────
docker build \
    --platform "$PLATFORM" \
    -f Dockerfile.cn \
    -t "${IMAGE_NAME}:${IMAGE_TAG}" \
    -t "${IMAGE_NAME}:latest" \
    .

echo "构建完成: ${IMAGE_NAME}:${IMAGE_TAG}"

# ── 推送（可选）──────────────────────────────────────────
if [[ "$PUSH" == true ]]; then
    echo "推送 ${IMAGE_NAME}:${IMAGE_TAG} ..."
    docker push "${IMAGE_NAME}:${IMAGE_TAG}"
    docker push "${IMAGE_NAME}:latest"
    echo "推送完成"
fi

echo "Done: ${IMAGE_NAME}:${IMAGE_TAG}"
