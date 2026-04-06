# 速率限制（Rate Limiting）

## 概述

系统提供三层速率限制机制，保障服务稳定性并支持精细化流量控制：

1. **全局 IP 级限速** — 防止单一 IP 过度访问
2. **密钥（Token）级 RPM/TPM 限速** — 按 API Key 粒度控制请求频率和 Token 消耗
3. **用户级模型请求限速** — 按用户维度限制对模型的请求频率

所有限速均支持 **Redis 分布式** 和 **内存单机** 两种存储后端。启用 Redis 时限速数据跨节点共享；未启用 Redis 时仅单进程内生效。

---

## 一、全局 IP 级限速

### 原理

使用**滑动窗口算法**：将每次请求的时间戳存入 Redis List，检查窗口内的请求数是否超过阈值。

### 配置

通过环境变量设置，所有值均有默认值：

| 环境变量 | 默认值 | 说明 |
|---------|-------|------|
| `GLOBAL_API_RATE_LIMIT` | 180 | API 接口最大请求数 |
| `GLOBAL_API_RATE_LIMIT_DURATION` | 180 | API 接口窗口时间（秒） |
| `GLOBAL_WEB_RATE_LIMIT` | 60 | Web 页面最大请求数 |
| `GLOBAL_WEB_RATE_LIMIT_DURATION` | 180 | Web 页面窗口时间（秒） |
| `CRITICAL_RATE_LIMIT` | 20 | 关键操作最大请求数 |
| `CRITICAL_RATE_LIMIT_DURATION` | 1200 | 关键操作窗口时间（秒） |
| `SEARCH_RATE_LIMIT` | 10 | 搜索操作最大请求数（按用户） |
| `SEARCH_RATE_LIMIT_DURATION` | 60 | 搜索操作窗口时间（秒） |

### Redis Key

| Key 模式 | 类型 | 说明 |
|---------|------|------|
| `rateLimit:{mark}{clientIP}` | List | 全局 IP 限速 |
| `rateLimit:{mark}:user:{userId}` | List | 用户搜索限速 |

---

## 二、密钥（Token）级 RPM/TPM 限速

### 原理

使用**分钟桶计数器**：以 `YYYYMMDDHHMM`（UTC）为粒度，对每个 API Key 分别计数 RPM 和 TPM。

### 流程

```
请求到达
  ↓
1. RPM 检查：读取 tokenRL:rpm:{tokenId}:{bucket}
   → 超限 → 返回 429 "该令牌已达到每分钟请求数限制"
   → 未超限 → INCR 计数 +1
  ↓
2. 执行请求
  ↓
3. 请求成功（HTTP status < 400）：
   → 读取实际消耗的 token 数
   → INCRBY tokenRL:tpm:{tokenId}:{bucket} 实际token数
```

**关键设计**：
- RPM 在请求**前**计数（预扣），确保不会超发
- TPM 在请求**后**按实际消耗记录，仅成功请求计入
- 每个密钥可独立设置 RPM/TPM，设为 0 则使用全局默认值

### 配置

#### 全局默认值

在 **设置 → 速率限制 → 令牌速率限制** 中配置：

| 配置项 | 说明 |
|-------|------|
| `TokenRateLimitEnabled` | 是否启用令牌级速率限制（默认关闭） |
| `TokenRateLimitDefaultRPM` | 全局默认 RPM（0 = 不限制） |
| `TokenRateLimitDefaultTPM` | 全局默认 TPM（0 = 不限制） |

#### 单个密钥覆盖

在 **令牌管理 → 编辑令牌 → 访问限制** 中为单个密钥设置独立的 RPM/TPM 值。设为 0 表示使用全局默认值。

### Redis Key

| Key 模式 | 类型 | TTL | 说明 |
|---------|------|-----|------|
| `tokenRL:rpm:{tokenId}:{bucket}` | String (counter) | 2 分钟 | RPM 计数器 |
| `tokenRL:tpm:{tokenId}:{bucket}` | String (counter) | 2 分钟 | TPM 计数器 |

---

## 三、用户级模型请求限速

### 原理

使用**双重限制**机制：

1. **总请求数限制**（含失败）— 令牌桶算法（Redis Lua 脚本实现）
2. **成功请求数限制**（仅成功）— 滑动窗口算法

### 流程

```
请求到达
  ↓
1. 成功请求数检查（滑动窗口）
   Key: rateLimit:MRRLS:{userId}
  ↓
2. 总请求数检查（令牌桶）
   Key: rateLimit:MRRL{userId}
  ↓
3. 执行请求
  ↓
4. 请求成功（HTTP status < 400）→ 记录成功计数
```

### 配置

在 **设置 → 速率限制 → 模型请求速率限制** 中配置：

| 配置项 | 说明 |
|-------|------|
| `ModelRequestRateLimitEnabled` | 是否启用（注意：可能影响高并发性能） |
| `ModelRequestRateLimitDurationMinutes` | 限速窗口时间（分钟） |
| `ModelRequestRateLimitCount` | 窗口内最大总请求数（0 = 不限制） |
| `ModelRequestRateLimitSuccessCount` | 窗口内最大成功请求数（≥ 1） |

### 按分组差异化配置

`ModelRequestRateLimitGroup` 支持 JSON 格式的分组配置：

```json
{
  "default": [200, 100],
  "vip": [0, 1000],
  "free": [50, 30]
}
```

格式：`"分组名": [总请求数上限, 成功请求数上限]`，0 表示不限制。

**分组配置优先级高于全局配置。**

### Redis Key

| Key 模式 | 算法 | 说明 |
|---------|------|------|
| `rateLimit:MRRL{userId}` | 令牌桶 | 总请求数限速 |
| `rateLimit:MRRLS:{userId}` | 滑动窗口 | 成功请求数限速 |

### 令牌桶算法

令牌桶通过 Redis Lua 脚本（`common/limiter/lua/rate_limit.lua`）实现：

- 按 `elapsed * rate` 补充令牌，不超过桶容量（`capacity`）
- 每次请求消耗一个令牌
- 返回 1 = 允许，0 = 拒绝

---

## 中间件执行顺序

```
/v1/* 请求
  → TokenAuth()              ← 认证，将 token_id/rpm/tpm 写入 context
  → ModelRequestRateLimit()  ← 用户级：检查总请求数 + 成功请求数
  → TokenRateLimit()         ← 密钥级：检查 RPM，请求后记录 TPM
  → Distribute()             ← 渠道路由选择
  → controller.Relay()       ← 执行请求转发
  → PostTextConsumeQuota()   ← 将实际 token 消耗写入 context
  ← TokenRateLimit 后处理    ← 读取实际 token 数，累加到 TPM 计数器
```

---

## 能力对照表

| 维度 | RPM | TPM | 按分组差异化 | 存储后端 |
|------|-----|-----|------------|---------|
| 全局 IP 级 | 支持 | — | — | Redis / 内存 |
| 密钥级 | 支持 | 支持 | — | Redis / 内存 |
| 用户级（按模型） | 支持 | — | 支持 | Redis / 内存 |

---

## Redis Key 汇总

| Key 模式 | 算法 | 作用 |
|---------|------|------|
| `rateLimit:{mark}{clientIP}` | 滑动窗口 | 全局 IP 限速 |
| `rateLimit:{mark}:user:{userId}` | 滑动窗口 | 用户搜索限速 |
| `tokenRL:rpm:{tokenId}:{bucket}` | 分钟计数器 | 密钥 RPM |
| `tokenRL:tpm:{tokenId}:{bucket}` | 分钟计数器 | 密钥 TPM |
| `rateLimit:MRRL{userId}` | 令牌桶 | 用户总请求数 |
| `rateLimit:MRRLS:{userId}` | 滑动窗口 | 用户成功请求数 |

---

## 涉及的文件

### 后端

| 文件 | 说明 |
|------|------|
| `common/init.go` | 全局限速参数定义与环境变量加载 |
| `common/constants.go` | 限速常量定义 |
| `common/rate-limit.go` | 内存滑动窗口限速器实现 |
| `common/limiter/limiter.go` | Redis 令牌桶限速器实现 |
| `common/limiter/lua/rate_limit.lua` | 令牌桶 Lua 脚本 |
| `setting/rate_limit.go` | Token/模型限速配置加载 |
| `middleware/rate-limit.go` | 全局 IP/用户限速中间件 |
| `middleware/token-rate-limit.go` | 密钥 RPM/TPM 限速中间件 |
| `middleware/model-rate-limit.go` | 用户模型请求限速中间件 |
| `middleware/auth.go` | 认证中间件，将 RPM/TPM 写入 context |
| `model/token.go` | Token 模型，包含 RPM/TPM 字段 |
| `service/text_quota.go` | 请求完成后将实际 token 消耗写入 context |

### 前端

| 文件 | 说明 |
|------|------|
| `web/src/pages/Setting/RateLimit/SettingsTokenRateLimit.jsx` | 令牌速率限制设置页 |
| `web/src/pages/Setting/RateLimit/SettingsRequestRateLimit.jsx` | 模型请求速率限制设置页 |
| `web/src/components/settings/RateLimitSetting.jsx` | 限速设置统一入口组件 |
| `web/src/components/table/tokens/modals/EditTokenModal.jsx` | 单个密钥 RPM/TPM 编辑 |
