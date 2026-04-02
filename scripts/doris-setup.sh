#!/usr/bin/env bash
#
# Doris request_logs table setup / upgrade script.
# Idempotent — safe to run multiple times.
#
# Usage:
#   bash scripts/doris-setup.sh
#
# Environment variables (same as the Go application):
#   DORIS_HOST       — Doris FE host          (required)
#   DORIS_QUERY_PORT — Doris FE MySQL port     (default: 9030)
#   DORIS_USER       — Doris username          (default: root)
#   DORIS_PASSWORD   — Doris password          (default: empty)
#   DORIS_DATABASE   — Database name           (default: new_api)
#   DORIS_TABLE      — Table name              (default: request_logs)
#
set -euo pipefail

DORIS_HOST="${DORIS_HOST:?'DORIS_HOST is required'}"
DORIS_QUERY_PORT="${DORIS_QUERY_PORT:-9030}"
DORIS_USER="${DORIS_USER:-root}"
DORIS_PASSWORD="${DORIS_PASSWORD:-}"
DORIS_DATABASE="${DORIS_DATABASE:-new_api}"
DORIS_TABLE="${DORIS_TABLE:-request_logs}"

MYSQL_CMD=(mysql -h "$DORIS_HOST" -P "$DORIS_QUERY_PORT" -u "$DORIS_USER" --batch --skip-column-names)
if [[ -n "$DORIS_PASSWORD" ]]; then
  MYSQL_CMD+=(-p"$DORIS_PASSWORD")
fi

run_sql() {
  "${MYSQL_CMD[@]}" -e "$1" 2>&1
}

echo "==> Connecting to Doris at ${DORIS_HOST}:${DORIS_QUERY_PORT} as ${DORIS_USER} ..."

# 1. Create database
echo "==> Creating database '${DORIS_DATABASE}' (if not exists) ..."
run_sql "CREATE DATABASE IF NOT EXISTS \`${DORIS_DATABASE}\`;"

# 2. Create table
echo "==> Creating table '${DORIS_DATABASE}.${DORIS_TABLE}' (if not exists) ..."
run_sql "
CREATE TABLE IF NOT EXISTS \`${DORIS_DATABASE}\`.\`${DORIS_TABLE}\` (
    created_at          DATETIME        NOT NULL COMMENT '请求时间 (UTC)',
    request_id          VARCHAR(128)    NOT NULL COMMENT '请求ID',
    user_id             INT             NOT NULL COMMENT '用户ID',
    token_id            INT             NOT NULL COMMENT '令牌ID',
    token_name          VARCHAR(256)    DEFAULT '' COMMENT '令牌名称',
    token_key           VARCHAR(512)    DEFAULT '' COMMENT '完整 API 密钥(sk-...)，敏感信息请严格控权',
    user_group          VARCHAR(128)    DEFAULT '' COMMENT '用户所在分组',
    token_group         VARCHAR(128)    DEFAULT '' COMMENT '令牌分组',
    using_group         VARCHAR(128)    DEFAULT '' COMMENT '实际使用的分组',
    model_name          VARCHAR(256)    DEFAULT '' COMMENT '请求模型名称',
    upstream_model      VARCHAR(256)    DEFAULT '' COMMENT '上游实际模型名称',
    channel_id          INT             DEFAULT 0  COMMENT '渠道ID',
    channel_type        INT             DEFAULT 0  COMMENT '渠道类型',
    channel_name        VARCHAR(256)    DEFAULT '' COMMENT '渠道名称',
    is_stream           BOOLEAN         DEFAULT FALSE COMMENT '是否流式请求',
    relay_mode          INT             DEFAULT 0  COMMENT '中继模式',
    request_path        VARCHAR(512)    DEFAULT '' COMMENT '请求路径',
    client_ip           VARCHAR(64)     DEFAULT '' COMMENT '客户端IP',
    request_body        STRING          DEFAULT '' COMMENT '请求体 JSON/文本（无长度限制）',
    response_content    STRING          DEFAULT '' COMMENT '模型输出文本（无长度限制）',
    prompt_tokens       INT             DEFAULT 0  COMMENT '输入Token数',
    completion_tokens   INT             DEFAULT 0  COMMENT '输出Token数',
    total_tokens        INT             DEFAULT 0  COMMENT '总Token数',
    cache_tokens        INT             DEFAULT 0  COMMENT '缓存Token数',
    quota               INT             DEFAULT 0  COMMENT '消耗额度',
    model_ratio         DOUBLE          DEFAULT 0  COMMENT '模型倍率',
    group_ratio         DOUBLE          DEFAULT 0  COMMENT '分组倍率',
    completion_ratio    DOUBLE          DEFAULT 0  COMMENT '补全倍率',
    model_price         DOUBLE          DEFAULT 0  COMMENT '模型价格',
    use_time_ms         BIGINT          DEFAULT 0  COMMENT '请求耗时(毫秒)',
    is_success          BOOLEAN         DEFAULT TRUE COMMENT '是否成功',
    retry_count         INT             DEFAULT 0  COMMENT '重试次数',
    status_code         INT             DEFAULT 0  COMMENT 'HTTP状态码',
    error_type          VARCHAR(128)    DEFAULT '' COMMENT '错误类型',
    error_message       VARCHAR(1024)   DEFAULT '' COMMENT '错误消息'
) ENGINE = OLAP
DUPLICATE KEY(created_at, request_id)
PARTITION BY RANGE(created_at) ()
DISTRIBUTED BY HASH(request_id) BUCKETS AUTO
PROPERTIES (
    'replication_allocation' = 'tag.location.default: 1',
    'dynamic_partition.enable' = 'true',
    'dynamic_partition.time_unit' = 'DAY',
    'dynamic_partition.start' = '-30',
    'dynamic_partition.end' = '3',
    'dynamic_partition.prefix' = 'p',
    'dynamic_partition.create_history_partition' = 'true'
);
"

# 3. Upgrade: add columns that may be missing from older versions
echo "==> Checking and adding missing columns (safe to ignore 'already exists' errors) ..."

add_column_if_missing() {
  local col="$1"
  local def="$2"
  # DESC will show the column if it exists; we grep for it
  if ! run_sql "DESC \`${DORIS_DATABASE}\`.\`${DORIS_TABLE}\`;" | grep -qw "$col"; then
    echo "    Adding column '${col}' ..."
    run_sql "ALTER TABLE \`${DORIS_DATABASE}\`.\`${DORIS_TABLE}\` ADD COLUMN \`${col}\` ${def};" || true
  else
    echo "    Column '${col}' already exists, skipping."
  fi
}

add_column_if_missing "token_key"         "VARCHAR(512)  DEFAULT '' COMMENT 'API 密钥'"
add_column_if_missing "request_body"      "STRING        DEFAULT '' COMMENT '请求体'"
add_column_if_missing "response_content"  "STRING        DEFAULT '' COMMENT '响应内容'"

echo "==> Doris setup completed successfully!"
echo "    Database : ${DORIS_DATABASE}"
echo "    Table    : ${DORIS_TABLE}"
echo "    Host     : ${DORIS_HOST}:${DORIS_QUERY_PORT}"
