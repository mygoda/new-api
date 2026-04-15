# 请求鉴权与模型路由流程

## 概述

当用户通过 API 调用某个模型时（例如 `POST /v1/chat/completions`），系统会经过一系列中间件链逐层校验，最终选定一个可用渠道转发请求。本文档完整描述这一流程。

---

## 中间件执行顺序

定义在 `router/relay-router.go`，relay 路由的中间件链按顺序为：

1. `CORS()` — 跨域处理
2. `DecompressRequestMiddleware()` — 请求体解压
3. `BodyStorageCleanup()` — 请求体缓存清理
4. `StatsMiddleware()` — 统计埋点
5. `RouteTag("relay")` — 路由标记
6. **`SystemPerformanceCheck()`** — 系统负载检查
7. **`TokenAuth()`** — Token 认证与用户校验
8. **`ModelRequestRateLimit()`** — 模型请求频率限制
9. **`TokenRateLimit()`** — Token 级别频率限制
10. **`Distribute()`** — 模型权限校验与渠道分配

---

## 第 1 层：系统负载检查

**文件**: `middleware/performance.go`

| 检查项 | 条件 | 错误码 |
|--------|------|--------|
| CPU 使用率 | 超过阈值 | 503 |
| 内存使用率 | 超过阈值 | 503 |
| 磁盘使用率 | 超过阈值 | 503 |

未超过阈值则放行。

---

## 第 2 层：Token 认证

**文件**: `middleware/auth.go`, `model/token.go`

### 2.1 Token 提取

从请求中提取 Token Key，支持多种来源：

| 来源 | 格式 |
|------|------|
| Authorization Header | `Bearer sk-xxx` |
| WebSocket | `Sec-WebSocket-Protocol` Header |
| Anthropic API | `x-api-key` Header |
| Gemini API | `x-goog-api-key` Header 或 `?key=` 查询参数 |
| Midjourney | `mj-api-secret` Header |

### 2.2 Token 校验

查询数据库 `tokens` 表，依次检查：

| # | 检查项 | 条件 | 错误 |
|---|--------|------|------|
| 1 | Token 存在 | DB 中能找到对应记录 | 401 无权限 |
| 2 | Token 状态 | `status == enabled` | 403 令牌状态不可用 |
| 3 | Token 有效期 | `expired_time == -1`（永不过期）或 `expired_time >= 当前时间` | 403 令牌已过期 |
| 4 | Token 额度 | `unlimited_quota == true` 或 `remain_quota > 0` | 403 额度已用尽 |

### 2.3 IP 白名单

如果 Token 配置了 `allow_ips`（CIDR 列表），客户端 IP 必须在允许范围内，否则返回 403。

### 2.4 用户状态

通过 `token.user_id` 查询用户缓存，检查 `user.status == enabled`，用户被禁用则返回 403。

### 2.5 分组校验

- 若 Token 指定了 `group`，需验证该分组在用户可用分组列表中
- 若 Token 未指定分组，使用用户默认分组
- 最终确定本次请求使用的分组（`using_group`），写入请求上下文

### 2.6 上下文写入

认证通过后，以下信息写入 Gin Context 供后续中间件使用：

```
user_id, token_id, token_key, token_name,
token_unlimited_quota, token_quota,
token_model_limit_enabled, token_model_limit (map),
token_group, using_group, token_rpm, token_tpm
```

---

## 第 3 层：频率限制

### 3.1 模型请求频率限制

**文件**: `middleware/model-rate-limit.go`

- **维度**: 用户 + 分组
- **机制**: Redis 滑动窗口计数
- **配置项**: `ModelRequestRateLimitEnabled`, `ModelRequestRateLimitDurationMinutes`, `ModelRequestRateLimitCount`
- **结果**: 超限返回 429

### 3.2 Token 级别频率限制

**文件**: `middleware/token-rate-limit.go`

| 限制类型 | Redis Key | 说明 |
|----------|-----------|------|
| RPM | `tokenRL:rpm:{tokenId}:{分钟桶}` | 每分钟请求次数 |
| TPM | `tokenRL:tpm:{tokenId}:{分钟桶}` | 每分钟 Token 消耗量（请求后累加） |

Token 自身配置的 `rpm`/`tpm` 优先，未配置则使用系统默认值。超限返回 429。

---

## 第 4 层：模型权限校验与渠道分配

**文件**: `middleware/distributor.go`, `model/ability.go`, `service/channel_select.go`

### 4.1 提取请求模型

从请求体 JSON 的 `model` 字段（或查询参数、路径参数）提取用户请求的模型名称。

### 4.2 Token 模型白名单

若 `token.model_limits_enabled == true`：
- 将请求模型与 `token.model_limits`（逗号分隔的模型名列表）比对
- 不在列表中 → 返回 403

### 4.3 渠道匹配（核心逻辑）

**这是判断用户能否使用某模型的核心环节。**

查询 `abilities` 表：

```sql
SELECT * FROM abilities
WHERE group = {using_group}
  AND model = {requested_model}
  AND enabled = true
```

**`abilities` 表结构**：

| 字段 | 说明 |
|------|------|
| `group` | 分组名 |
| `model` | 模型名 |
| `channel_id` | 渠道 ID |
| `enabled` | 是否启用 |
| `priority` | 优先级（数值越大越优先） |
| `weight` | 权重（同优先级内的流量分配） |

**abilities 表的数据来源**：当管理员在渠道管理中配置渠道的 `models`（支持的模型列表）和 `group`（分组列表）时，系统自动生成 abilities 记录。

若查询无结果 → 返回 403（该分组下无可用渠道提供此模型）。

### 4.4 渠道选择策略

匹配到多条 ability 记录后：

1. **优先级分级**: 首次请求使用最高优先级的渠道；重试时逐级降低
2. **加权随机**: 同优先级内，按 `weight` 加权随机选择一个渠道
3. **渠道状态检查**: 选中的渠道 `status` 必须为 `enabled`
4. **亲和性**: 若启用了渠道亲和（affinity），优先复用上次成功的渠道

### 4.5 Auto 分组与跨组重试

若使用 `auto` 分组：
- 按用户可用分组列表依次尝试
- 每个分组独立查询 abilities 表
- 某分组无可用渠道时自动尝试下一个分组

### 4.6 渠道上下文写入

选定渠道后，写入上下文供 relay 层使用：

```
channel_id, channel_name, channel_type, channel_key,
channel_base_url, channel_model_mapping, channel_settings, ...
```

其中 `channel_model_mapping` 会在 relay 层将用户请求的模型名替换为上游实际模型名。

---

## 第 5 层：请求转发与计费

### 5.1 模型映射

**文件**: `relay/helper/model_mapped.go`

若渠道配置了 `model_mapping`（JSON 对象），在发送给上游之前替换模型名：

```json
{ "sonnet": "claude-sonnet-4-5-20250929" }
```

支持链式映射（A→B→C），有循环检测。

### 5.2 请求转发

relay 层根据渠道类型选择对应的 adaptor（OpenAI/Claude/Gemini/...），转发请求到上游 provider。

### 5.3 计费扣除

**文件**: `service/quota.go`

成功响应后，按实际 token 用量计算费用并扣减：
- `user.quota` — 用户钱包
- `token.remain_quota` — Token 剩余额度

---

## 流程图

```
请求进入
  │
  ├── 系统负载检查 ──── 超限 → 503
  │
  ├── Token 认证
  │   ├── Token 不存在/无效 → 401
  │   ├── Token 过期/耗尽 → 403
  │   ├── IP 不在白名单 → 403
  │   ├── 用户被禁用 → 403
  │   └── 分组不合法 → 403
  │
  ├── 频率限制
  │   ├── 模型请求频率超限 → 429
  │   └── Token RPM/TPM 超限 → 429
  │
  ├── 模型权限 & 渠道分配
  │   ├── Token 模型白名单不通过 → 403
  │   ├── abilities 表无匹配记录 → 403（该分组下无此模型）
  │   └── 加权随机选定渠道
  │
  ├── 模型映射（如有配置）
  │
  ├── 转发至上游 Provider
  │
  └── 成功响应 → 扣减额度
```

---

## 关键数据库表

| 表 | 核心字段 | 作用 |
|----|----------|------|
| `tokens` | key, user_id, status, expired_time, remain_quota, unlimited_quota, model_limits_enabled, model_limits, group, allow_ips, rpm, tpm | 令牌认证与权限 |
| `users` | id, status, group | 用户状态与分组 |
| `channels` | id, status, type, models, group, model_mapping, key, base_url, priority, weight | 渠道配置 |
| `abilities` | group, model, channel_id, enabled, priority, weight | 分组×模型×渠道的可用性映射（由渠道配置自动生成） |

---

## 常见问题

**Q: 为什么用户报 "该模型不存在" ？**

按以下顺序排查：
1. Token 是否启用了 `model_limits`，且列表中不包含该模型
2. Token 所属分组下，是否有渠道配置了该模型
3. 渠道是否启用（`status == enabled`）
4. abilities 表中对应记录的 `enabled` 是否为 true

**Q: model_mapping 和 abilities 表的关系？**

abilities 表中记录的是用户可见的模型名（渠道 `models` 字段配置的名称）。`model_mapping` 仅在请求转发时将该名称替换为上游实际名称，不影响 abilities 表。
