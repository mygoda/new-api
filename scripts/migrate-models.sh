#!/usr/bin/env bash
#
# migrate-models.sh — 模型管理表结构迁移脚本（幂等）
#
# 作用：
#   为 models 表补齐 context_length 列（如果不存在）。
#   适配 MySQL / PostgreSQL / SQLite 三种数据库。
#   重复执行不会报错，可安全在每次部署时调用。
#
# 调用方式（由 deploy.sh 自动注入环境变量）：
#   DB_TYPE=mysql|postgres|sqlite \
#   COMPOSE_PROJECT=new-api \
#   COMPOSE_FILE=docker-compose.deploy.yml \
#   bash scripts/migrate-models.sh
#
# 注意：表本身由 GORM AutoMigrate 在应用启动时创建。
# 本脚本仅作为补充保险，确保新列在升级老库时一定存在。
#

set -euo pipefail

DB_TYPE="${DB_TYPE:-sqlite}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-new-api}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.deploy.yml}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[migrate-models]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[migrate-models]${NC}  $*"; }
error() { echo -e "${RED}[migrate-models]${NC} $*"; exit 1; }

get_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo "docker-compose"
    else
        echo ""
    fi
}

COMPOSE_CMD="$(get_compose_cmd)"

run_in_service() {
    # 在 compose 服务中执行命令；若不可用则降级到 docker exec
    local service="$1"
    shift
    if [ -n "$COMPOSE_CMD" ] && [ -f "$COMPOSE_FILE" ]; then
        $COMPOSE_CMD -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" exec -T "$service" "$@"
    else
        docker exec -i "${COMPOSE_PROJECT}-${service}" "$@"
    fi
}

migrate_mysql() {
    info "MySQL: 检查并新增 models.context_length 列 ..."
    # MySQL 8 支持 IF NOT EXISTS；对于 5.7 仍然安全，因为我们用错误吞掉策略
    local sql="ALTER TABLE \`models\` ADD COLUMN IF NOT EXISTS \`context_length\` BIGINT NOT NULL DEFAULT 0;"
    if run_in_service mysql sh -c "mysql -uroot -p123456 new-api -e \"$sql\"" 2>/tmp/mig_models.err; then
        info "MySQL: 迁移成功（或列已存在，已幂等跳过）"
    else
        # 5.7 兼容回退：先 SELECT 检查
        warn "ALTER ... IF NOT EXISTS 失败，尝试 5.7 兼容路径"
        local check_sql="SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='models' AND COLUMN_NAME='context_length';"
        local exists
        exists=$(run_in_service mysql sh -c "mysql -uroot -p123456 -N -B new-api -e \"$check_sql\"" 2>/dev/null || echo 0)
        if [ "${exists:-0}" = "0" ]; then
            run_in_service mysql sh -c "mysql -uroot -p123456 new-api -e \"ALTER TABLE \\\`models\\\` ADD COLUMN \\\`context_length\\\` BIGINT NOT NULL DEFAULT 0;\""
            info "MySQL: 列已新增"
        else
            info "MySQL: 列已存在，跳过"
        fi
    fi

    # 将 context_length 从 BIGINT 迁移为 VARCHAR(32)，支持 "128K"/"1M" 等描述性配置
    local type_sql="SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='models' AND COLUMN_NAME='context_length';"
    local col_type
    col_type=$(run_in_service mysql sh -c "mysql -uroot -p123456 -N -B new-api -e \"$type_sql\"" 2>/dev/null || echo "")
    if [ "$col_type" != "varchar" ]; then
        info "MySQL: 将 context_length 从 $col_type 迁移为 VARCHAR(32) ..."
        run_in_service mysql sh -c "mysql -uroot -p123456 new-api -e \"ALTER TABLE \\\`models\\\` MODIFY COLUMN \\\`context_length\\\` VARCHAR(32) NOT NULL DEFAULT '';\""
        info "MySQL: context_length 类型迁移完成"
    else
        info "MySQL: context_length 已是 VARCHAR 类型，跳过"
    fi

    # 新增 creation_target 列（控制创作中心可见性）
    info "MySQL: 检查并新增 models.creation_target 列 ..."
    local ct_check="SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='models' AND COLUMN_NAME='creation_target';"
    local ct_exists
    ct_exists=$(run_in_service mysql sh -c "mysql -uroot -p123456 -N -B new-api -e \"$ct_check\"" 2>/dev/null || echo 0)
    if [ "${ct_exists:-0}" = "0" ]; then
        run_in_service mysql sh -c "mysql -uroot -p123456 new-api -e \"ALTER TABLE \\\`models\\\` ADD COLUMN \\\`creation_target\\\` VARCHAR(64) NOT NULL DEFAULT '';\""
        info "MySQL: creation_target 列已新增"
    else
        info "MySQL: creation_target 列已存在，跳过"
    fi

    # 新增 home_priority 列（首页推荐优先级）
    info "MySQL: 检查并新增 models.home_priority 列 ..."
    local hp_check="SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='models' AND COLUMN_NAME='home_priority';"
    local hp_exists
    hp_exists=$(run_in_service mysql sh -c "mysql -uroot -p123456 -N -B new-api -e \"$hp_check\"" 2>/dev/null || echo 0)
    if [ "${hp_exists:-0}" = "0" ]; then
        run_in_service mysql sh -c "mysql -uroot -p123456 new-api -e \"ALTER TABLE \\\`models\\\` ADD COLUMN \\\`home_priority\\\` BIGINT NOT NULL DEFAULT 0, ADD INDEX idx_models_home_priority (home_priority);\""
        info "MySQL: home_priority 列已新增"
    else
        info "MySQL: home_priority 列已存在，跳过"
    fi
}

migrate_postgres() {
    info "PostgreSQL: 检查并新增 models.context_length 列 ..."
    # 9.6+ 支持 IF NOT EXISTS
    local sql="ALTER TABLE models ADD COLUMN IF NOT EXISTS context_length BIGINT NOT NULL DEFAULT 0;"
    run_in_service postgres psql -U root -d new-api -c "$sql"
    info "PostgreSQL: 迁移成功（或列已存在，已幂等跳过）"

    # 将 context_length 从 BIGINT 迁移为 VARCHAR(32)
    local type_sql="SELECT data_type FROM information_schema.columns WHERE table_name='models' AND column_name='context_length';"
    local col_type
    col_type=$(run_in_service postgres psql -U root -d new-api -t -A -c "$type_sql" 2>/dev/null || echo "")
    if [ "$col_type" != "character varying" ]; then
        info "PostgreSQL: 将 context_length 从 $col_type 迁移为 VARCHAR(32) ..."
        run_in_service postgres psql -U root -d new-api -c "ALTER TABLE models ALTER COLUMN context_length TYPE VARCHAR(32) USING context_length::text, ALTER COLUMN context_length SET DEFAULT '';"
        info "PostgreSQL: context_length 类型迁移完成"
    else
        info "PostgreSQL: context_length 已是 VARCHAR 类型，跳过"
    fi

    # 新增 creation_target 列
    info "PostgreSQL: 检查并新增 models.creation_target 列 ..."
    run_in_service postgres psql -U root -d new-api -c "ALTER TABLE models ADD COLUMN IF NOT EXISTS creation_target VARCHAR(64) NOT NULL DEFAULT '';"
    info "PostgreSQL: creation_target 迁移完成（或列已存在）"

    # 新增 home_priority 列
    info "PostgreSQL: 检查并新增 models.home_priority 列 ..."
    run_in_service postgres psql -U root -d new-api -c "ALTER TABLE models ADD COLUMN IF NOT EXISTS home_priority BIGINT NOT NULL DEFAULT 0;"
    run_in_service postgres psql -U root -d new-api -c "CREATE INDEX IF NOT EXISTS idx_models_home_priority ON models (home_priority);"
    info "PostgreSQL: home_priority 迁移完成（或列已存在）"
}

migrate_sqlite() {
    info "SQLite: 检查并新增 models.context_length 列 ..."
    local db_path="/data/one-api.db"
    # SQLite 不支持 ADD COLUMN IF NOT EXISTS，先用 PRAGMA 检查
    if ! run_in_service new-api sh -c "test -f $db_path"; then
        warn "SQLite 数据库 $db_path 不存在，跳过（首次部署时由应用自动创建）"
        return 0
    fi
    if ! run_in_service new-api sh -c "command -v sqlite3 >/dev/null 2>&1"; then
        warn "容器内无 sqlite3 客户端，依赖应用 GORM AutoMigrate 自动迁移（已生效）"
        return 0
    fi
    local exists
    exists=$(run_in_service new-api sh -c "sqlite3 $db_path \"SELECT COUNT(*) FROM pragma_table_info('models') WHERE name='context_length';\"" | tr -d '[:space:]')
    if [ "${exists:-0}" = "0" ]; then
        run_in_service new-api sh -c "sqlite3 $db_path \"ALTER TABLE models ADD COLUMN context_length INTEGER NOT NULL DEFAULT 0;\""
        info "SQLite: 列已新增"
    else
        info "SQLite: 列已存在，跳过"
    fi

    # 新增 creation_target 列
    local ct_exists
    ct_exists=$(run_in_service new-api sh -c "sqlite3 $db_path \"SELECT COUNT(*) FROM pragma_table_info('models') WHERE name='creation_target';\"" | tr -d '[:space:]')
    if [ "${ct_exists:-0}" = "0" ]; then
        run_in_service new-api sh -c "sqlite3 $db_path \"ALTER TABLE models ADD COLUMN creation_target VARCHAR(64) NOT NULL DEFAULT '';\""
        info "SQLite: creation_target 列已新增"
    else
        info "SQLite: creation_target 列已存在，跳过"
    fi
}

case "$DB_TYPE" in
    mysql)
        migrate_mysql
        ;;
    postgres|postgresql)
        migrate_postgres
        ;;
    sqlite)
        migrate_sqlite
        ;;
    *)
        warn "未知 DB_TYPE=$DB_TYPE，跳过 models 表迁移"
        ;;
esac
