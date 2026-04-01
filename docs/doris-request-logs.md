# Doris 详细请求日志

## 功能说明

将每一次 API 请求的详细信息（用户、令牌、渠道、模型、Token 用量、耗时、费用等）异步批量写入 Apache Doris，用于后续的分析和报表。

- **异步非阻塞**：请求日志先进入内存缓冲区，由后台协程定时或达到批量阈值时通过 Stream Load HTTP API 批量写入 Doris，不影响主请求性能。
- **开关控制**：后台管理面板 → 运营设置 → 日志设置 → "启用 Doris 详细请求日志"，或数据库 options 表 `DorisLogEnabled` = `true`。
- **环境变量配置连接信息**（需重启生效）。

## 环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `DORIS_HOST` | (空，不启用) | Doris FE 地址，设置后自动启用 Doris 连接 |
| `DORIS_PORT` | `8030` | Doris FE HTTP 端口 |
| `DORIS_USER` | `root` | Doris 用户名 |
| `DORIS_PASSWORD` | (空) | Doris 密码 |
| `DORIS_DATABASE` | `new_api` | Doris 数据库名 |
| `DORIS_TABLE` | `request_logs` | Doris 表名 |
| `DORIS_FLUSH_INTERVAL` | `5` | 批量刷写间隔（秒） |
| `DORIS_FLUSH_BATCH_SIZE` | `100` | 触发即时刷写的缓冲区行数阈值 |

## Doris 建表 DDL

```sql
CREATE DATABASE IF NOT EXISTS new_api;

USE new_api;

CREATE TABLE IF NOT EXISTS request_logs (
    created_at      DATETIME        NOT NULL COMMENT '请求时间 (UTC)',
    request_id      VARCHAR(128)    NOT NULL COMMENT '请求ID',
    user_id         INT             NOT NULL COMMENT '用户ID',
    token_id        INT             NOT NULL COMMENT '令牌ID',
    token_name      VARCHAR(256)    DEFAULT '' COMMENT '令牌名称',
    user_group      VARCHAR(128)    DEFAULT '' COMMENT '用户所在分组',
    token_group     VARCHAR(128)    DEFAULT '' COMMENT '令牌分组',
    using_group     VARCHAR(128)    DEFAULT '' COMMENT '实际使用的分组',
    model_name      VARCHAR(256)    DEFAULT '' COMMENT '请求模型名称',
    upstream_model  VARCHAR(256)    DEFAULT '' COMMENT '上游实际模型名称',
    channel_id      INT             DEFAULT 0  COMMENT '渠道ID',
    channel_type    INT             DEFAULT 0  COMMENT '渠道类型',
    channel_name    VARCHAR(256)    DEFAULT '' COMMENT '渠道名称',
    is_stream       BOOLEAN         DEFAULT FALSE COMMENT '是否流式请求',
    relay_mode      INT             DEFAULT 0  COMMENT '中继模式',
    request_path    VARCHAR(512)    DEFAULT '' COMMENT '请求路径',
    client_ip       VARCHAR(64)     DEFAULT '' COMMENT '客户端IP',
    prompt_tokens   INT             DEFAULT 0  COMMENT '输入Token数',
    completion_tokens INT           DEFAULT 0  COMMENT '输出Token数',
    total_tokens    INT             DEFAULT 0  COMMENT '总Token数',
    cache_tokens    INT             DEFAULT 0  COMMENT '缓存Token数',
    quota           INT             DEFAULT 0  COMMENT '消耗额度',
    model_ratio     DOUBLE          DEFAULT 0  COMMENT '模型倍率',
    group_ratio     DOUBLE          DEFAULT 0  COMMENT '分组倍率',
    completion_ratio DOUBLE         DEFAULT 0  COMMENT '补全倍率',
    model_price     DOUBLE          DEFAULT 0  COMMENT '模型价格',
    use_time_ms     BIGINT          DEFAULT 0  COMMENT '请求耗时(毫秒)',
    is_success      BOOLEAN         DEFAULT TRUE COMMENT '是否成功',
    retry_count     INT             DEFAULT 0  COMMENT '重试次数',
    status_code     INT             DEFAULT 0  COMMENT 'HTTP状态码',
    error_type      VARCHAR(128)    DEFAULT '' COMMENT '错误类型',
    error_message   VARCHAR(1024)   DEFAULT '' COMMENT '错误消息'
) ENGINE = OLAP
DUPLICATE KEY(created_at, request_id)
PARTITION BY RANGE(created_at) ()
DISTRIBUTED BY HASH(request_id) BUCKETS AUTO
PROPERTIES (
    "replication_allocation" = "tag.location.default: 1",
    "dynamic_partition.enable" = "true",
    "dynamic_partition.time_unit" = "DAY",
    "dynamic_partition.start" = "-30",
    "dynamic_partition.end" = "3",
    "dynamic_partition.prefix" = "p",
    "dynamic_partition.create_history_partition" = "true"
);
```

### 说明

- 使用 **DUPLICATE KEY** 模型，适合明细日志写入和分析查询。
- **动态分区**按天自动创建，保留最近 30 天数据（可通过 `dynamic_partition.start` 调整）。
- `DISTRIBUTED BY HASH(request_id)` 保证相同请求的数据分布到同一个 Bucket。
- `BUCKETS AUTO` 由 Doris 根据数据量自动调整分桶数。
- `replication_allocation` 设为 1 副本，生产环境建议改为 3。

## 常用查询示例

```sql
-- 最近 1 小时请求量和平均耗时
SELECT
    model_name,
    COUNT(*) AS request_count,
    AVG(use_time_ms) AS avg_latency_ms,
    SUM(total_tokens) AS total_tokens,
    SUM(quota) AS total_quota
FROM request_logs
WHERE created_at >= NOW() - INTERVAL 1 HOUR
GROUP BY model_name
ORDER BY request_count DESC;

-- 按用户统计每日消耗
SELECT
    DATE(created_at) AS dt,
    user_id,
    COUNT(*) AS requests,
    SUM(quota) AS total_quota,
    SUM(total_tokens) AS total_tokens
FROM request_logs
WHERE created_at >= CURDATE() - INTERVAL 7 DAY
GROUP BY dt, user_id
ORDER BY dt DESC, total_quota DESC;

-- 渠道成功率
SELECT
    channel_id,
    channel_name,
    COUNT(*) AS total,
    SUM(CASE WHEN is_success THEN 1 ELSE 0 END) AS success,
    ROUND(SUM(CASE WHEN is_success THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS success_rate
FROM request_logs
WHERE created_at >= NOW() - INTERVAL 1 DAY
GROUP BY channel_id, channel_name
ORDER BY total DESC;
```
