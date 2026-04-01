#!/usr/bin/env bash
#
# deploy.sh — 一键构建并部署 new-api
#
# 用法:
#   ./deploy.sh              # 默认: 构建镜像 + 生成 compose + 部署
#   ./deploy.sh deploy       # 同上: 构建镜像 + 生成 compose + 部署
#   ./deploy.sh build        # 仅构建镜像
#   ./deploy.sh up           # 生成 compose 并启动 (使用已有镜像)
#   ./deploy.sh down         # 停止并移除容器
#   ./deploy.sh restart      # 重新生成 compose 并重启 new-api 服务
#   ./deploy.sh logs         # 查看实时日志
#   ./deploy.sh status       # 查看服务状态
#
# 环境变量:
#   IMAGE_NAME    镜像名称 (默认: new-api)
#   IMAGE_TAG     镜像标签 (默认: git commit hash)
#   PORT          对外端口 (默认: 3010)
#   DB_TYPE       数据库类型: postgres / mysql / sqlite (默认: sqlite)
#   DB_DSN        自定义数据库 DSN (覆盖 DB_TYPE 的默认值)
#   REDIS_URL     Redis 连接串 (默认: 不使用 Redis)
#   DORIS_ENABLED 是否启用 Doris 详细请求日志: true / false (默认: false)
#   DORIS_HOST    Doris FE 地址 (启用 Doris 时必填, 默认: doris)
#   DORIS_PORT    Doris FE HTTP 端口 (默认: 8030)
#   DORIS_USER    Doris 用户名 (默认: root)
#   DORIS_PASSWORD Doris 密码 (默认: 空)
#   DORIS_DATABASE Doris 数据库名 (默认: new_api)
#   DORIS_TABLE   Doris 表名 (默认: request_logs)
#   SESSION_SECRET  会话密钥 (默认: 自动生成)
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

# ─── 默认值 ───
IMAGE_NAME="${IMAGE_NAME:-new-api}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
PORT="${PORT:-3010}"
DB_TYPE="${DB_TYPE:-sqlite}"
REDIS_URL="${REDIS_URL:-}"
SESSION_SECRET="${SESSION_SECRET:-$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32 2>/dev/null || echo 'change-me-in-production')}"

DORIS_ENABLED="${DORIS_ENABLED:-false}"
DORIS_HOST="${DORIS_HOST:-doris}"
DORIS_PORT="${DORIS_PORT:-8030}"
DORIS_USER="${DORIS_USER:-root}"
DORIS_PASSWORD="${DORIS_PASSWORD:-}"
DORIS_DATABASE="${DORIS_DATABASE:-new_api}"
DORIS_TABLE="${DORIS_TABLE:-request_logs}"

DATA_DIR="$SCRIPT_DIR/data"
LOG_DIR="$SCRIPT_DIR/logs"
COMPOSE_PROJECT="new-api"

# ─── 函数 ───

check_deps() {
    local missing=()
    command -v docker >/dev/null 2>&1 || missing+=("docker")
    if [ ${#missing[@]} -gt 0 ]; then
        error "缺少依赖: ${missing[*]}，请先安装"
    fi
}

get_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo "docker-compose"
    else
        echo ""
    fi
}

get_db_dsn() {
    if [ -n "${DB_DSN:-}" ]; then
        echo "$DB_DSN"
        return
    fi
    case "$DB_TYPE" in
        postgres)
            echo "postgresql://root:123456@postgres:5432/new-api"
            ;;
        mysql)
            echo "root:123456@tcp(mysql:3306)/new-api"
            ;;
        sqlite)
            echo ""  # SQLite 不需要 DSN，使用默认路径
            ;;
        *)
            error "不支持的数据库类型: $DB_TYPE (可选: postgres / mysql / sqlite)"
            ;;
    esac
}

do_build() {
    info "构建 Docker 镜像: ${IMAGE_NAME}:${IMAGE_TAG}"
    docker build \
        --platform "linux/$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')" \
        -t "${IMAGE_NAME}:${IMAGE_TAG}" \
        -t "${IMAGE_NAME}:latest" \
        .
    info "镜像构建完成: ${IMAGE_NAME}:${IMAGE_TAG}"
}

generate_compose() {
    local db_dsn
    db_dsn="$(get_db_dsn)"

    local env_lines=""
    env_lines+="      - TZ=Asia/Shanghai\n"
    env_lines+="      - SESSION_SECRET=${SESSION_SECRET}\n"
    env_lines+="      - ERROR_LOG_ENABLED=true\n"
    env_lines+="      - BATCH_UPDATE_ENABLED=true\n"

    if [ -n "$db_dsn" ]; then
        env_lines+="      - SQL_DSN=${db_dsn}\n"
    fi

    if [ -n "$REDIS_URL" ]; then
        env_lines+="      - REDIS_CONN_STRING=${REDIS_URL}\n"
    fi

    if [ "$DORIS_ENABLED" = "true" ]; then
        env_lines+="      - DORIS_HOST=${DORIS_HOST}\n"
        env_lines+="      - DORIS_PORT=${DORIS_PORT}\n"
        env_lines+="      - DORIS_USER=${DORIS_USER}\n"
        env_lines+="      - DORIS_PASSWORD=${DORIS_PASSWORD}\n"
        env_lines+="      - DORIS_DATABASE=${DORIS_DATABASE}\n"
        env_lines+="      - DORIS_TABLE=${DORIS_TABLE}\n"
    fi

    local depends_on=""
    local extra_services=""
    local extra_volumes=""

    case "$DB_TYPE" in
        postgres)
            depends_on="    depends_on:\n      - postgres"
            extra_services="
  postgres:
    image: postgres:15
    container_name: ${COMPOSE_PROJECT}-postgres
    restart: always
    environment:
      POSTGRES_USER: root
      POSTGRES_PASSWORD: '123456'
      POSTGRES_DB: new-api
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - app-network"
            extra_volumes="\n  pg_data:"
            ;;
        mysql)
            depends_on="    depends_on:\n      - mysql"
            extra_services="
  mysql:
    image: mysql:8.2
    container_name: ${COMPOSE_PROJECT}-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: '123456'
      MYSQL_DATABASE: new-api
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - app-network"
            extra_volumes="\n  mysql_data:"
            ;;
    esac

    if [ -n "$REDIS_URL" ] && [[ "$REDIS_URL" == *"redis:"* ]]; then
        depends_on+="${depends_on:+\n}      - redis"
        extra_services+="
  redis:
    image: redis:latest
    container_name: ${COMPOSE_PROJECT}-redis
    restart: always
    networks:
      - app-network"
    fi

    if [ "$DORIS_ENABLED" = "true" ] && [ "$DORIS_HOST" = "doris" ]; then
        depends_on+="${depends_on:+\n}      - doris"
        extra_services+="
  doris:
    image: apache/doris:doris-all-in-one-2.1.7
    container_name: ${COMPOSE_PROJECT}-doris
    restart: always
    ports:
      - \"${DORIS_PORT}:8030\"
      - \"9030:9030\"
    volumes:
      - doris_data:/opt/apache-doris
    environment:
      - FE_SERVERS=fe1:127.0.0.1:9010
      - FE_ID=1
    networks:
      - app-network"
        extra_volumes+="\n  doris_data:"
    fi

    cat > "$(pwd)/docker-compose.deploy.yml" <<YAML
# Auto-generated by deploy.sh — $(date '+%Y-%m-%d %H:%M:%S')
# DB_TYPE=${DB_TYPE}  PORT=${PORT}

services:
  new-api:
    image: ${IMAGE_NAME}:latest
    container_name: ${COMPOSE_PROJECT}
    restart: always
    command: --log-dir /app/logs
    ports:
      - "${PORT}:3010"
    volumes:
      - ${DATA_DIR}:/data
      - ${LOG_DIR}:/app/logs
    environment:
$(echo -e "$env_lines" | sed '/^$/d')
$([ -n "$depends_on" ] && echo -e "$depends_on" || true)
    networks:
      - app-network
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O - http://localhost:3010/api/status | grep -o 'success' || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
${extra_services}

volumes:
  data:${extra_volumes}

networks:
  app-network:
    driver: bridge
YAML
    info "生成 docker-compose.deploy.yml -> $(pwd)/docker-compose.deploy.yml"
}

do_up() {
    mkdir -p "$DATA_DIR" "$LOG_DIR"

    local compose_cmd
    compose_cmd="$(get_compose_cmd)"

    if [ -n "$compose_cmd" ]; then
        generate_compose
        info "使用 Docker Compose 启动服务..."
        $compose_cmd -f "$(pwd)/docker-compose.deploy.yml" -p "$COMPOSE_PROJECT" up -d
    else
        info "未检测到 Docker Compose，使用 docker run 启动..."
        do_run_standalone
    fi

    echo ""
    info "========================================="
    info "  new-api 已启动!"
    info "  镜像名称: ${IMAGE_NAME}:${IMAGE_TAG}"
    info "  访问地址: http://localhost:${PORT}"
    info "  数据目录: ${DATA_DIR}"
    info "  日志目录: ${LOG_DIR}"
    info "  数据库:   ${DB_TYPE}"
    if [ "$DORIS_ENABLED" = "true" ]; then
    info "  Doris:    ${DORIS_HOST}:${DORIS_PORT}/${DORIS_DATABASE}.${DORIS_TABLE}"
    fi
    info "========================================="
}

do_run_standalone() {
    local db_dsn
    db_dsn="$(get_db_dsn)"

    # 停止旧容器
    docker rm -f "$COMPOSE_PROJECT" 2>/dev/null || true

    local env_args=(
        -e "TZ=Asia/Shanghai"
        -e "SESSION_SECRET=${SESSION_SECRET}"
        -e "ERROR_LOG_ENABLED=true"
        -e "BATCH_UPDATE_ENABLED=true"
    )

    if [ -n "$db_dsn" ]; then
        env_args+=(-e "SQL_DSN=${db_dsn}")
    fi
    if [ -n "$REDIS_URL" ]; then
        env_args+=(-e "REDIS_CONN_STRING=${REDIS_URL}")
    fi

    if [ "$DORIS_ENABLED" = "true" ]; then
        env_args+=(
            -e "DORIS_HOST=${DORIS_HOST}"
            -e "DORIS_PORT=${DORIS_PORT}"
            -e "DORIS_USER=${DORIS_USER}"
            -e "DORIS_PASSWORD=${DORIS_PASSWORD}"
            -e "DORIS_DATABASE=${DORIS_DATABASE}"
            -e "DORIS_TABLE=${DORIS_TABLE}"
        )
    fi

    docker run -d \
        --name "$COMPOSE_PROJECT" \
        --restart always \
        -p "${PORT}:3010" \
        -v "${DATA_DIR}:/data" \
        -v "${LOG_DIR}:/app/logs" \
        "${env_args[@]}" \
        "${IMAGE_NAME}:latest" \
        --log-dir /app/logs

    info "容器已启动: $COMPOSE_PROJECT (镜像: ${IMAGE_NAME}:latest)"
}

do_down() {
    local compose_cmd
    compose_cmd="$(get_compose_cmd)"

    if [ -n "$compose_cmd" ] && [ -f "$(pwd)/docker-compose.deploy.yml" ]; then
        # 只停止并移除 new-api 服务，不影响 postgres/redis 等其他服务
        $compose_cmd -f "$(pwd)/docker-compose.deploy.yml" -p "$COMPOSE_PROJECT" stop new-api
        $compose_cmd -f "$(pwd)/docker-compose.deploy.yml" -p "$COMPOSE_PROJECT" rm -f new-api
    else
        docker rm -f "$COMPOSE_PROJECT" 2>/dev/null || true
    fi
    info "new-api 服务已停止"
}

do_deploy() {
    info "========= 开始完整部署 ========="
    do_build
    info "重新生成 docker-compose 配置..."
    do_up
}

do_restart() {
    info "重启 new-api 服务..."
    local compose_cmd
    compose_cmd="$(get_compose_cmd)"

    if [ -n "$compose_cmd" ]; then
        generate_compose
        $compose_cmd -f "$(pwd)/docker-compose.deploy.yml" -p "$COMPOSE_PROJECT" up -d --no-deps --force-recreate new-api
    else
        docker rm -f "$COMPOSE_PROJECT" 2>/dev/null || true
        do_run_standalone
    fi
    info "new-api 服务已重启"
}

do_logs() {
    local compose_cmd
    compose_cmd="$(get_compose_cmd)"

    if [ -n "$compose_cmd" ] && [ -f "$(pwd)/docker-compose.deploy.yml" ]; then
        $compose_cmd -f "$(pwd)/docker-compose.deploy.yml" -p "$COMPOSE_PROJECT" logs -f --tail 100
    else
        docker logs -f --tail 100 "$COMPOSE_PROJECT"
    fi
}

do_status() {
    local compose_cmd
    compose_cmd="$(get_compose_cmd)"

    if [ -n "$compose_cmd" ] && [ -f "$(pwd)/docker-compose.deploy.yml" ]; then
        $compose_cmd -f "$(pwd)/docker-compose.deploy.yml" -p "$COMPOSE_PROJECT" ps
    else
        docker ps --filter "name=$COMPOSE_PROJECT" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    fi
}

show_help() {
    echo -e "${CYAN}deploy.sh${NC} — new-api 一键部署脚本"
    echo ""
    echo "用法: ./deploy.sh [命令]"
    echo ""
    echo "命令:"
    echo "  (无参数)    构建镜像 + 生成 compose + 部署 (等同 deploy)"
    echo "  deploy     构建镜像 + 生成 compose + 部署"
    echo "  build      仅构建 Docker 镜像"
    echo "  up         生成 compose 并启动 (使用已有镜像)"
    echo "  down       停止服务"
    echo "  restart    重新生成 compose 并重启 new-api 服务"
    echo "  logs       查看实时日志"
    echo "  status     查看服务状态"
    echo "  help       显示此帮助"
    echo ""
    echo "环境变量:"
    echo "  PORT=3010          对外端口"
    echo "  DB_TYPE=sqlite     数据库: postgres / mysql / sqlite"
    echo "  DB_DSN=...         自定义数据库 DSN (覆盖 DB_TYPE)"
    echo "  REDIS_URL=...      Redis 连接串"
    echo "  DORIS_ENABLED=false 是否启用 Doris 详细请求日志"
    echo "  DORIS_HOST=doris   Doris FE 地址 (doris=自动启动容器)"
    echo "  DORIS_PORT=8030    Doris FE HTTP 端口"
    echo "  DORIS_USER=root    Doris 用户名"
    echo "  DORIS_PASSWORD=    Doris 密码"
    echo "  DORIS_DATABASE=new_api  Doris 数据库名"
    echo "  DORIS_TABLE=request_logs Doris 表名"
    echo "  IMAGE_NAME=new-api 镜像名称"
    echo "  IMAGE_TAG=...      镜像标签 (默认: git hash)"
    echo ""
    echo "示例:"
    echo "  ./deploy.sh                                      # SQLite, 端口 3010"
    echo "  PORT=8080 ./deploy.sh                            # SQLite, 端口 8080"
    echo "  DB_TYPE=postgres ./deploy.sh                     # PostgreSQL + 自动启动 PG 容器"
    echo "  DB_DSN='postgres://u:p@host/db' ./deploy.sh up   # 自定义外部数据库"
    echo "  DORIS_ENABLED=true ./deploy.sh                   # 启用 Doris + 自动启动容器"
    echo "  DORIS_ENABLED=true DORIS_HOST=10.0.0.1 ./deploy.sh  # 使用外部 Doris"
}

# ─── 入口 ───
check_deps

case "${1:-}" in
    deploy)
        do_deploy
        ;;
    build)
        do_build
        ;;
    up)
        do_up
        ;;
    down)
        do_down
        ;;
    restart)
        do_restart
        ;;
    logs)
        do_logs
        ;;
    status)
        do_status
        ;;
    help|--help|-h)
        show_help
        ;;
    "")
        do_deploy
        ;;
    *)
        error "未知命令: $1 (使用 ./deploy.sh help 查看帮助)"
        ;;
esac
