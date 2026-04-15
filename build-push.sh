#!/usr/bin/env bash
#
# build-push.sh — 国内服务器一键构建 + 推送镜像到火山引擎容器仓库
#
# 用法:
#   ./build-push.sh                  # 拉取代码、构建并推送（tag 为 git short hash）
#   ./build-push.sh <tag>            # 指定自定义 tag
#   ./build-push.sh --no-push        # 仅构建，不推送
#   ./build-push.sh <tag> --no-push  # 指定 tag + 仅构建
#
# 环境变量:
#   REGISTRY      镜像仓库地址 (默认: maas-token-cn-beijing.cr.volces.com/new-api/newapi)
#   DOCKERFILE    构建用 Dockerfile (默认: Dockerfile.cn)
#   PLATFORM      构建平台 (默认: linux/amd64)
#   SKIP_PULL     跳过 git pull (设为 true 时不拉取代码)
#   BRANCH        git pull 的目标分支 (默认: 当前分支)
#

set -euo pipefail

# ─── 颜色输出 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ─── 路径 ───
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 参数解析 ───
CUSTOM_TAG=""
NO_PUSH=false

for arg in "$@"; do
    case "$arg" in
        --no-push)
            NO_PUSH=true
            ;;
        --help|-h)
            echo -e "${CYAN}build-push.sh${NC} — 国内服务器一键构建 + 推送镜像"
            echo ""
            echo "用法: ./build-push.sh [tag] [--no-push]"
            echo ""
            echo "参数:"
            echo "  tag          自定义镜像标签 (默认: git short hash)"
            echo "  --no-push    仅构建，不推送到远程仓库"
            echo ""
            echo "环境变量:"
            echo "  REGISTRY     镜像仓库 (默认: maas-token-cn-beijing.cr.volces.com/new-api/newapi)"
            echo "  DOCKERFILE   Dockerfile (默认: Dockerfile.cn)"
            echo "  PLATFORM     构建平台 (默认: linux/amd64)"
            echo "  SKIP_PULL    跳过 git pull (设为 true)"
            echo "  BRANCH       拉取的目标分支 (默认: 当前分支)"
            echo ""
            echo "示例:"
            echo "  ./build-push.sh                          # 构建 + 推送"
            echo "  ./build-push.sh v1.0.0                   # 指定 tag"
            echo "  ./build-push.sh --no-push                # 仅构建"
            echo "  REGISTRY=my-registry.com/app ./build-push.sh  # 自定义仓库"
            exit 0
            ;;
        *)
            if [ -z "$CUSTOM_TAG" ]; then
                CUSTOM_TAG="$arg"
            else
                error "未知参数: $arg (使用 --help 查看帮助)"
            fi
            ;;
    esac
done

# ─── 默认值 ───
REGISTRY="${REGISTRY:-maas-token-cn-beijing.cr.volces.com/new-api/newapi}"
DOCKERFILE="${DOCKERFILE:-Dockerfile.cn}"
PLATFORM="${PLATFORM:-linux/amd64}"
SKIP_PULL="${SKIP_PULL:-false}"
BRANCH="${BRANCH:-}"

# ─── 检查依赖 ───
command -v docker >/dev/null 2>&1 || error "未找到 docker，请先安装"
command -v git >/dev/null 2>&1 || error "未找到 git，请先安装"

if [ ! -f "$SCRIPT_DIR/$DOCKERFILE" ]; then
    error "Dockerfile 不存在: $DOCKERFILE"
fi

# ─── Step 1: 拉取最新代码 ───
if [ "$SKIP_PULL" != "true" ]; then
    info "拉取最新代码..."
    if [ -n "$BRANCH" ]; then
        git pull origin "$BRANCH"
    else
        git pull
    fi
    echo ""
else
    info "跳过 git pull (SKIP_PULL=true)"
fi

# ─── 确定 tag ───
if [ -n "$CUSTOM_TAG" ]; then
    IMAGE_TAG="$CUSTOM_TAG"
else
    IMAGE_TAG="$(git rev-parse --short HEAD)"
fi

info "========================================="
info "  构建配置"
info "  镜像:      ${REGISTRY}:${IMAGE_TAG}"
info "  Dockerfile: ${DOCKERFILE}"
info "  平台:      ${PLATFORM}"
info "  推送:      $([ "$NO_PUSH" = "true" ] && echo "否" || echo "是")"
info "========================================="
echo ""

# ─── Step 2: 构建 Docker 镜像 ───
info "开始构建镜像..."
BUILD_START=$(date +%s)

docker build \
    --platform "$PLATFORM" \
    -f "$DOCKERFILE" \
    -t "${REGISTRY}:${IMAGE_TAG}" \
    -t "${REGISTRY}:latest" \
    .

BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))
info "镜像构建完成 (耗时 ${BUILD_DURATION}s): ${REGISTRY}:${IMAGE_TAG}"
echo ""

# ─── Step 3: 推送镜像 ───
if [ "$NO_PUSH" = "true" ]; then
    info "跳过推送 (--no-push)"
else
    info "推送镜像到 ${REGISTRY}..."
    PUSH_START=$(date +%s)

    docker push "${REGISTRY}:${IMAGE_TAG}"
    docker push "${REGISTRY}:latest"

    PUSH_END=$(date +%s)
    PUSH_DURATION=$((PUSH_END - PUSH_START))
    info "镜像推送完成 (耗时 ${PUSH_DURATION}s)"
    echo ""
fi

# ─── 完成 ───
echo ""
info "========================================="
info "  构建推送完成"
info "  镜像: ${REGISTRY}:${IMAGE_TAG}"
info "  latest: 已同步更新"
if [ "$NO_PUSH" != "true" ]; then
    info "  拉取: docker pull ${REGISTRY}:${IMAGE_TAG}"
fi
info "========================================="
