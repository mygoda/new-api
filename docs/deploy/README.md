# 部署文档

new-api 各环境的部署 / 更新流程。每个环境对应一份独立 SOP，本目录是索引。

## 环境

| 环境 | 主机 | 角色 | 文档 |
|---|---|---|---|
| seeme | `124.174.20.212` | master | [seeme.md](./seeme.md) |
| seeme | `124.174.20.225` | slave + Doris | [seeme.md](./seeme.md) |
| dalasi | `148.153.38.18` | 单机 | [dalasi.md](./dalasi.md) |
| 火山 web-1 | `115.190.160.25` | 单机 | [huoshan.md](./huoshan.md) |

## 自动化 skill

每篇 SOP 对应一个 `/...` 自动化 skill（位于 `.claude/skills/` 或用户级 `~/.claude/skills/`）；文档是 skill 的人读版本，用于不熟悉 skill 框架的同事能直接查阅、或者出问题时手工补救。

| 环境 | 自动化 skill |
|---|---|
| seeme | `/update-seeme-newapi <IP>` |
| dalasi | `/dalasi-deploy` |
| 火山 web-1 | `/huoshan-newapi-deploy` |

## 共通约束

- **不要在生产远程做 `git reset --hard`、强制 push、删除分支**之类的破坏性命令
- **不要回传 `.env.prod` 内容**到聊天 / 第三方
- **所有 SSH 调用设 `ConnectTimeout=10`**，避免会话挂死
- **部署是远程、影响生产的操作**——自动化脚本默认会在执行前打印操作摘要并请求确认；手动执行也请保持同样意识
- 失败时不要自动重试，把退出码 + 最后 50 行日志贴给上下文，让人决定下一步

## 相关

- 运维 / 故障排查：[`docs/ops/`](../ops/)
- 数据库 / Doris：[`docs/database.md`](../database.md), [`docs/doris-request-logs.md`](../doris-request-logs.md)
