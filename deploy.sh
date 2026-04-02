#!/usr/bin/env bash
#
# deploy.sh — 一键构建并部署 new-api
#
# 用法:
#   ./deploy.sh              # 默认: 构建镜像 + 生成 compose + 部署
#   ./deploy.sh deploy       # 同上: 构建镜像 + 生成 compose + 部署
#   ./deploy.sh build        # 仅构建镜像
#   ./deploy.sh up           # 生成 compose 并启动 (使用已有镜像)
#   ./deploy.sh down         # 停止并移除 new-api 容器
#   ./deploy.sh stop         # 暂停: 仅停止 new-api 容器（不删除，可 start 恢复）
#   ./deploy.sh start        # 启动已存在的 new-api 容器（配合 stop 使用）
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
#   DORIS_ENABLED 是否启用 Doris 详细请求日志: true / false (默认: true)
#   DORIS_HOST    Doris FE 地址 (compose 内嵌服务名 doris / 或外置 FE 主机名)
#   DORIS_PORT    外置 Doris 时: new-api 访问的 FE HTTP 端口 (默认 8030)。
#                 内嵌 doris 时: 仅表示「宿主机映射端口」(默认 8030)，容器内互联固定为 8030，勿与 8040(BE) 混淆。
#   DORIS_HTTP_PUBLISH_PORT  内嵌 doris 时宿主机暴露的 FE HTTP 端口 (默认与 DORIS_PORT 相同，可单独设避免歧义)
#   DORIS_PUBLISH_QUERY_PORT 内嵌 doris 时宿主机暴露的 MySQL 查询端口 (默认 9030，建表脚本从宿主机连 Doris 用)
#   DORIS_QUERY_PORT new-api 查日志用的 MySQL 协议端口 (默认 9030)
#   DORIS_FE_HOST   实际连接 Doris FE 的主机名（compose 内置时填 doris）；优先于 DORIS_HOST，避免误用 127.0.0.1
#   DORIS_DOCKER_SERVICE_NAME 容器内 DORIS_HOST 为回环时自动改为此服务名（默认由 deploy 内置 doris 时注入为 doris）
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
DB_TYPE="${DB_TYPE:-mysql}"
REDIS_URL="${REDIS_URL:-}"
SESSION_SECRET="${SESSION_SECRET:-$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32 2>/dev/null || echo 'change-me-in-production')}"

DORIS_ENABLED="${DORIS_ENABLED:-true}"
DORIS_HOST="${DORIS_HOST:-doris}"
DORIS_PORT_WAS_SET="${DORIS_PORT+x}"
DORIS_PORT="${DORIS_PORT:-8030}"
DORIS_QUERY_PORT="${DORIS_QUERY_PORT:-9030}"
DORIS_PUBLISH_QUERY_PORT="${DORIS_PUBLISH_QUERY_PORT:-9030}"
DORIS_USER="${DORIS_USER:-root}"
DORIS_PASSWORD="${DORIS_PASSWORD:-}"
DORIS_DATABASE="${DORIS_DATABASE:-new_api}"
DORIS_TABLE="${DORIS_TABLE:-request_logs}"
DORIS_FE_HOST="${DORIS_FE_HOST:-}"
DORIS_DOCKER_SERVICE_NAME="${DORIS_DOCKER_SERVICE_NAME:-}"

is_loopback_host() {
    case "$1" in
        127.0.0.1|localhost|::1)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

sanitize_doris_host_and_port() {
    local raw="$DORIS_HOST"
    local host="$raw"
    local parsed_port=""

    host="${host#http://}"
    host="${host#https://}"
    host="${host%%/*}"

    if [[ "$host" == *"@"* ]]; then
        host="${host##*@}"
        warn "检测到 DORIS_HOST 包含账号信息，已自动剥离为 ${host}（账号请使用 DORIS_USER/DORIS_PASSWORD）"
    fi

    if [[ "$host" =~ ^\[([^]]+)\]:([0-9]+)$ ]]; then
        host="${BASH_REMATCH[1]}"
        parsed_port="${BASH_REMATCH[2]}"
    elif [[ "$host" =~ ^([^:]+):([0-9]+)$ ]]; then
        host="${BASH_REMATCH[1]}"
        parsed_port="${BASH_REMATCH[2]}"
    elif [[ "$host" =~ ^\[([^]]+)\]$ ]]; then
        host="${BASH_REMATCH[1]}"
    fi

    DORIS_HOST="$host"
    if [ -n "$parsed_port" ] && [ -z "$DORIS_PORT_WAS_SET" ]; then
        DORIS_PORT="$parsed_port"
        info "从 DORIS_HOST 解析 Doris HTTP 端口为 ${DORIS_PORT}（未单独设置 DORIS_PORT）"
    fi
}

normalize_doris_config() {
    if [ "$DORIS_ENABLED" != "true" ]; then
        return
    fi

    sanitize_doris_host_and_port

    if is_loopback_host "$DORIS_HOST"; then
        warn "检测到 DORIS_HOST=${DORIS_HOST}（容器内回环地址不可达），已自动改为 compose 服务名 doris"
        DORIS_HOST="doris"
        if [ -z "$DORIS_FE_HOST" ] || is_loopback_host "$DORIS_FE_HOST"; then
            DORIS_FE_HOST="doris"
        fi
    fi

    if [ "$DORIS_PORT" = "8040" ]; then
        warn "检测到 DORIS_PORT=8040（通常是 Doris BE 端口），已自动改为 FE HTTP 端口 8030"
        DORIS_PORT="8030"
    fi

    if [ "$DORIS_HOST" = "doris" ]; then
        DORIS_FE_HOST="${DORIS_FE_HOST:-doris}"
        DORIS_DOCKER_SERVICE_NAME="${DORIS_DOCKER_SERVICE_NAME:-doris}"
    fi
}

normalize_doris_config

# 内嵌 doris 时映射到宿主机的 FE HTTP 左端口；未单独指定时沿用 DORIS_PORT（兼容旧用法）
if [ -z "${DORIS_HTTP_PUBLISH_PORT:-}" ]; then
    if [ "$DORIS_HOST" = "doris" ]; then
        DORIS_HTTP_PUBLISH_PORT="$DORIS_PORT"
    else
        DORIS_HTTP_PUBLISH_PORT="8030"
    fi
fi

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
        # 与 compose 中的 doris 服务通信必须用容器内端口 8030/9030；勿把宿主机映射端口当作 DORIS_PORT 传入
        if [ "$DORIS_HOST" = "doris" ]; then
            env_lines+="      - DORIS_PORT=8030\n"
            env_lines+="      - DORIS_QUERY_PORT=9030\n"
        else
            env_lines+="      - DORIS_PORT=${DORIS_PORT}\n"
            env_lines+="      - DORIS_QUERY_PORT=${DORIS_QUERY_PORT}\n"
        fi
        env_lines+="      - DORIS_USER=${DORIS_USER}\n"
        env_lines+="      - DORIS_PASSWORD=${DORIS_PASSWORD}\n"
        env_lines+="      - DORIS_DATABASE=${DORIS_DATABASE}\n"
        env_lines+="      - DORIS_TABLE=${DORIS_TABLE}\n"
        # 容器内 Doris 连通性纠偏变量：DORIS_FE_HOST 优先，DORIS_DOCKER_SERVICE_NAME 用于回环地址自动替换
        if [ -n "$DORIS_FE_HOST" ]; then
            env_lines+="      - DORIS_FE_HOST=${DORIS_FE_HOST}\n"
        fi
        if [ -n "$DORIS_DOCKER_SERVICE_NAME" ]; then
            env_lines+="      - DORIS_DOCKER_SERVICE_NAME=${DORIS_DOCKER_SERVICE_NAME}\n"
        fi
    fi

    local depends_on=""
    local extra_services=""
    local -a volume_names=()

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
            volume_names+=("pg_data")
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
            volume_names+=("mysql_data")
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
    image: apache/doris:doris-all-in-one-2.1.0
    container_name: ${COMPOSE_PROJECT}-doris
    restart: always
    ports:
      - \"${DORIS_HTTP_PUBLISH_PORT}:8030\"
      - \"${DORIS_PUBLISH_QUERY_PORT}:9030\"
    volumes:
      - doris_data:/opt/apache-doris
    environment:
      - FE_SERVERS=fe1:127.0.0.1:9010
      - FE_ID=1
    networks:
      - app-network"
        volume_names+=("doris_data")
    fi

    local volumes_block=""
    for v in "${volume_names[@]}"; do
        volumes_block+="
  ${v}:"
    done

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
  data:${volumes_block}

networks:
  app-network:
    driver: bridge
YAML
    info "生成 docker-compose.deploy.yml -> $(pwd)/docker-compose.deploy.yml"
}

do_doris_setup() {
    if [ "$DORIS_ENABLED" != "true" ]; then
        warn "Doris 未启用 (DORIS_ENABLED!=true)，跳过建表"
        return
    fi

    if ! command -v mysql >/dev/null 2>&1; then
        warn "未找到 mysql 客户端，跳过自动建表。"
        warn "请安装 mysql 客户端后手动执行: DORIS_HOST=$DORIS_HOST bash scripts/doris-setup.sh"
        return
    fi

    local doris_query_port="$DORIS_QUERY_PORT"
    local doris_host="$DORIS_HOST"

    # 如果 DORIS_HOST 是 compose 服务名，从宿主机连 Doris 要用映射后的查询端口
    if [[ "$doris_host" == "doris" ]]; then
        doris_host="127.0.0.1"
        doris_query_port="$DORIS_PUBLISH_QUERY_PORT"
        info "检测到 DORIS_HOST=doris（容器名），建表使用 127.0.0.1:${doris_query_port}（宿主机映射 -> 容器 9030）"
    fi

    info "初始化 Doris 表结构 (${doris_host}:${doris_query_port}) ..."
    local max_retries=30
    local retry=0

    while [ $retry -lt $max_retries ]; do
        if mysql -h "$doris_host" -P "$doris_query_port" -u "$DORIS_USER" \
            ${DORIS_PASSWORD:+-p"$DORIS_PASSWORD"} --batch --skip-column-names \
            -e "SELECT 1" >/dev/null 2>&1; then
            break
        fi
        retry=$((retry + 1))
        warn "等待 Doris 就绪... ($retry/$max_retries)"
        sleep 2
    done

    if [ $retry -ge $max_retries ]; then
        warn "Doris 未就绪，跳过建表。请稍后手动执行:"
        warn "  DORIS_HOST=$doris_host bash scripts/doris-setup.sh"
        return
    fi

    info "Doris 已就绪，执行建表脚本..."
    DORIS_HOST="$doris_host" \
    DORIS_QUERY_PORT="$doris_query_port" \
    DORIS_USER="$DORIS_USER" \
    DORIS_PASSWORD="$DORIS_PASSWORD" \
    DORIS_DATABASE="$DORIS_DATABASE" \
    DORIS_TABLE="$DORIS_TABLE" \
    bash "$SCRIPT_DIR/scripts/doris-setup.sh"
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

    # 启用 Doris 时自动执行建表脚本
    if [ "$DORIS_ENABLED" = "true" ]; then
        do_doris_setup
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
        if [ "$DORIS_HOST" = "doris" ]; then
            info "  Doris:    new-api -> ${DORIS_HOST}:8030(StreamLoad)/9030(查询); 宿主机映射 HTTP ${DORIS_HTTP_PUBLISH_PORT}->8030, 查询 ${DORIS_PUBLISH_QUERY_PORT}->9030; 库表 ${DORIS_DATABASE}.${DORIS_TABLE}"
        else
            info "  Doris:    ${DORIS_HOST}:${DORIS_PORT}(HTTP)/${DORIS_QUERY_PORT}(查询) ${DORIS_DATABASE}.${DORIS_TABLE}"
        fi
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
        if [ "$DORIS_HOST" = "doris" ]; then
            warn "docker run 单机模式无法解析服务名 doris，请改用 compose 部署或设置外置 DORIS_HOST"
        fi
        env_args+=(
            -e "DORIS_HOST=${DORIS_HOST}"
            -e "DORIS_PORT=${DORIS_PORT}"
            -e "DORIS_QUERY_PORT=${DORIS_QUERY_PORT}"
            -e "DORIS_USER=${DORIS_USER}"
            -e "DORIS_PASSWORD=${DORIS_PASSWORD}"
            -e "DORIS_DATABASE=${DORIS_DATABASE}"
            -e "DORIS_TABLE=${DORIS_TABLE}"
        )
        if [ -n "$DORIS_FE_HOST" ]; then
            env_args+=(-e "DORIS_FE_HOST=${DORIS_FE_HOST}")
        fi
        if [ -n "$DORIS_DOCKER_SERVICE_NAME" ]; then
            env_args+=(-e "DORIS_DOCKER_SERVICE_NAME=${DORIS_DOCKER_SERVICE_NAME}")
        fi
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

do_stop() {
    local compose_cmd
    compose_cmd="$(get_compose_cmd)"

    if [ -n "$compose_cmd" ] && [ -f "$(pwd)/docker-compose.deploy.yml" ]; then
        $compose_cmd -f "$(pwd)/docker-compose.deploy.yml" -p "$COMPOSE_PROJECT" stop new-api
    else
        docker stop "$COMPOSE_PROJECT" 2>/dev/null || true
    fi
    info "new-api 已暂停（容器保留，使用 ./deploy.sh start 恢复）"
}

do_start() {
    local compose_cmd
    compose_cmd="$(get_compose_cmd)"

    if [ -n "$compose_cmd" ] && [ -f "$(pwd)/docker-compose.deploy.yml" ]; then
        $compose_cmd -f "$(pwd)/docker-compose.deploy.yml" -p "$COMPOSE_PROJECT" start new-api
    else
        docker start "$COMPOSE_PROJECT" 2>/dev/null || warn "未找到运行过的容器，请使用 ./deploy.sh up"
    fi
    info "new-api 已启动（若失败请先 ./deploy.sh up 完整部署）"
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
    echo "  down       停止并删除 new-api 容器"
    echo "  stop       暂停 new-api（只 stop，不删容器；MySQL/Redis/Doris 等仍运行）"
    echo "  start      启动已存在的 new-api 容器（与 stop 配对）"
    echo "  restart    重新生成 compose 并重启 new-api 服务"
    echo "  doris-setup 手动执行 Doris 建表/升级脚本"
    echo "  logs       查看实时日志"
    echo "  status     查看服务状态"
    echo "  help       显示此帮助"
    echo ""
    echo "环境变量:"
    echo "  PORT=3010          对外端口"
    echo "  DB_TYPE=sqlite     数据库: postgres / mysql / sqlite"
    echo "  DB_DSN=...         自定义数据库 DSN (覆盖 DB_TYPE)"
    echo "  REDIS_URL=...      Redis 连接串"
    echo "  DORIS_ENABLED=true  是否启用 Doris 详细请求日志"
    echo "  DORIS_HOST=doris   内嵌 Doris 服务名；外置时填 FE 可达主机名"
    echo "  DORIS_PORT=8030    外置: new-api 访问的 FE HTTP 端口；内嵌: 宿主机 HTTP 映射左端口(默认8030)"
    echo "  DORIS_HTTP_PUBLISH_PORT= 内嵌时宿主机 HTTP 映射(可选，默认同 DORIS_PORT)"
    echo "  DORIS_PUBLISH_QUERY_PORT=9030 内嵌时宿主机 MySQL 查询端口映射"
    echo "  DORIS_QUERY_PORT=9030  new-api 查日志用的查询端口(外置时按实际 FE)"
    echo "  DORIS_FE_HOST=doris   compose 内置 Doris 时由脚本注入，勿删；勿把 DORIS_HOST 改成 127.0.0.1"
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
    echo "  DORIS_ENABLED=false ./deploy.sh                  # 禁用 Doris"
    echo "  DORIS_HOST=10.0.0.1 ./deploy.sh                  # 使用外部 Doris"
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
    stop)
        do_stop
        ;;
    start)
        do_start
        ;;
    restart)
        do_restart
        ;;
    doris-setup)
        do_doris_setup
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
