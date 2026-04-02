# 欠费判断与计费流程

## 概述

系统在处理每个 API 请求时，通过**预扣费 → 请求转发 → 结算**三阶段流程完成计费。欠费判断发生在预扣费阶段，若余额不足则直接拒绝请求（HTTP 403）。

---

## 请求计费完整流程

```
HTTP 请求进入
    │
    ▼
[1] Token 认证 (middleware/auth.go)
    - 校验 API Key 是否有效、未禁用、未过期
    - 校验用户状态（是否被封禁）
    │
    ▼
[2] 估算费用 (controller/relay.go → helper.ModelPriceHelper)
    - 根据请求内容估算 Token 用量
    - 查找模型倍率（model_ratio）
    - 查找分组倍率（group_ratio）
    - 计算预扣额度 = 估算Token × 模型倍率 × 分组倍率
    │
    ▼
[3] 预扣费 (service/billing_session.go → PreConsumeBilling)
    - 选择计费来源（钱包 / 订阅）
    - **余额检查（即欠费判断）**
    - 扣减预估额度
    │  ← 余额不足则返回 403 拒绝请求
    ▼
[4] 转发请求到上游 API
    │
    ▼
[5] 结算 (service/billing.go → SettleBilling)
    - 计算实际用量对应的额度
    - 差额 = 实际额度 - 预扣额度
    - 差额 > 0：补扣差额
    - 差额 < 0：返还多扣部分
    │
    ▼
[6] 请求完成

[异常分支] 请求失败 → 自动退还已预扣的额度
```

---

## 欠费判断详细逻辑

### 判断位置

`service/billing_session.go` 的 `NewBillingSession()` 函数（约 254-347 行）。

### 钱包模式的欠费判断

```go
// 1. 获取当前用户余额
userQuota, err := model.GetUserQuota(relayInfo.UserId, false)

// 2. 第一层判断：余额 ≤ 0，直接拒绝
if userQuota <= 0 {
    return ERROR: "用户额度不足, 剩余额度: xxx"
    // HTTP 403, error_code: insufficient_user_quota
}

// 3. 第二层判断：余额不够预扣
if userQuota - preConsumedQuota < 0 {
    return ERROR: "预扣费额度失败, 用户剩余额度: xxx, 需要预扣费额度: xxx"
    // HTTP 403, error_code: insufficient_user_quota
}
```

### 订阅模式的欠费判断

```go
// 1. 查找有效订阅（status='active' 且未过期）
//    按到期时间升序排列，优先消耗最早到期的订阅

// 2. 判断订阅剩余额度
remain := subscription.AmountTotal - subscription.AmountUsed
if remain < amount {
    continue  // 当前订阅不够，尝试下一个
}

// 3. 所有订阅都不够 → 拒绝
return ERROR: "subscription quota insufficient"
// HTTP 403
```

### 令牌额度检查

除了用户级别的余额，还会检查令牌（Token）自身的额度限制：

```go
// service/quota.go 第 351-373 行
if !relayInfo.TokenUnlimited && token.RemainQuota < quota {
    return ERROR: "token quota is not enough"
}
```

---

## 计费来源选择策略

系统支持四种计费优先级，通过 billing preference 配置：

| 模式 | 行为 |
|------|------|
| `subscription_first`（默认） | 先尝试订阅扣费，不足时回退到钱包 |
| `wallet_first` | 先尝试钱包扣费，不足时回退到订阅 |
| `subscription_only` | 仅使用订阅，不足直接报错 |
| `wallet_only` | 仅使用钱包，不足直接报错 |

---

## 预扣额度计算方式

### 基于 Token 的计算

```
预扣额度 = 估算输入Token × 模型倍率 × 分组倍率
```

### 基于价格的计算

```
预扣额度 = 模型价格 × QuotaPerUnit × 分组倍率
```

### 倍率体系

- **模型倍率**（model_ratio）：不同模型的价格系数，如 GPT-4 = 15，GPT-4o-mini = 0.075
- **分组倍率**（group_ratio）：用户所在分组的价格系数，可针对不同用户组设置折扣或加价
- **补全倍率**（completion_ratio）：输出 Token 相对于输入 Token 的价格倍率

---

## 信任额度（Trust Quota）机制

为减少高频请求的预扣费开销，系统提供信任额度旁路：

- 当用户余额超过信任额度阈值时，**跳过预扣费**，直接转发请求
- 请求完成后直接扣除实际用量
- 异步任务（视频生成、音乐生成等）不适用信任额度，**强制预扣费**
- 订阅模式不适用信任额度

```go
// service/billing_session.go 第 194-228 行
func (s *BillingSession) shouldTrust(c *gin.Context) bool {
    if s.relayInfo.ForcePreConsume { return false }   // 异步任务强制预扣
    trustQuota := common.GetTrustQuota()
    if trustQuota <= 0 { return false }               // 未配置则不启用
    return s.relayInfo.UserQuota > trustQuota          // 余额 > 阈值
}
```

---

## 免费模型

若模型被标记为免费（`FreeModel = true`），则跳过整个预扣费流程：

```go
// controller/relay.go 第 166-173 行
if priceData.FreeModel {
    // 跳过预扣费
} else {
    service.PreConsumeBilling(c, priceData.QuotaToPreConsume, relayInfo)
}
```

---

## 退款机制

请求失败时自动退还已预扣的额度：

```go
// controller/relay.go 第 175-184 行
defer func() {
    if newAPIError != nil && relayInfo.Billing != nil {
        relayInfo.Billing.Refund(c)  // 异步退还
    }
}()
```

- **钱包退款**：`model.IncreaseUserQuota()` 返还额度
- **订阅退款**：通过 `requestId` 标记为已退款，回退 `AmountUsed`
- 退款操作是幂等的，不会重复退还

---

## 错误码汇总

| 错误码 | HTTP 状态 | 含义 |
|--------|----------|------|
| `insufficient_user_quota` | 403 | 用户钱包余额不足 |
| `pre_consume_token_quota_failed` | 403 | 令牌额度不足 |
| （无特定 code） | 403 | 无有效订阅 |
| （无特定 code） | 403 | 订阅额度不足 |

---

## 相关核心文件

| 文件 | 职责 |
|------|------|
| `service/billing_session.go` | 计费会话生命周期：预扣、结算、退款 |
| `service/billing.go` | 高层结算入口 |
| `service/funding_source.go` | 钱包/订阅两种资金来源实现 |
| `service/quota.go` | Token 额度计算与扣减 |
| `service/text_quota.go` | 文本请求的详细额度计算 |
| `controller/relay.go` | 请求入口，编排预扣→转发→结算流程 |
| `model/user.go` | 用户余额字段（Quota/UsedQuota）及增减操作 |
| `model/subscription.go` | 订阅预扣/结算/退款的数据库事务 |
| `setting/ratio_setting/model_ratio.go` | 模型倍率配置 |
| `setting/ratio_setting/group_ratio.go` | 分组倍率配置 |
| `middleware/auth.go` | Token 认证及用户状态校验 |
