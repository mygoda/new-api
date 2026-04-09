# 部署指南

本文档介绍 new-api 的两种主要部署方式，按使用场景选择其一即可：

| 方式 | 对应脚本 | 适用场景 | 存储依赖 |
| ---- | -------- | -------- | -------- |
| **一键部署** | `deploy.sh` | 单机快速验证、内网 / 演示环境、小规模自用 | 脚本内嵌拉起 PostgreSQL / MySQL / Redis / Doris |
| **生产部署（主-从）** | `deploy.prod.sh` + `.env.prod` | 多节点集群、外部托管 DB / Redis、正式线上环境 | **不部署依赖**，由运维通过连接串外部接入 |

> 还在用宝塔面板？请参考 [`BT.md`](./BT.md)。

---

## 方式一：一键部署（`deploy.sh`）

### 适用场景

- 只有一台机器，想尽快把 new-api 跑起来
- 对数据持久化、备份、HA 没有强要求
- 可以容忍 DB / Redis 与应用部署在同一台机上

### 前置要求

| 项目 | 要求 |
| ---- | ---- |
| 操作系统 | Linux（x86_64 / arm64） |
| Docker | ≥ 20.10 |
| Docker Compose | 内置 plugin 或独立 v2 |
| 磁盘 | 建议 ≥ 20 GB（含 Doris 日志存储） |
| 内存 | 建议 ≥ 4 GB |

### 快速开始

```bash
# 在仓库根目录执行
./deploy.sh                # 默认：构建镜像 + 启用 MySQL + Redis + Doris，然后 docker compose up -d
./deploy.sh logs           # 查看实时日志
./deploy.sh status         # 查看服务状态
./deploy.sh down           # 停止并移除所有服务
```

脚本会自动生成 `docker-compose.deploy.yml`，把 new-api、数据库、Redis、Doris（可选）一起拉起。首次部署时会自动生成 `SESSION_SECRET` 随机值。

### 常用环境变量

```bash
PORT=8080 \
DB_TYPE=postgres \
REDIS_URL=redis://redis:6379 \
DORIS_ENABLED=true \
./deploy.sh
```

| 变量 | 默认 | 说明 |
| ---- | ---- | ---- |
| `IMAGE_NAME` | `new-api` | 构建/使用的镜像名 |
| `IMAGE_TAG` | `git short hash` | 镜像 tag |
| `PORT` | `3010` | 对外 HTTP 端口 |
| `DB_TYPE` | `mysql` | `mysql` / `postgres` / `sqlite` |
| `DB_DSN` | 自动生成 | 覆盖 `DB_TYPE` 的默认 DSN |
| `REDIS_URL` | 空 | Redis 连接串（留空则不启用） |
| `DORIS_ENABLED` | `true` | 是否启用 Doris 请求日志 |
| `SESSION_SECRET` | 自动生成 | 会话密钥 |

完整列表见 `deploy.sh` 头部注释。

### 常见运维操作

```bash
./deploy.sh build          # 只构建镜像，不部署
./deploy.sh up             # 使用已有镜像部署
./deploy.sh restart        # 重建 compose 并重启
./deploy.sh stop           # 停止容器（不删除）
./deploy.sh start          # 恢复已停止的容器
./deploy.sh logs           # tail -f 服务日志
```

> ⚠️ 一键部署默认使用 `root / 123456` 之类的弱口令初始化 DB，**请勿**直接对公网暴露，务必至少修改默认密码或改走生产部署方式。

---

## 方式二：生产部署 — 主-从架构（`deploy.prod.sh`）

### 适用场景

- 正式生产环境，需要水平扩容
- DB / Redis 已有托管实例或独立集群（RDS、阿里云 / AWS / 自建 Patroni 等）
- 需要多节点共享同一份数据，前端由统一入口（LB / 网关）分发

### 架构

```
            ┌──────────────┐    ┌──────────────┐
            │  External    │    │  External    │
            │  MySQL / PG  │    │    Redis     │
            └──────┬───────┘    └──────┬───────┘
                   │                   │
       ┌───────────┼───────────────────┼───────────┐
       │           │                   │           │
       ▼           ▼                   ▼           ▼
┌────────────┐ ┌────────────┐   ┌────────────┐ ┌────────────┐
│  master    │ │  slave-1   │   │  slave-2   │ │  slave-N   │
│ NODE_TYPE= │ │ NODE_TYPE= │   │ NODE_TYPE= │ │ NODE_TYPE= │
│   master   │ │   slave    │   │   slave    │ │   slave    │
└─────┬──────┘ └─────┬──────┘   └─────┬──────┘ └─────┬──────┘
      │              │                │              │
      └──────────────┴────────┬───────┴──────────────┘
                              ▼
                        ┌───────────┐
                        │  Load     │
                        │  Balancer │
                        └───────────┘
```

**角色分工**（对应源码）：

| 角色 | 行为 | 代码位置 |
| ---- | ---- | -------- |
| master | 启动时执行 DB 迁移、运行 Midjourney / 异步任务、渲染 Web UI | `common/init.go:86`、`main.go:127-134`、`model/main.go:198-200` |
| slave  | 跳过迁移与异步任务；可通过 `FRONTEND_BASE_URL` 把 Web UI 请求 302 回 master | `router/main.go:21-33` |

**多节点共享项**（必须保持完全一致）：

- `SESSION_SECRET` —— 否则登录态会随机失效
- `CRYPTO_SECRET` —— 否则 Redis 中加密数据无法跨节点解密
- `SQL_DSN` / `LOG_SQL_DSN` —— 必须指向同一套 DB
- `REDIS_CONN_STRING` —— 必须指向同一套 Redis，用于热配置同步和内存缓存广播

### 前置要求

| 项目 | 要求 |
| ---- | ---- |
| 操作系统 | Linux（x86_64 / arm64） |
| Docker | ≥ 20.10（每个 new-api 节点一台主机或一台容器宿主） |
| 数据库 | MySQL ≥ 5.7.8 或 PostgreSQL ≥ 9.6（**不要**使用 SQLite） |
| Redis | ≥ 5.0（多节点强烈建议，否则无法热同步配置与渠道） |
| 可选 | 独立的日志库（`LOG_SQL_DSN`）、Doris 分析库（`DORIS_*`）、LB / 网关 |

### 1. 填写配置

```bash
cp .env.prod.example .env.prod
vim .env.prod
```

必填项：

```bash
# ⚠️ DSN 里含括号/特殊字符时必须用单引号包起来，否则 source .env.prod 会报语法错误
SQL_DSN='postgresql://newapi:****@pg.internal:5432/newapi'
REDIS_CONN_STRING='redis://:****@redis.internal:6379/0'
SESSION_SECRET=$(openssl rand -hex 32)   # 或手动填入 >= 32 字符
CRYPTO_SECRET=$(openssl rand -hex 32)    # 建议显式设置
```

可选但推荐：

```bash
IMAGE=calciumion/new-api:latest          # 或自建镜像 your-registry/new-api:xxx
PORT=3010
DATA_DIR=/var/lib/new-api/data
LOGS_DIR=/var/log/new-api
TZ=Asia/Shanghai
SYNC_FREQUENCY=60
MEMORY_CACHE_ENABLED=true
LOG_SQL_DSN=''                            # 若独立记录 Log 表，填入另一套 DSN
```

启用 Doris 请求日志（可选但强烈推荐，生产环境请求量大时 Log 表很容易撑爆 MySQL）：

```bash
DORIS_HOST=doris-fe.internal              # ⚠️ 不要带 http:// 前缀；不要把端口写在主机名里
DORIS_PORT=8030                           # FE HTTP 端口（Stream Load 用），不要写 BE 的 8040
DORIS_QUERY_PORT=9030                     # FE MySQL 协议端口（查询用）
DORIS_USER=root
DORIS_PASSWORD='your-doris-password'
DORIS_DATABASE=new_api
DORIS_TABLE=request_logs
DORIS_FLUSH_INTERVAL=5                    # 批量 flush 间隔（秒）
DORIS_FLUSH_BATCH_SIZE=100                # 批量 flush 条数
```

> Doris 库表首次启用时需要运维手动建库建表，参考 `docs/doris-request-logs.md`。
> 多节点集群下，master 和所有 slave 的 `DORIS_*` 配置必须完全一致，否则请求日志会被拆散写入不同库。
> `DORIS_HOST` 留空即禁用 Doris —— 此时请求日志回落到 `SQL_DSN` / `LOG_SQL_DSN` 里的 Log 表。

完整变量说明见 `.env.prod.example` 头部注释。

### 2. 部署 master

在"要作为中心节点"的机器上执行：

```bash
./deploy.prod.sh master
./deploy.prod.sh logs      # 观察直到看到 "server is listening on :3010"
```

首次启动时，master 会执行数据库迁移。**在迁移完成前，不要部署 slave**，否则 slave 会命中不一致的 schema。

### 3. 部署 slave

把 **同一份** `.env.prod` 复制到每台从节点主机，再加一行：

```bash
FRONTEND_BASE_URL=https://api.example.com   # 填 master 对外访问地址；不填则 slave 自行渲染 UI
```

然后执行：

```bash
./deploy.prod.sh slave
./deploy.prod.sh status
```

slave 不会执行迁移，启动后即进入 API 中继模式。

### 4. 在一台主机上跑多个实例

利用不同的 `ENV_FILE` + `CONTAINER_NAME` + `PORT` 即可：

```bash
# 第一个 slave
cp .env.prod .env.prod.slave-1
ENV_FILE=.env.prod.slave-1 CONTAINER_NAME=new-api-slave-1 PORT=3011 \
    ./deploy.prod.sh slave

# 第二个 slave
cp .env.prod .env.prod.slave-2
ENV_FILE=.env.prod.slave-2 CONTAINER_NAME=new-api-slave-2 PORT=3012 \
    ./deploy.prod.sh slave
```

### 5. 运维命令

```bash
./deploy.prod.sh pull                    # 拉取最新镜像
./deploy.prod.sh upgrade master          # 拉取 + 重部 master
./deploy.prod.sh upgrade slave           # 拉取 + 重部 slave
./deploy.prod.sh restart                 # 原地重启当前容器
./deploy.prod.sh logs                    # tail -f 200 行
./deploy.prod.sh status                  # 容器 + 健康检查状态
./deploy.prod.sh down                    # 停止并删除容器
./deploy.prod.sh config                  # 打印生效配置（敏感字段脱敏）
```

指定非默认 env 文件：

```bash
ENV_FILE=.env.prod.slave-1 ./deploy.prod.sh status
```

### 6. 推荐的升级流程

1. 在一台 slave 上先升级验证：`./deploy.prod.sh upgrade slave`
2. 观察 5～10 分钟日志 / 监控没有异常
3. 滚动升级剩余 slave
4. 最后升级 master：`./deploy.prod.sh upgrade master`

> DB schema 迁移只发生在 master 启动时。如果本次升级包含不兼容变更（罕见），先停所有 slave，只留 master，升级 master 等迁移完成后再滚动升级 slave。

### 7. LB / 反向代理

- 所有节点对等，HTTP 路径一致，LB 随意转发即可（建议走最少连接数或源地址哈希）
- 健康检查路径：`GET /api/status`，期望返回 JSON 且 `success: true`
- WebSocket / SSE 请确保 LB 未启用响应缓冲或过短超时（SSE 推理流不能被截断）

---

## 常见问题

**Q: 一键部署和生产部署能混用吗？**
不要混用。一键部署会起内嵌 DB / Redis，生产部署依赖的是外部 DB。想从前者迁移到后者：用 `mysqldump` / `pg_dump` 导出数据 → 导入到目标托管实例 → 配置 `.env.prod` → `./deploy.prod.sh master`。

**Q: 为什么 slave 启动成功但前台某些配置改不动？**
多节点环境下配置变更通过 Redis Pub/Sub + 轮询 DB 广播；确认：
1. 所有节点的 `REDIS_CONN_STRING` 指向同一套 Redis
2. 所有节点的 `SESSION_SECRET` / `CRYPTO_SECRET` 完全一致
3. `SYNC_FREQUENCY` 没被改得过大（默认 60s）

**Q: master 宕机了 slave 会怎样？**
slave 可以继续处理 API 中继请求（DB、Redis 都在外部），但：
- Web UI 如果配了 `FRONTEND_BASE_URL` 指向 master，会 302 失败 → 可临时把 slave 的 `FRONTEND_BASE_URL` 置空并 `restart`
- Midjourney / 异步任务暂停，直到 master 恢复

**Q: 能不能让一台 slave 临时升为 master？**
可以，把该节点的 `NODE_TYPE` 改为 `master`（或移除该变量）后 `./deploy.prod.sh master` 重部即可。注意同一时间集群内只应存在一个 master，避免异步任务重复执行。

**Q: SQLite 能在生产部署里用吗？**
不能。`deploy.prod.sh` 显式拒绝 SQLite DSN —— SQLite 无法被多节点共享，也无法承接 new-api 的写并发。

---

## 环境变量速查

### 通用（master / slave 共用）

| 变量 | 必填 | 说明 |
| ---- | ---- | ---- |
| `SQL_DSN` | ✅ | 主库连接串（MySQL / PostgreSQL） |
| `SESSION_SECRET` | ✅ | 会话密钥，≥ 32 字符，所有节点一致 |
| `CRYPTO_SECRET` | ⚠️ | Redis 数据加解密密钥，未设置会回退为 `SESSION_SECRET` |
| `REDIS_CONN_STRING` | ⚠️ | 多节点必填 |
| `LOG_SQL_DSN` | | 独立请求日志库；留空则复用 `SQL_DSN` |
| `SYNC_FREQUENCY` | | 节点间同步间隔，默认 `60` 秒 |
| `MEMORY_CACHE_ENABLED` | | 开启内存缓存（配合 Redis 使用） |
| `ERROR_LOG_ENABLED` | | 错误日志落库 |
| `BATCH_UPDATE_ENABLED` | | 批量写回用量统计，减少 DB 压力 |
| `BATCH_UPDATE_INTERVAL` | | 批量写回间隔秒 |
| `RELAY_TIMEOUT` | | 中继请求整体超时；留空表示无限制 |
| `TZ` | | 容器时区，默认 `Asia/Shanghai` |

### 仅 slave

| 变量 | 说明 |
| ---- | ---- |
| `NODE_TYPE=slave` | 由 `deploy.prod.sh slave` 自动注入 |
| `FRONTEND_BASE_URL` | 将 Web UI 请求 302 到该地址（通常是 master 对外地址） |

### Doris 请求日志（可选，`DORIS_HOST` 为空即禁用）

| 变量 | 默认 | 说明 |
| ---- | ---- | ---- |
| `DORIS_HOST` | 空 | Doris FE 主机名/IP；**留空=禁用 Doris**；不要带 `http://` 前缀，不要把端口写在主机名里 |
| `DORIS_PORT` | `8030` | FE HTTP 端口（Stream Load 用）；⚠️ 不要写 BE 的 `8040` |
| `DORIS_QUERY_PORT` | `9030` | FE MySQL 协议查询端口 |
| `DORIS_USER` | `root` | |
| `DORIS_PASSWORD` | 空 | |
| `DORIS_DATABASE` | `new_api` | 首次启用需手动建库 |
| `DORIS_TABLE` | `request_logs` | 首次启用需手动建表，参考 [`docs/doris-request-logs.md`](../doris-request-logs.md) |
| `DORIS_FLUSH_INTERVAL` | `5` | 批量 flush 间隔秒 |
| `DORIS_FLUSH_BATCH_SIZE` | `100` | 批量 flush 条数 |

> 多节点集群下 `DORIS_*` 必须在 master 和所有 slave 上完全一致。

### `deploy.prod.sh` 自身变量

| 变量 | 默认 | 说明 |
| ---- | ---- | ---- |
| `ENV_FILE` | `.env.prod` | 从哪个文件加载配置 |
| `IMAGE` | `calciumion/new-api:latest` | 部署使用的镜像 |
| `CONTAINER_NAME` | `new-api-master` / `new-api-slave` | 容器名（一机多实例时必填） |
| `PORT` | `3010` | 宿主机对外端口 |
| `DATA_DIR` | `./data` | 挂载到容器 `/data` |
| `LOGS_DIR` | `./logs` | 挂载到容器 `/app/logs` |
| `NETWORK` | `bridge` | Docker 网络 |
| `EXTRA_ENV` | 空 | 逗号分隔的 `KEY=VAL`，透传给容器 |
