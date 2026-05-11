# 渠道走代理报 `do request failed: Forbidden` 排查 SOP

某个渠道开始报 `status_code=500, upstream error: do request failed`，且只在部分节点（通常是新加入的 slave）出现，但 master 上一切正常 —— 通常都是父代理白名单没把新节点的出口 IP 收进去。本文记录 2026-05-10 这次 channel 6（`https://www.liudan.hk`）在 `.225` 上的具体复现 + 修复过程，作为以后同类问题的运维范式。

## 现象

- new-api 日志：
  ```
  [ERR] do request failed: Post "https://www.liudan.hk/v1/messages?beta=true": Forbidden
  [ERR] channel error (channel #6, status code: 500): upstream error: do request failed
  ```
- master（`124.174.20.212`）正常，slave（`124.174.20.225`）失败
- 渠道配置 `setting.proxy = http://210.73.214.189:3128`（父代理）

`Forbidden` 不是 HTTP 状态码，是 Go `http.Client.Do` 拿到的错误字符串。当上游或代理在 CONNECT 隧道阶段返回 `HTTP/1.1 403 Forbidden` 时，Go 会把它包装成这条错误。

## 排查链

```
渠道配置 setting.proxy
   │
   ▼
new-api 容器 → 父代理 210.73.214.189:3128
                         │
                         ▼
                父代理 squid 校验客户端 IP
                         │
            ┌────────────┴────────────┐
            ▼                          ▼
     在白名单 → CONNECT 200      不在白名单 → 403 Forbidden
            │                          │
            ▼                          ▼
       上游返回 401（缺 key）    new-api 报 do request failed
       业务可继续做认证            渠道 500
```

## 1. 在出问题的节点上直接 curl 父代理

```bash
ssh root@<出问题节点> '
curl -v --max-time 10 --proxy http://210.73.214.189:3128 \
  -X POST "https://www.liudan.hk/v1/messages?beta=true" \
  -H "Content-Type: application/json" -d "{}" 2>&1 \
  | grep -E "Connected|CONNECT|< HTTP|Forbidden"
'
```

### 判定

- `< HTTP/1.1 200 Connection established` → 父代理放行了，问题不在白名单（继续看上游或鉴权）
- `< HTTP/1.1 403 Forbidden` → **父代理拒绝该节点的客户端 IP**，进入第 2 步

对比 master 上同一条命令应返回 `200 Connection established`，可作为对照组。

## 2. 登录父代理，把节点出口 IP 加进 squid 白名单

```bash
ssh root@210.73.214.189
```

```bash
# 1) 备份
cp /etc/squid/squid.conf /etc/squid/squid.conf.bak.$(date +%Y%m%d-%H%M%S)

# 2) 在 acl upstream_peers 末尾追加新 IP
#    现状例：
#    acl upstream_peers src 115.190.160.25 124.174.20.212 124.174.20.225
sed -i 's|^\(acl upstream_peers src .*\)$|\1 <新节点公网 IP>|' /etc/squid/squid.conf
grep '^acl upstream_peers src' /etc/squid/squid.conf

# 3) 校验语法
squid -k parse 2>&1 | grep -E 'ERROR|FATAL' || echo CONFIG_OK

# 4) 热加载（不中断现有连接）
squid -k reconfigure
```

`squid -k reconfigure` 输出里若出现 `WARNING: '127.0.0.1' is a subnetwork of '127.0.0.1'`，是 squid.conf 里 `acl localhost src 127.0.0.1/32` 与默认 ACL 重叠的老告警，与本次操作无关。

## 3. 验证

回到 new-api 节点（不是父代理）：

```bash
ssh root@<新节点> '
curl -s --max-time 10 --proxy http://210.73.214.189:3128 \
  -o /dev/null -w "HTTP %{http_code}\n" \
  -X POST "https://www.liudan.hk/v1/messages?beta=true" \
  -H "Content-Type: application/json" -d "{}"
'
```

期望输出：

```
HTTP 401
```

`401` 表示父代理已放行，上游正常响应"缺 API key"。回到 new-api 容器日志，新发起一次走该渠道的请求，应能拿到正常计费记录而不是 `Forbidden`。

## 常见误区

| 误判 | 实际 |
|---|---|
| "应该是 .225 没装代理服务，参考 master 装一个" | 即便 .225 装本地 squid，最终仍要去父代理出网，父代理看到的源 IP 依然是 .225 自己的，仍 403 |
| "渠道走错代理了" | 渠道 setting.proxy 字段就是父代理公网地址，是默认行为，不是 bug |
| "把渠道代理改成 master 内网地址" | 是另一种可行解，但会让所有 slave 流量在 master 上汇聚，单点风险 + 流量绕一跳。推荐方案是父代理白名单加 IP（一次配置长期生效） |

## 相关

- 整体代理链架构、节点表、添加新客户端/新目标的全流程：[squid-proxy-chain.md](./squid-proxy-chain.md)
