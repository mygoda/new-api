# 运维文档

new-api 在线集群（seeme / dalasi / 火山）的诊断、修复、变更操作 SOP。每篇文档对应一个具体场景或一条独立的运维链路。

## 目录

- [Squid 代理链架构](./squid-proxy-chain.md) ——  以 `210.73.214.189` 为中心的代理链拓扑、节点表、加客户端 / 加目标 / 移除目标的标准流程
- [渠道走代理报 `do request failed: Forbidden` 排查](./channel-proxy-troubleshooting.md) —— 部分节点上某渠道 500 / Forbidden 的复现与修复

## 相关

- 部署 / 更新流程：[`docs/deploy/`](../deploy/)
- 价格配置：[`docs/price-configuration.md`](../price-configuration.md)
- 上游错误处理：[`docs/upstream-error-handling.md`](../upstream-error-handling.md)
