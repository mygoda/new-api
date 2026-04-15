#!/usr/bin/env bash
#
# update.sh — 拉取指定版本镜像并更新 new-api 服务
#
# 用法:
#   ./update.sh <tag>            # 拉取指定版本镜像并重启服务
#   ./update.sh latest           # 拉取 latest 镜像并重启
#
# 环境变量:
#   REGISTRY        镜像仓库地址 (默认: maas-token-cn-beijing.cr.volces.com/new-api/newapi)
#   IMAGE_NAME      本地镜像名称 (默认: new-api)
#   COMPOSE_FILE    compose 文件路径 (默认: docker-compose.deploy.yml)
#

set -euo pipefail

# ─── 颜色输出 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ─── 路径 ───
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 参数 ───
if [ $# -lt 1 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "用法: ./update.sh <tag>"
    echo ""
    echo "示例:"
    echo "  ./update.sh c6379fbb     # 更新到指定版本"
    echo "  ./update.sh latest       # 更新到 latest"
    echo ""
    echo "环境变量:"
    echo "  REGISTRY      镜像仓库 (默认: maas-token-cn-beijing.cr.volces.com/new-api/newapi)"
    echo "  IMAGE_NAME    本地镜像名 (默认: new-api)"
    echo "  COMPOSE_FILE  compose 文件 (默认: docker-compose.deploy.yml)"
    [ $# -lt 1 ] && exit 1 || exit 0
fi

IMAGE_TAG="$1"
REGISTRY="${REGISTRY:-maas-token-cn-beijing.cr.volces.com/new-api/newapi}"
IMAGE_NAME="${IMAGE_NAME:-new-api}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.deploy.yml}"

# ─── 检查依赖 ───
command -v docker >/dev/null 2>&1 || error "未找到 docker"

# ─── compose 命令 ───
get_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo "docker-compose"
    else
        echo ""
    fi
}

info "========================================="
info "  更新 new-api"
info "  远程镜像: ${REGISTRY}:${IMAGE_TAG}"
info "  本地镜像: ${IMAGE_NAME}:latest"
info "========================================="
echo ""

# ─── Step 1: 拉取镜像 ───
info "拉取镜像 ${REGISTRY}:${IMAGE_TAG} ..."
docker pull "${REGISTRY}:${IMAGE_TAG}"
echo ""

# ─── Step 2: 打本地 tag ───
info "更新本地 tag: ${IMAGE_NAME}:latest -> ${REGISTRY}:${IMAGE_TAG}"
docker tag "${REGISTRY}:${IMAGE_TAG}" "${IMAGE_NAME}:latest"

# ─── Step 3: 重启服务 ───
COMPOSE_CMD="$(get_compose_cmd)"

if [ -n "$COMPOSE_CMD" ] && [ -f "$SCRIPT_DIR/$COMPOSE_FILE" ]; then
    info "使用 Docker Compose 重启 new-api 服务..."
    $COMPOSE_CMD -f "$SCRIPT_DIR/$COMPOSE_FILE" up -d --no-deps --force-recreate new-api
else
    info "使用 docker restart 重启容器..."
    docker restart new-api
fi
echo ""

# ─── Step 4: 等待健康检查 ───
info "等待服务就绪..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' new-api 2>/dev/null || echo "unknown")
    case "$STATUS" in
        healthy)
            break
            ;;
        unhealthy)
            warn "容器健康检查失败"
            docker logs --tail 20 new-api
            error "服务启动异常，请检查日志: docker logs new-api"
            ;;
    esac
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    warn "等待健康检查超时 (${MAX_WAIT}s)，服务可能仍在启动中"
fi

# ─── 完成 ───
CONTAINER_STATUS=$(docker ps --filter "name=^new-api$" --format "{{.Status}}" 2>/dev/null || echo "unknown")
echo ""
info "========================================="
info "  更新成功"
info "  镜像: ${REGISTRY}:${IMAGE_TAG}"
info "  容器: new-api, ${CONTAINER_STATUS}"
info "========================================="
