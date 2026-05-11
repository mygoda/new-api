# 火山 web-1 环境部署

火山 web-1 是部署在火山云上的 new-api 实例，使用国内 mirror 加速的 Dockerfile（`Dockerfile.cn`），通过 docker-compose 启动 new-api + Redis 容器，外接火山云上的 MySQL / Doris。对应自动化 skill：`/huoshan-newapi-deploy`。

## 目标主机

| 项 | 值 |
|---|---|
| 公网 IP | `115.190.160.25` |
| 内网 IP | `172.16.0.228` |
| SSH 用户 | `root`（已加 key） |
| 代码目录 | `/root/new-api` |
| 部署 compose 文件 | `docker-compose.prod.yml` |
| 服务端口 | `3010` |

## ⚠️ 必须使用 `docker-compose.prod.yml`

仓库根目录默认的 `docker-compose.yml` 连的是本地 PostgreSQL 容器（不存在）。所有 docker-compose 操作必须显式带 `-f docker-compose.prod.yml`。

## 外部依赖

| 服务 | 主机 | 端口 | 数据库 |
|---|---|---|---|
| MySQL | `172.16.0.224` | 3306 | `newapi` |
| Doris FE HTTP | `172.16.0.229` | 8030 | `new_api` |
| Doris Query | `172.16.0.229` | 9030 | `new_api` |
| Redis | container `redis` | 6379 | - |

凭据放在 compose 文件 + `.env`，不在文档里展开。

## 全量更新（git pull + 重建 + 替换）

**核心约束**：旧容器在镜像构建期间继续运行，构建成功后才停老容器、起新容器，把停机窗口压到 < 1 分钟。

### 1. 拉代码（旧容器仍在跑）

```bash
ssh -o ConnectTimeout=10 root@115.190.160.25 'cd /root/new-api && git pull'
```

### 2. 后台构建镜像（旧容器仍在跑）

构建约 10 分钟，必须用 `nohup` 防 SSH 断连影响构建：

```bash
ssh -o ConnectTimeout=10 root@115.190.160.25 \
  'cd /root/new-api && nohup docker build -f Dockerfile.cn -t new-api:latest . > /tmp/docker-build.log 2>&1 &'
```

监控进度：

```bash
ssh root@115.190.160.25 'tail -f /tmp/docker-build.log'
```

阶段标识：

- Stage 1（~2-3 min）：`bun install` + 前端 `bun run build`
- Stage 2（~5-8 min）：`go mod download` + `go build`
- Stage 3（~1 min）：最终 debian-slim 镜像组装

**等到日志出现 `Successfully tagged new-api:latest` 才进入下一步**。构建失败则跳过停服务，把 `/tmp/docker-build.log` 末尾 30 行交给运维。

### 3. 停旧容器（构建成功后才执行）

```bash
ssh root@115.190.160.25 '
cd /root/new-api && docker compose -f docker-compose.prod.yml down 2>/dev/null
docker compose down 2>/dev/null
'
```

### 4. 启动新容器

```bash
ssh root@115.190.160.25 'cd /root/new-api && docker compose -f docker-compose.prod.yml up -d'
```

### 5. 验证

```bash
ssh root@115.190.160.25 '
sleep 10
curl -s http://localhost:3010/api/status | grep "\"success\":true"
docker logs new-api 2>&1 | grep -E "MySQL|Doris|ready|error"
'
```

健康日志包含：

- `using MySQL as database`（MySQL 连接 OK）
- `Doris logger initialized`（Doris 连接 OK）
- `ready in XXX ms`（服务起来）

## 常用命令

### 仅重启

```bash
ssh root@115.190.160.25 'cd /root/new-api && docker compose -f docker-compose.prod.yml restart new-api'
```

### 看日志

```bash
ssh root@115.190.160.25 'docker logs new-api --tail 50'
ssh root@115.190.160.25 'tail -50 /root/new-api/logs/*.log'
```

### 查状态

```bash
ssh root@115.190.160.25 '
docker ps | grep new-api
curl -s http://localhost:3010/api/status | python3 -m json.tool
'
```

## 故障排查

- **容器 unhealthy / connection refused**：八成是用错了 compose 文件。`docker inspect new-api | grep -A5 SQL_DSN` 应当展示 `tcp(172.16.0.224:3306)`，不是 `postgres`。如果是 `postgres` 就停所有容器、改用 `-f docker-compose.prod.yml` 重启。
- **日志里出现 PostgreSQL 错误**：默认 `docker-compose.yml` 被误用。同上修复。
- **构建失败**：看 `/tmp/docker-build.log`。常见：国内镜像源超时、磁盘满。

## 安全约束

- 所有 SSH 调用必须设 `ConnectTimeout=10`
- 构建必须用 `nohup`，避免 SSH 中断时构建一起被杀
- 删除容器 / 数据卷之类破坏性操作必须先确认
