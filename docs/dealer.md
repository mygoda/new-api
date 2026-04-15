# 代理商（Dealer / Reseller）功能

## 概述

代理商功能允许平台管理员将普通用户提升为「代理商」角色。代理商可以：

- 创建和管理自己的子用户
- 从自身额度池中向子用户分配额度
- 为子用户设置定价倍率（加价/折扣）
- 管理子用户的 API 令牌
- 查看子用户的消费账单

**业务模型**：池子模式 — 代理商先充值额度，再分配给子用户，子用户消费从自己的额度扣除。代理商通过 `dealer_ratio` 设置加价/折扣赚取差价。

---

## 角色体系

| 角色 | 值 | 说明 |
|------|----|------|
| Guest | 0 | 访客 |
| CommonUser | 1 | 普通用户 |
| **DealerUser** | **5** | **代理商** |
| AdminUser | 10 | 管理员 |
| RootUser | 100 | 超级管理员 |

代理商角色（role=5）位于普通用户和管理员之间。代理商**不能**访问管理员路由，管理员和超级管理员可以管理代理商。

---

## 数据模型

### User 表新增字段

| 字段 | 类型 | 默认值 | 索引 | 说明 |
|------|------|--------|------|------|
| `parent_id` | int | 0 | 有 | 所属代理商的用户 ID。0 = 平台直属用户 |
| `dealer_ratio` | double | 1.0 | 无 | 代理商为该子用户设定的定价倍率 |
| `dealer_remark` | varchar(255) | "" | 无 | 代理商备注（仅代理商可见） |

字段通过 GORM AutoMigrate 自动添加，兼容 SQLite / MySQL / PostgreSQL。

---

## 定价公式

### 按 Token 计费（文本类模型）

```
最终额度 = 基础 Token 数 × 模型倍率(model_ratio) × 分组倍率(group_ratio) × dealer_ratio
```

### 按次计费（MJ / Task 类模型）

```
最终额度 = 模型单价(model_price) × QuotaPerUnit × 分组倍率(group_ratio) × dealer_ratio
```

### 注入机制

`dealer_ratio` 通过已有的 `PriceData.OtherRatios` 机制注入，不修改核心计费逻辑：

```go
// relay/helper/price.go — ModelPriceHelper
if dealerRatioVal, exists := common.GetContextKey(c, constant.ContextKeyDealerRatio); exists {
    if dr, ok := dealerRatioVal.(float64); ok && dr > 0 && dr != 1.0 {
        priceData.AddOtherRatio("dealer_ratio", dr)
        priceData.QuotaToPreConsume = int(float64(priceData.QuotaToPreConsume) * dr)
    }
}
```

`dealer_ratio` 在 Token 认证阶段从 UserBase 缓存读取并写入 `gin.Context`（`model/user_cache.go` → `WriteContext`），对所有计费路径自动生效。

当 `dealer_ratio = 1.0` 时不注入，不影响普通用户的计费。

---

## API 接口

所有接口均在 `/api/dealer` 路由组下，需要 `DealerAuth()` 中间件鉴权（要求 `role >= 5`）。

### 子用户管理

#### GET /api/dealer/users

获取代理商的子用户列表（分页）。

**Query 参数**：`p` (页码), `page_size` (每页条数)

**响应**：分页数据，包含子用户列表。

---

#### GET /api/dealer/users/search

搜索子用户。

**Query 参数**：`keyword` (搜索关键词), `p`, `page_size`

搜索范围：用户 ID、用户名、邮箱、显示名称。

---

#### POST /api/dealer/users

创建子用户。

**请求体**：

```json
{
  "username": "string",        // 必填，最长 20 字符
  "password": "string",        // 必填，8-20 字符
  "display_name": "string",    // 可选
  "dealer_ratio": 1.0,         // 可选，默认 1.0，必须 > 0
  "dealer_remark": "string",   // 可选
  "initial_quota": 0           // 可选，创建时从代理商额度转入的初始额度
}
```

创建的用户自动设置 `parent_id = 代理商ID`，角色为 `CommonUser(1)`。

如果 `initial_quota > 0`，会自动从代理商额度中转入初始额度（原子事务）。

---

#### PUT /api/dealer/users

更新子用户信息。

**请求体**（部分更新，仅传需要修改的字段）：

```json
{
  "id": 123,                   // 必填
  "display_name": "string",    // 可选
  "password": "string",        // 可选，留空不修改
  "dealer_ratio": 1.5,         // 可选，必须 > 0
  "dealer_remark": "string"    // 可选
}
```

---

#### DELETE /api/dealer/users/:id

永久删除子用户（硬删除）。

---

#### POST /api/dealer/users/manage

启用/禁用子用户。

**请求体**：

```json
{
  "user_id": 123,
  "action": "disable"   // "disable" 或 "enable"
}
```

---

### 额度管理

#### POST /api/dealer/quota/transfer

从代理商自身额度转移到子用户。

**请求体**：

```json
{
  "user_id": 123,
  "quota": 500000    // 必须 > 0
}
```

**实现细节**：
- 使用数据库事务 + `SELECT FOR UPDATE` 行级锁保证原子性
- 转移后异步更新 Redis 缓存
- 额度不足时返回详细余额信息

---

#### GET /api/dealer/quota/stats

获取代理商额度统计。

**响应**：

```json
{
  "dealer_quota": 1000000,      // 代理商自身剩余额度
  "allocated_quota": 500000,    // 所有子用户剩余额度总和
  "used_quota": 200000,         // 所有子用户已用额度总和
  "sub_user_count": 10          // 子用户数量
}
```

---

### 子用户令牌管理

#### GET /api/dealer/users/:id/tokens

获取指定子用户的令牌列表（分页）。

#### POST /api/dealer/users/:id/tokens

为子用户创建令牌。

**请求体**：

```json
{
  "name": "string",                 // 令牌名称，最长 50 字符
  "expired_time": -1,               // 过期时间戳，-1 表示永不过期
  "remain_quota": 0,                // 令牌额度
  "unlimited_quota": false,         // 是否无限额度
  "model_limits_enabled": false,    // 是否启用模型限制
  "model_limits": "",               // 模型限制列表
  "group": ""                       // 分组
}
```

#### PUT /api/dealer/users/:id/tokens

更新子用户令牌。

#### DELETE /api/dealer/users/:id/tokens/:token_id

删除子用户令牌。

---

### 账单查询

> 需要启用 Doris（`common.DorisEnabled && setting.DorisLogEnabled`），否则返回 "账单功能未启用"。

#### GET /api/dealer/billing

查询子用户消费明细。

**Query 参数**：`p`, `page_size`, `model_name`, `token_name`, `start_time`, `end_time`

自动查询所有子用户的数据，并**脱敏**以下字段：`channel_id`、`channel_name`、`token_key`。

---

#### GET /api/dealer/billing/summary

查询子用户消费汇总。

**Query 参数**：`p`, `page_size`, `group_by` (day / token / model), 以及上述过滤参数。

---

## 安全隔离

### 所有权验证

所有涉及子用户的操作都通过 `validateDealerOwnership()` 强制验证：

```go
func validateDealerOwnership(c *gin.Context, targetUserId int) (*model.User, error) {
    dealerId := c.GetInt("id")
    user, err := model.GetUserById(targetUserId, false)
    if err != nil {
        return nil, fmt.Errorf("用户不存在")
    }
    if user.ParentId != dealerId {
        return nil, fmt.Errorf("无权操作此用户")
    }
    return user, nil
}
```

### 权限约束

- 代理商只能创建 `role=1`（普通用户）的子用户
- 代理商不能修改自己的 `ParentId`、`Role`
- 代理商不能访问 `/api/channel`、`/api/user` 等管理员路由
- 账单查询自动限定为该代理商的子用户范围，不能查看其他用户数据

---

## 用户注册流程

### 邀请链接注册

复用已有的 AffCode（邀请码）机制。当通过邀请链接注册时：

```go
// controller/user.go — Register 函数
if inviterId != 0 {
    inviter, err := model.GetUserById(inviterId, false)
    if err == nil && inviter != nil && inviter.Role == common.RoleDealerUser {
        cleanUser.ParentId = inviterId
    }
}
```

如果邀请人是代理商（role=5），新注册用户自动成为该代理商的子用户（`parent_id` = 代理商 ID）。

### 代理商手动创建

代理商通过 `POST /api/dealer/users` 直接创建子用户，可在创建时设定初始额度、定价倍率等。

---

## 管理员操作

管理员通过 `POST /api/user/manage` 管理代理商角色：

| Action | 说明 | 条件 |
|--------|------|------|
| `promote_dealer` | 普通用户 → 代理商 | 目标用户 role < 5 |
| `demote_dealer` | 代理商 → 普通用户 | 目标用户 role = 5 且无子用户 |

降级时如果代理商下还有子用户，会返回错误："该代理商下还有 N 个子用户，请先处理子用户后再降级"。

---

## 前端页面

### 代理商视角

代理商登录后，侧边栏显示「代理商」区块：

| 菜单项 | 路由 | 功能 |
|--------|------|------|
| 子用户管理 | `/console/dealer/users` | 创建/编辑/删除子用户、额度转移、令牌管理 |
| 代理商账单 | `/console/dealer/billing` | 查看子用户消费明细和汇总 |

### 管理员视角

- 用户列表中 role=5 显示绿色「代理商」标签
- ManageUser 操作支持 `promote_dealer` / `demote_dealer`

---

## 文件清单

### 后端

| 文件 | 变更 |
|------|------|
| `common/constants.go` | 新增 `RoleDealerUser = 5` |
| `constant/context_key.go` | 新增 `ContextKeyDealerRatio` |
| `model/user.go` | User 结构体 +3 字段，+7 函数 |
| `model/user_cache.go` | UserBase +`DealerRatio`，WriteContext 写入上下文 |
| `middleware/auth.go` | 新增 `DealerAuth()` |
| `controller/dealer.go` | **新建** — 全部代理商 API handler |
| `controller/user.go` | Register 自动归属 + ManageUser promote/demote |
| `router/api-router.go` | 注册 `/api/dealer/*` 路由组 |
| `relay/helper/price.go` | 注入 dealer_ratio 到两个计费函数 |
| `service/doris_billing_query.go` | BillingFilter 新增 `UserIds` 字段 |

### 前端

| 文件 | 变更 |
|------|------|
| `web/src/helpers/utils.jsx` | 新增 `isDealer()` |
| `web/src/helpers/auth.jsx` | 新增 `DealerRoute` |
| `web/src/helpers/render.jsx` | 新增 dealer 图标 |
| `web/src/App.jsx` | 新增 dealer 路由 |
| `web/src/components/layout/SiderBar.jsx` | 新增代理商菜单区块 |
| `web/src/pages/Dealer/Users/index.jsx` | **新建** — 用户管理页 |
| `web/src/pages/Dealer/Billing/index.jsx` | **新建** — 账单页 |
| `web/src/hooks/dealer/useDealerUsersData.jsx` | **新建** — 数据 hook |
| `web/src/components/table/dealer/*` | **新建** — 表格和弹窗组件 |
| `web/src/components/table/users/UsersColumnDefs.jsx` | role=5 标签 |
| `web/src/i18n/locales/zh-CN.json` | 新增翻译 key |
| `web/src/i18n/locales/en.json` | 新增翻译 key |
