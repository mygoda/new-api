# seeme 环境部署 / 更新

seeme 是 `seememaas.com` 服务的环境，由一台 master 和多台 slave 组成，nginx 在 master 做 LB + HTTPS 终止。本文记录手动 / 自动化部署的完整流程。对应自动化 skill：`/update-seeme-newapi`。

## 节点

| IP | 角色 | 容器名 | 备注 |
|---|---|---|---|
| `124.174.20.212` | master | `new-api-master` | nginx 入口、Doris 写入侧 |
| `124.174.20.225` | slave | `new-api-slave` | 同机部署 Doris（doris-all-in-one-2.1.0） |

历史节点 `124.174.20.24` 已下线。新增节点参照下文 [新增节点](#新增节点) 一节。

## 通用约定

| 项 | 值 |
|---|---|
| SSH 用户 | `root`（已加 key） |
| 代码目录 | `/root/new-api` |
| Git 分支 | `main` |
| Dockerfile | `Dockerfile.cn`（国内加速版） |
| 部署脚本 | `./deploy.prod.sh master` 或 `./deploy.prod.sh slave` |
| 容器端口 | `3010` |

部署脚本根据传入的 `master` / `slave` 参数自动写 `.env.prod` 中的 `CONTAINER_NAME`、是否启用迁移等。

## 全量更新流程

**先部署 master，再部署 slave**——master 启动时会跑数据库迁移；如果 slave 先用了新版镜像而 schema 还没迁，请求会因为字段缺失失败。

### 1. 拉代码 + 构建镜像（多节点并行）

每台节点上：

```bash
ssh -o ConnectTimeout=10 root@<IP> '
set -e
cd /root/new-api && git pull && \
docker build --platform linux/amd64 -f Dockerfile.cn -t new-api:latest . && \
echo "BUILD_SUCCESS"
'
```

说明：

- 此步骤旧容器仍在运行，停机窗口尚未开始。
- 构建约 5–10 分钟，包含前端 `bun run build` + Go `go build`。
- 构建期间不要并行跑其他重 IO/CPU 任务，避免互相挤占。

### 2. 部署 master

构建结束后：

```bash
ssh root@124.174.20.212 'cd /root/new-api && ./deploy.prod.sh master'
```

观察输出里有：

- `移除已存在的容器 new-api-master`
- `启动容器 new-api-master (image=new-api:latest, host_port=3010)`
- `Master 部署完成`

### 3. 健康检查 master

```bash
sleep 8
ssh root@124.174.20.212 '
curl -s http://localhost:3010/api/status | grep -o "\"success\":true"
docker logs new-api-master --tail 5 | grep -E "ready|MySQL|error"
'
```

期望 `"success":true` + 日志里有 `ready in XXX ms`。

### 4. 部署 slave

```bash
ssh root@124.174.20.225 'cd /root/new-api && ./deploy.prod.sh slave'
```

部署脚本会提示 `Slave 部署完成。请先确认 master 已正常启动`——这是常规警告。

### 5. 健康检查 slave

```bash
sleep 8
ssh root@124.174.20.225 '
curl -s http://localhost:3010/api/status | grep -o "\"success\":true"
docker ps --format "{{.Names}}: {{.Status}}"
'
```

## 失败处理

| 现象 | 排查 |
|---|---|
| `git pull` 报 `not a git repository` | 该节点代码是手工 rsync 上去的，没有 `.git`。参照 [新增节点](#新增节点) 步骤 1 把 `.git` 同步过去 |
| 构建失败 | 看 `/tmp/docker-build.log` 末尾。常见：国内镜像超时、磁盘满 |
| 部署后 `success` 不为 true | `docker logs new-api-{master,slave} --tail 30` 看启动日志，排查 MySQL/Doris/Redis 连接 |
| slave 启动正常但接口 500 | 多半是 master 还没完成迁移，等 30 秒再试；或 master 实际起失败 |
| 渠道走代理报 `do request failed: Forbidden` | [channel-proxy-troubleshooting.md](../ops/channel-proxy-troubleshooting.md) |

诊断时常用命令：

```bash
# 容器进程
ssh root@<IP> 'docker ps -a | grep new-api'

# 容器日志
ssh root@<IP> 'docker logs new-api-{master,slave} --tail 50'

# 容器环境（确认正确加载 .env.prod）
ssh root@<IP> 'docker inspect new-api-{master,slave} | grep -A20 \"Env\"'
```

## 新增节点

新机器加入 seeme 集群（成为新的 slave）的步骤。

### 1. 把代码 + `.git` 准备到位

如果该机器没有任何代码，直接 `git clone`。如果是已经手工拷贝过代码（如本次 `.225`），需要把 `.git` 同步过去：

```bash
# 在本机或 master 上：tar pipe 一次到位
ssh root@<已有节点> 'cd /root/new-api && tar czf - .git' \
  | ssh root@<新节点> 'cd /root/new-api && rm -rf .git && tar xzf -'

# 工作区跟 .git 对齐（保留 untracked .env.prod / data/）
ssh root@<新节点> 'cd /root/new-api && git reset --hard HEAD'
```

### 2. 准备 `.env.prod`

从已有 slave 拷一份并改 `CONTAINER_NAME`：

```bash
scp root@124.174.20.225:/root/new-api/.env.prod /tmp/env.prod.tpl
# 编辑 CONTAINER_NAME 等差异项，再 scp 到新节点 /root/new-api/.env.prod
```

⚠️ `.env.prod` 含密钥，传输完后及时删除中转文件。

### 3. 加入代理白名单（如果该节点会用到走代理的渠道）

新节点出网会被父代理 squid 拒绝（403 Forbidden）。在 `210.73.214.189` 上把新节点公网 IP 加进 `acl upstream_peers`。详见 [channel-proxy-troubleshooting.md](../ops/channel-proxy-troubleshooting.md)。

### 4. 构建 + 部署

```bash
ssh root@<新节点> '
cd /root/new-api && docker build --platform linux/amd64 -f Dockerfile.cn -t new-api:latest . && \
./deploy.prod.sh slave
'
```

### 5. 加进 nginx upstream（如果该节点要承担 LB 流量）

在 `124.174.20.212` 的 `/etc/nginx/conf.d/seememaas-https.conf` 中 `upstream new_api_relay` 块里加一行：

```nginx
upstream new_api_relay {
    least_conn;
    server 172.16.0.16:3010 max_fails=3 fail_timeout=30s;
    server <新节点内网IP>:3010 max_fails=3 fail_timeout=30s;
    keepalive 64;
}
```

`nginx -t && nginx -s reload`。

## 安全约束

- 部署是远程、影响生产的操作；自动化脚本默认在执行前打印操作摘要并请求确认
- 不要在生产节点跑 `git reset --hard origin/main` 之类破坏性命令，除非你明确知道工作区没有未提交的变更
- 不要回传 `.env.prod` 内容到聊天 / 第三方
- 所有 SSH 调用必须设 `ConnectTimeout=10`，避免会话挂死
