#!/usr/bin/env bash
#
# deploy.prod.sh — new-api 生产环境部署脚本（主-从架构）
#
# 架构:
#   1 个 master 节点  —— 负责 DB 迁移、Midjourney/Task 异步任务、Web UI
#   N 个 slave  节点  —— 无状态 API 节点，共享外部 DB + Redis；
#                       通过 FRONTEND_BASE_URL 将 Web UI 302 到 master
#
# 关键约束:
#   • DB / Redis / Doris 等存储依赖**不**由本脚本部署，必须通过连接串外部接入。
#   • master 与所有 slave 必须使用**相同**的 SESSION_SECRET / CRYPTO_SECRET /
#     SQL_DSN / REDIS_CONN_STRING（以及 DORIS_* 若启用），否则会话、缓存、
#     加密数据、请求日志会错乱。
#   • 先部署 master（首次启动会跑数据库迁移），再部署 slave。
#
# 用法:
#   cp .env.prod.example .env.prod
#   vim .env.prod
#   ./deploy.prod.sh master              在主节点机器上执行
#   ./deploy.prod.sh slave               在每台从节点机器上执行
#
#   ./deploy.prod.sh pull                拉取最新镜像
#   ./deploy.prod.sh upgrade master      拉取最新镜像并重新部署 master
#   ./deploy.prod.sh upgrade slave       拉取最新镜像并重新部署 slave
#   ./deploy.prod.sh restart             重启当前容器
#   ./deploy.prod.sh logs                tail 容器日志
#   ./deploy.prod.sh status              查看容器与健康检查状态
#   ./deploy.prod.sh down                停止并移除容器
#   ./deploy.prod.sh config              打印最终生效的配置（脱敏）
#
# 一台主机上并行跑多个实例时使用不同的 env 文件：
#   ENV_FILE=.env.prod.slave-1 CONTAINER_NAME=new-api-slave-1 PORT=3011 \
#       ./deploy.prod.sh slave
#

set -euo pipefail

# ─── 颜色输出 ───
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
hr()    { echo -e "${CYAN}────────────────────────────────────────────────────────${NC}"; }

# ─── 路径 ───
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${ENV_FILE:-.env.prod}"

require_docker() {
    command -v docker >/dev/null 2>&1 || error "未找到 docker，请先安装 Docker 20.10+"
}

load_env() {
    if [[ ! -f "$ENV_FILE" ]]; then
        error "环境文件 '$ENV_FILE' 不存在。先执行: cp .env.prod.example $ENV_FILE 并填写后重试。"
    fi
    # 导出 .env.prod 中的所有变量
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
}

# ─── 默认值（可被 .env.prod 覆盖） ───
default_vars() {
    IMAGE="${IMAGE:-calciumion/new-api:latest}"
    PORT="${PORT:-3010}"
    CONTAINER_NAME="${CONTAINER_NAME:-}"
    TZ="${TZ:-Asia/Shanghai}"
    DATA_DIR="${DATA_DIR:-$SCRIPT_DIR/data}"
    LOGS_DIR="${LOGS_DIR:-$SCRIPT_DIR/logs}"
    NETWORK="${NETWORK:-bridge}"

    SQL_DSN="${SQL_DSN:-}"
    LOG_SQL_DSN="${LOG_SQL_DSN:-}"
    REDIS_CONN_STRING="${REDIS_CONN_STRING:-}"

    SESSION_SECRET="${SESSION_SECRET:-}"
    CRYPTO_SECRET="${CRYPTO_SECRET:-}"
    SYNC_FREQUENCY="${SYNC_FREQUENCY:-60}"

    MEMORY_CACHE_ENABLED="${MEMORY_CACHE_ENABLED:-true}"
    ERROR_LOG_ENABLED="${ERROR_LOG_ENABLED:-true}"
    BATCH_UPDATE_ENABLED="${BATCH_UPDATE_ENABLED:-true}"
    BATCH_UPDATE_INTERVAL="${BATCH_UPDATE_INTERVAL:-5}"
    RELAY_TIMEOUT="${RELAY_TIMEOUT:-}"

    FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-}"
    EXTRA_ENV="${EXTRA_ENV:-}"

    # Doris（请求日志，可选）：DORIS_HOST 为空 = 禁用
    DORIS_HOST="${DORIS_HOST:-}"
    DORIS_PORT="${DORIS_PORT:-8030}"
    DORIS_QUERY_PORT="${DORIS_QUERY_PORT:-9030}"
    DORIS_USER="${DORIS_USER:-root}"
    DORIS_PASSWORD="${DORIS_PASSWORD:-}"
    DORIS_DATABASE="${DORIS_DATABASE:-new_api}"
    DORIS_TABLE="${DORIS_TABLE:-request_logs}"
    DORIS_FLUSH_INTERVAL="${DORIS_FLUSH_INTERVAL:-5}"
    DORIS_FLUSH_BATCH_SIZE="${DORIS_FLUSH_BATCH_SIZE:-100}"
}

# ─── 通用校验 ───
validate_common() {
    [[ -n "$SQL_DSN"        ]] || error "SQL_DSN 不能为空，请在 $ENV_FILE 填入外部数据库连接串"
    [[ -n "$SESSION_SECRET" ]] || error "SESSION_SECRET 不能为空，多节点部署必须设置（且所有节点一致）"
    if [[ ${#SESSION_SECRET} -lt 32 ]]; then
        warn "SESSION_SECRET 长度 < 32，建议使用: openssl rand -hex 32"
    fi
    if [[ -z "$REDIS_CONN_STRING" ]]; then
        warn "REDIS_CONN_STRING 为空：无法启用多节点缓存/配置同步；生产多机部署强烈建议提供 Redis"
    else
        if [[ -z "$CRYPTO_SECRET" ]]; then
            warn "CRYPTO_SECRET 为空：将回退为 SESSION_SECRET 用于 Redis 数据加解密"
        fi
    fi
    case "$SQL_DSN" in
        sqlite*|file:*|*.db) error "检测到疑似 SQLite DSN；生产多节点部署不支持 SQLite，请改用 MySQL / PostgreSQL" ;;
    esac

    # Doris 相关校验：DORIS_HOST 为空即判定为禁用；否则做一致性检查
    if [[ -n "$DORIS_HOST" ]]; then
        case "$DORIS_HOST" in
            http://*|https://*)
                error "DORIS_HOST 不要带 http:// 前缀，应填主机名或 IP，例如: doris-fe.internal"
                ;;
            *:*)
                warn "DORIS_HOST 中包含 ':'，可能把端口写到主机里；请改用 DORIS_PORT 显式指定 FE HTTP 端口"
                ;;
        esac
        if [[ "$DORIS_PORT" == "8040" ]]; then
            warn "DORIS_PORT=8040 通常是 BE 端口；Stream Load 必须访问 FE HTTP 端口，默认 8030"
        fi
    else
        # DORIS_HOST 为空但其它 DORIS_* 被改动过：提醒用户实际上没有启用
        if [[ "$DORIS_USER" != "root" || -n "$DORIS_PASSWORD" || "$DORIS_DATABASE" != "new_api" || "$DORIS_TABLE" != "request_logs" ]]; then
            warn "检测到 DORIS_* 配置，但 DORIS_HOST 为空 —— Doris 未启用，请求日志仍写入 SQL_DSN / LOG_SQL_DSN"
        fi
    fi
}

# ─── 构造 docker run 参数 ───
build_common_args() {
    ARGS=(
        --name "$CONTAINER_NAME"
        --restart always
        --network "$NETWORK"
        -p "${PORT}:3010"
        -v "${DATA_DIR}:/data"
        -v "${LOGS_DIR}:/app/logs"
        -e "TZ=$TZ"
        -e "SQL_DSN=$SQL_DSN"
        -e "SESSION_SECRET=$SESSION_SECRET"
        -e "SYNC_FREQUENCY=$SYNC_FREQUENCY"
        -e "MEMORY_CACHE_ENABLED=$MEMORY_CACHE_ENABLED"
        -e "ERROR_LOG_ENABLED=$ERROR_LOG_ENABLED"
        -e "BATCH_UPDATE_ENABLED=$BATCH_UPDATE_ENABLED"
        -e "BATCH_UPDATE_INTERVAL=$BATCH_UPDATE_INTERVAL"
    )
    [[ -n "$LOG_SQL_DSN"       ]] && ARGS+=(-e "LOG_SQL_DSN=$LOG_SQL_DSN")
    [[ -n "$REDIS_CONN_STRING" ]] && ARGS+=(-e "REDIS_CONN_STRING=$REDIS_CONN_STRING")
    [[ -n "$CRYPTO_SECRET"     ]] && ARGS+=(-e "CRYPTO_SECRET=$CRYPTO_SECRET")
    [[ -n "$RELAY_TIMEOUT"     ]] && ARGS+=(-e "RELAY_TIMEOUT=$RELAY_TIMEOUT")

    # Doris：DORIS_HOST 非空时注入整组变量
    if [[ -n "$DORIS_HOST" ]]; then
        ARGS+=(
            -e "DORIS_HOST=$DORIS_HOST"
            -e "DORIS_PORT=$DORIS_PORT"
            -e "DORIS_QUERY_PORT=$DORIS_QUERY_PORT"
            -e "DORIS_USER=$DORIS_USER"
            -e "DORIS_DATABASE=$DORIS_DATABASE"
            -e "DORIS_TABLE=$DORIS_TABLE"
            -e "DORIS_FLUSH_INTERVAL=$DORIS_FLUSH_INTERVAL"
            -e "DORIS_FLUSH_BATCH_SIZE=$DORIS_FLUSH_BATCH_SIZE"
        )
        [[ -n "$DORIS_PASSWORD" ]] && ARGS+=(-e "DORIS_PASSWORD=$DORIS_PASSWORD")
    fi

    # 透传 EXTRA_ENV（逗号分隔的 key=val）
    if [[ -n "$EXTRA_ENV" ]]; then
        local IFS=','
        read -ra extras <<< "$EXTRA_ENV"
        for kv in "${extras[@]}"; do
            kv="${kv#"${kv%%[![:space:]]*}"}"   # trim 前导空格
            [[ -n "$kv" ]] && ARGS+=(-e "$kv")
        done
    fi
}

ensure_dirs() { mkdir -p "$DATA_DIR" "$LOGS_DIR"; }

container_exists() { docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; }

remove_if_exists() {
    if container_exists; then
        info "移除已存在的容器 $CONTAINER_NAME"
        docker rm -f "$CONTAINER_NAME" >/dev/null
    fi
}

run_container() {
    info "启动容器 $CONTAINER_NAME (image=$IMAGE, host_port=$PORT)"
    docker run -d "${ARGS[@]}" "$IMAGE" --log-dir /app/logs >/dev/null
    sleep 2
    docker ps --filter "name=^${CONTAINER_NAME}$" \
        --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
}

# ─── 角色部署 ───
deploy_master() {
    require_docker
    load_env
    default_vars
    validate_common

    CONTAINER_NAME="${CONTAINER_NAME:-new-api-master}"
    if [[ -n "$FRONTEND_BASE_URL" ]]; then
        warn "FRONTEND_BASE_URL 不应在 master 上设置，已忽略"
        FRONTEND_BASE_URL=""
    fi

    ensure_dirs
    build_common_args
    ARGS+=(-e "NODE_TYPE=master")

    remove_if_exists
    run_container
    hr
    info "Master 部署完成。访问: http://<host>:${PORT}"
    info "首次启动会执行数据库迁移，请观察 './deploy.prod.sh logs' 直到看到服务监听 3010。"
    info "随后在每个 slave 主机执行: ./deploy.prod.sh slave（务必使用相同的 SESSION_SECRET / CRYPTO_SECRET / SQL_DSN / REDIS_CONN_STRING）"
}

deploy_slave() {
    require_docker
    load_env
    default_vars
    validate_common

    CONTAINER_NAME="${CONTAINER_NAME:-new-api-slave}"
    if [[ -z "$FRONTEND_BASE_URL" ]]; then
        warn "FRONTEND_BASE_URL 未设置：slave 将自行渲染 Web UI；推荐设为 master 对外地址以统一管理面。"
    fi

    ensure_dirs
    build_common_args
    ARGS+=(-e "NODE_TYPE=slave")
    [[ -n "$FRONTEND_BASE_URL" ]] && ARGS+=(-e "FRONTEND_BASE_URL=$FRONTEND_BASE_URL")

    remove_if_exists
    run_container
    hr
    info "Slave 部署完成。请先确认 master 已正常启动（完成迁移），否则该 slave 的请求会因为 schema 不一致失败。"
}

# ─── 运维命令 ───
detect_container() {
    # 若未指定 CONTAINER_NAME，尝试按命名规则识别
    docker ps -a --format '{{.Names}}' \
        | grep -E '^new-api-(master|slave)' \
        | head -n1 || true
}

resolve_name() {
    local name="${CONTAINER_NAME:-}"
    [[ -z "$name" ]] && name="$(detect_container)"
    echo "$name"
}

cmd_pull() {
    require_docker
    load_env
    default_vars
    info "拉取镜像 $IMAGE"
    docker pull "$IMAGE"
}

cmd_upgrade() {
    local role="${1:-}"
    [[ -z "$role" ]] && error "upgrade 后需指定 master 或 slave，例如: ./deploy.prod.sh upgrade master"
    cmd_pull
    case "$role" in
        master) deploy_master ;;
        slave)  deploy_slave ;;
        *)      error "未知角色: $role" ;;
    esac
}

cmd_restart() {
    require_docker
    load_env
    default_vars
    local name; name="$(resolve_name)"
    [[ -z "$name" ]] && error "找不到 new-api 容器，请在 $ENV_FILE 指定 CONTAINER_NAME 或先执行 master/slave 部署"
    info "重启容器 $name"
    docker restart "$name" >/dev/null
    docker ps --filter "name=^${name}$" --format 'table {{.Names}}\t{{.Status}}'
}

cmd_logs() {
    require_docker
    load_env
    default_vars
    local name; name="$(resolve_name)"
    [[ -z "$name" ]] && error "找不到容器"
    docker logs -f --tail 200 "$name"
}

cmd_status() {
    require_docker
    load_env
    default_vars
    local name; name="$(resolve_name)"
    if [[ -z "$name" ]] || ! docker inspect "$name" >/dev/null 2>&1; then
        warn "容器不存在"
        return 0
    fi
    docker ps --filter "name=^${name}$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    echo
    local health
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$name" 2>/dev/null || echo n/a)"
    info "Health: $health"
}

cmd_down() {
    require_docker
    load_env
    default_vars
    local name; name="$(resolve_name)"
    [[ -z "$name" ]] && { warn "未找到容器，跳过"; return 0; }
    info "停止并移除容器 $name"
    docker rm -f "$name" >/dev/null
}

mask() {
    # 简单脱敏：只保留前 4 字符 + *** + 后 2 字符
    local v="$1"
    local n=${#v}
    if (( n <= 6 )); then echo "***"; else echo "${v:0:4}***${v: -2}"; fi
}

cmd_config() {
    load_env
    default_vars
    hr
    echo "ENV_FILE            = $ENV_FILE"
    echo "IMAGE               = $IMAGE"
    echo "CONTAINER_NAME      = ${CONTAINER_NAME:-<auto: new-api-master|new-api-slave>}"
    echo "PORT                = $PORT"
    echo "NETWORK             = $NETWORK"
    echo "TZ                  = $TZ"
    echo "DATA_DIR            = $DATA_DIR"
    echo "LOGS_DIR            = $LOGS_DIR"
    echo "SQL_DSN             = $( [[ -n $SQL_DSN ]] && mask "$SQL_DSN" || echo '<empty>' )"
    echo "LOG_SQL_DSN         = $( [[ -n $LOG_SQL_DSN ]] && mask "$LOG_SQL_DSN" || echo '<same as SQL_DSN>' )"
    echo "REDIS_CONN_STRING   = $( [[ -n $REDIS_CONN_STRING ]] && mask "$REDIS_CONN_STRING" || echo '<empty>' )"
    echo "SESSION_SECRET      = $( [[ -n $SESSION_SECRET ]] && mask "$SESSION_SECRET" || echo '<empty>' )"
    echo "CRYPTO_SECRET       = $( [[ -n $CRYPTO_SECRET ]] && mask "$CRYPTO_SECRET" || echo '<fallback to SESSION_SECRET>' )"
    echo "SYNC_FREQUENCY      = $SYNC_FREQUENCY"
    echo "MEMORY_CACHE_ENABLED= $MEMORY_CACHE_ENABLED"
    echo "FRONTEND_BASE_URL   = ${FRONTEND_BASE_URL:-<unset>}"
    echo "EXTRA_ENV           = ${EXTRA_ENV:-<unset>}"
    if [[ -n "$DORIS_HOST" ]]; then
        echo "DORIS               = enabled"
        echo "  DORIS_HOST        = $DORIS_HOST"
        echo "  DORIS_PORT        = $DORIS_PORT (FE HTTP)"
        echo "  DORIS_QUERY_PORT  = $DORIS_QUERY_PORT (FE MySQL)"
        echo "  DORIS_USER        = $DORIS_USER"
        echo "  DORIS_PASSWORD    = $( [[ -n $DORIS_PASSWORD ]] && mask "$DORIS_PASSWORD" || echo '<empty>' )"
        echo "  DORIS_DATABASE    = $DORIS_DATABASE"
        echo "  DORIS_TABLE       = $DORIS_TABLE"
        echo "  DORIS_FLUSH       = every ${DORIS_FLUSH_INTERVAL}s / batch ${DORIS_FLUSH_BATCH_SIZE}"
    else
        echo "DORIS               = <disabled (DORIS_HOST empty)>"
    fi
    hr
}

usage() {
    awk 'NR==1{next} /^[^#]/{exit} {sub(/^# ?/,""); print}' "$0"
}

# ─── 入口 ───
cmd="${1:-}"
case "$cmd" in
    master)              deploy_master ;;
    slave)               deploy_slave ;;
    pull)                cmd_pull ;;
    upgrade)             shift || true; cmd_upgrade "${1:-}" ;;
    restart)             cmd_restart ;;
    logs)                cmd_logs ;;
    status)              cmd_status ;;
    down|stop)           cmd_down ;;
    config)              cmd_config ;;
    ""|help|-h|--help)   usage ;;
    *)                   error "未知命令: $cmd。执行 ./deploy.prod.sh help 查看用法" ;;
esac
