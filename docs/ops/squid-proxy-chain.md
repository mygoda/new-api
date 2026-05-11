# Squid 代理链架构

new-api 部分上游需要走代理出网（如 `www.liudan.hk`），所有节点共享一条以 `210.73.214.189` 为中心的 squid 代理链。本文是这条链路的现状索引；具体操作流程（添加目标 / 添加客户端 / 移除目标）在文末。

## 拓扑

```
new-api 客户端                 中心代理                 转发节点                 目标
┌──────────────────────┐    ┌─────────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ 115.190.160.25       │    │ 210.73.214.189:3128 │    │ 10.240.0.1       │    │ 202.55.82.30    │
│ (火山 web-1)         │─┐  │                     │ ┌─→│ 出口 148.153.253.51 │─→│ www.liudan.hk    │
│ 124.174.20.212       │─┼─→│ eth1: 10.240.2.1    │─┤  │                  │    │                 │
│ (seeme master)       │ │  │                     │ │  │ 10.240.1.1       │    │ 104.18.13.236   │
│ 124.174.20.225       │─┘  │                     │ └─→│ 出口 148.153.75.196 │─→│ www.liudan.hk    │
│ (seeme slave + Doris)│    │                     │    │                  │    │ (alt route)     │
└──────────────────────┘    └─────────────────────┘    └──────────────────┘    └─────────────────┘
```

- 客户端节点本地不需要任何代理服务。new-api 渠道直接把 `setting.proxy` 配成 `http://210.73.214.189:3128`，请求经 CONNECT 隧道 → 中心代理 → 转发节点 → 目标。
- 中心代理 squid 用 `acl upstream_peers src` 做客户端 IP 白名单，新节点必须显式加进来才能被放行。
- 中心代理用 `tcp_outgoing_address` 把不同目标 IP 的出向流量绑到不同的 `eth1` 别名上，再通过路由表把这些子网交给转发节点 NAT 出公网。

> 注：项目历史曾经也让客户端节点本地跑 squid 做 `cache_peer` 二级代理，但实际生产里最终采用「new-api 直接连中心代理」的简化模式。客户端节点上 squid 是可选的（用作内网分流）。本文以现行简化拓扑为准。

## 节点表

### 客户端节点

| IP | 角色 | 备注 |
|---|---|---|
| `115.190.160.25` | 火山 web-1 | 内网 `172.16.0.228` |
| `124.174.20.212` | seeme master | 容器名 `new-api-master` |
| `124.174.20.225` | seeme slave + Doris 宿主 | 容器名 `new-api-slave` |

历史节点 `124.174.20.24`（seeme slave）已下线，已从中心代理 ACL 移除。

### 中心代理

| 项 | 值 |
|---|---|
| 公网 IP | `210.73.214.189` |
| 内网 IP（eth1） | `10.240.2.1`（10.240.0.0/16） |
| Squid 端口 | `3128` |
| 配置文件 | `/etc/squid/squid.conf` |
| SSH | `root@210.73.214.189`（已加 key） |

### 转发节点

| 内网 IP | 出口公网 IP | 转发目标 | SSH |
|---|---|---|---|
| `10.240.0.1` | `148.153.253.51` | `202.55.82.30` | `ssh -J root@210.73.214.189 root@10.240.0.1` |
| `10.240.1.1` | `148.153.75.196` | `104.18.13.236` | `ssh -J root@210.73.214.189 root@10.240.1.1` |

### 目标

| IP | 域名 | 走哪台转发 |
|---|---|---|
| `202.55.82.30` | `www.liudan.hk` 解析 | `10.240.0.1` |
| `104.18.13.236` | `www.liudan.hk` 解析（备） | `10.240.1.1` |

## 中心代理 squid.conf 关键配置

```squid
http_port 3128

# 客户端白名单（新节点必须加在这里）
acl upstream_peers src 115.190.160.25 124.174.20.212 124.174.20.225

acl SSL_ports port 443
acl Safe_ports port 80
acl Safe_ports port 443
acl Safe_ports port 1025-65535

# 目标白名单（新目标加在这里 + 配 tcp_outgoing_address）
acl to_target_1 dst 202.55.82.30
acl to_target_2 dst 104.18.13.236

http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access allow localhost
http_access allow localnet
http_access allow upstream_peers
http_access deny all

# 不同目标走不同出口（出向流量绑到不同 eth1 别名 → 走不同转发节点）
tcp_outgoing_address 10.240.2.1 to_target_1
tcp_outgoing_address 10.240.2.1 to_target_2
tcp_outgoing_address 10.240.2.1
```

中心代理的路由表（持久化在 `/etc/networkd-dispatcher/routable.d/` 下）把目标 IP 段交给对应的转发节点：

```
ip route add 202.55.82.30/32 via 10.240.0.1 dev eth1
ip route add 104.18.13.236/32 via 10.240.1.1 dev eth1
```

转发节点（如 `10.240.0.1`）开 IP 转发 + iptables MASQUERADE：

```bash
sysctl -w net.ipv4.ip_forward=1
iptables -A FORWARD -s 10.240.0.0/16 -d <目标IP> -j ACCEPT
iptables -A FORWARD -d 10.240.0.0/16 -s <目标IP> -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -t nat -A POSTROUTING -s 10.240.0.0/16 -d <目标IP> -o eth0 -j MASQUERADE
netfilter-persistent save
```

## 操作

### 加一个新客户端节点（最常见）

新部署的 new-api 节点要走代理：

```bash
ssh root@210.73.214.189 '
cp /etc/squid/squid.conf /etc/squid/squid.conf.bak.$(date +%Y%m%d-%H%M%S)
sed -i "s|^\(acl upstream_peers src .*\)$|\1 <新节点公网IP>|" /etc/squid/squid.conf
grep "^acl upstream_peers src" /etc/squid/squid.conf
squid -k parse 2>&1 | grep -E "ERROR|FATAL" || echo CONFIG_OK
squid -k reconfigure
'
```

详见 [channel-proxy-troubleshooting.md](./channel-proxy-troubleshooting.md)。

### 加一个新代理目标

需要让某个上游 IP 也走代理链：

1. **转发节点开 NAT**（通过中心代理跳转 SSH）：
   ```bash
   ssh -J root@210.73.214.189 root@<转发节点内网IP> '
   sysctl -w net.ipv4.ip_forward=1
   iptables -A FORWARD -s 10.240.0.0/16 -d <目标IP> -j ACCEPT
   iptables -A FORWARD -d 10.240.0.0/16 -s <目标IP> -m state --state ESTABLISHED,RELATED -j ACCEPT
   iptables -t nat -A POSTROUTING -s 10.240.0.0/16 -d <目标IP> -o eth0 -j MASQUERADE
   netfilter-persistent save
   '
   ```

2. **中心代理加路由 + 持久化**：
   ```bash
   ssh root@210.73.214.189 '
   ip route add <目标IP>/32 via <转发节点内网IP> dev eth1
   cat > /etc/networkd-dispatcher/routable.d/50-route-<标识> <<EOF
   #!/bin/bash
   ip route replace <目标IP>/32 via <转发节点内网IP> dev eth1
   EOF
   chmod +x /etc/networkd-dispatcher/routable.d/50-route-<标识>
   '
   ```

3. **中心代理 squid 配置**——在 `/etc/squid/squid.conf` 追加：
   ```squid
   acl to_target_N dst <目标IP>
   tcp_outgoing_address 10.240.2.1 to_target_N
   ```
   然后 `squid -k parse && squid -k reconfigure`。

### 移除一个目标

1. 中心代理：`ip route del <目标IP>/32`，删除 `/etc/networkd-dispatcher/routable.d/` 下对应文件，从 squid.conf 删 `acl to_target_N` 和对应 `tcp_outgoing_address`，`squid -k reconfigure`。
2. 转发节点：删除对应 iptables 规则，`netfilter-persistent save`。

### 查询当前状态

中心代理：

```bash
ssh root@210.73.214.189 '
echo "=== Routes ===";    ip route show | grep -v default
echo "=== Squid ACL ==="; grep -E "^acl to_target|^tcp_outgoing|^acl upstream" /etc/squid/squid.conf
echo "=== Squid ===";     systemctl is-active squid
'
```

## 安全约束

- 修改 squid.conf 前必须备份（`cp squid.conf squid.conf.bak.$(date +%s)`）
- 必须先 `squid -k parse`，校验通过再 `squid -k reconfigure`
- `squid -k reconfigure` 是热加载，不中断现有连接；不要用 `systemctl restart squid`
- 不要直接连转发节点的内网 IP，必须经 `210.73.214.189` 跳转（`ssh -J`）
- 不要回传任何节点密码 / SSH key
