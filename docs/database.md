# Database Documentation

## Overview

本项目使用三层数据存储架构：

| 存储层         | 技术                      | 用途                                   |
| -------------- | ------------------------- | -------------------------------------- |
| **主数据库**   | MySQL / PostgreSQL / SQLite (GORM v2) | 用户、令牌、渠道、订阅等业务数据   |
| **分析数据库** | Apache Doris (OLAP)       | 详细请求日志 + 账单记录（大数据量分析）|
| **缓存**       | Redis (可选)              | 用户配额、令牌验证、订阅计划等热数据   |

### 主数据库配置

主数据库使用 **GORM v2** ORM 框架，同时支持三种数据库：

| 数据库     | 最低版本 | 默认文件                              |
| ---------- | -------- | ------------------------------------- |
| SQLite     | 3.x      | `one-api.db?_busy_timeout=30000`（默认） |
| MySQL      | 5.7.8+   | 通过 `SQL_DSN` 环境变量配置           |
| PostgreSQL | 9.6+     | 通过 `SQL_DSN` 环境变量配置           |

日志可使用独立数据库，通过 `LOG_SQL_DSN` 环境变量配置。

### 连接池配置

| 环境变量             | 默认值 | 说明               |
| -------------------- | ------ | ------------------ |
| `SQL_DSN`            | -      | 主数据库连接字符串 |
| `LOG_SQL_DSN`        | -      | 日志数据库连接字符串 |
| `SQL_MAX_IDLE_CONNS` | 100    | 最大空闲连接数     |
| `SQL_MAX_OPEN_CONNS` | 1000   | 最大打开连接数     |
| `SQL_MAX_LIFETIME`   | 60s    | 连接最大存活时间   |

### 数据库类型判断

代码中通过以下全局变量判断当前数据库类型：

```go
common.UsingSQLite      // bool
common.UsingMySQL       // bool
common.UsingPostgreSQL  // bool
```

---

## ER 关系图

```
User (1) ──┬── (N) Token
           ├── (N) Log
           ├── (N) TopUp
           ├── (N) Redemption
           ├── (1) TwoFA ── (N) TwoFABackupCode
           ├── (1) PasskeyCredential
           ├── (N) Checkin（每天一条）
           ├── (N) UserOAuthBinding ──── (N:1) CustomOAuthProvider
           ├── (N) Task
           ├── (N) Midjourney
           └── (N) UserSubscription ──── (N:1) SubscriptionPlan
                                                    └── (N) SubscriptionOrder

Channel (1) ──┬── (N) Ability（group + model 映射）
              ├── (N) Log
              └── (N) Task

Model (N:1) ── Vendor

Option          （系统配置键值对，独立表）
QuotaData       （用量统计聚合表）
PrefillGroup    （预填充分组，独立表）
Setup           （系统初始化状态）
```

---

## 数据表详细定义

### 1. users — 用户表

用户管理核心表，支持多种 OAuth 登录方式和软删除。

| 字段               | 类型           | 约束                              | 说明                         |
| ------------------ | -------------- | --------------------------------- | ---------------------------- |
| id                 | int            | PK                                | 主键                         |
| username           | varchar(20)    | UNIQUE INDEX                      | 用户名                       |
| password           | varchar        | NOT NULL                          | 密码（哈希）                 |
| display_name       | varchar(20)    | INDEX                             | 显示名称                     |
| role               | int            |                                   | 角色：0=用户, 1=管理员, 2=root |
| status             | int            |                                   | 状态：启用/禁用              |
| email              | varchar(50)    | INDEX                             | 邮箱                         |
| github_id          | varchar        | INDEX                             | GitHub OAuth ID              |
| discord_id         | varchar        | INDEX                             | Discord OAuth ID             |
| oidc_id            | varchar        | INDEX                             | OIDC ID                      |
| wechat_id          | varchar        | INDEX                             | 微信 ID                      |
| telegram_id        | varchar        | INDEX                             | Telegram ID                  |
| linux_do_id        | varchar        | INDEX                             | LinuxDo ID                   |
| access_token       | char(32)       | UNIQUE INDEX, NULLABLE            | API 访问令牌                 |
| quota              | int            | DEFAULT 0                         | 当前配额                     |
| used_quota         | int            | DEFAULT 0                         | 已用配额                     |
| request_count      | int            | DEFAULT 0                         | 请求次数                     |
| group              | varchar(64)    | DEFAULT 'default'                 | 用户组                       |
| aff_code           | varchar(32)    | UNIQUE INDEX                      | 邀请码                       |
| aff_count          | int            | DEFAULT 0                         | 邀请人数                     |
| aff_quota          | int            | DEFAULT 0                         | 邀请奖励配额                 |
| aff_history_quota  | int            | DEFAULT 0                         | 历史邀请奖励                 |
| inviter_id         | int            | INDEX                             | 邀请人 ID                    |
| stripe_customer    | varchar(64)    | INDEX                             | Stripe 客户 ID               |
| setting            | text           |                                   | 用户设置（JSON）             |
| remark             | varchar(255)   |                                   | 备注                         |
| deleted_at         | timestamp      | INDEX（软删除）                   | 软删除标记                   |

---

### 2. tokens — 令牌表

API 令牌管理，支持模型限制、IP 限制和配额控制。

| 字段                 | 类型           | 约束                   | 说明                     |
| -------------------- | -------------- | ---------------------- | ------------------------ |
| id                   | int            | PK                     | 主键                     |
| user_id              | int            | INDEX                  | 所属用户                 |
| key                  | char(48)       | UNIQUE INDEX           | 令牌密钥                 |
| status               | int            | DEFAULT 1              | 状态                     |
| name                 | varchar        | INDEX                  | 令牌名称                 |
| created_time         | bigint         |                        | 创建时间                 |
| accessed_time        | bigint         |                        | 最后访问时间             |
| expired_time         | bigint         |                        | 过期时间（-1=永不过期）  |
| remain_quota         | int            | DEFAULT 0              | 剩余配额                 |
| unlimited_quota      | bool           |                        | 是否无限配额             |
| model_limits_enabled | bool           |                        | 是否启用模型限制         |
| model_limits         | text           |                        | 允许的模型列表           |
| allow_ips            | varchar        |                        | 允许的 IP（换行分隔）    |
| used_quota           | int            | DEFAULT 0              | 已用配额                 |
| group                | varchar        | DEFAULT ''             | 令牌组                   |
| cross_group_retry    | bool           |                        | 是否跨组重试             |
| deleted_at           | timestamp      | INDEX（软删除）        | 软删除标记               |

---

### 3. channels — 渠道表

AI 服务提供商渠道配置，支持多密钥轮询和参数覆盖。

| 字段                 | 类型           | 约束              | 说明                       |
| -------------------- | -------------- | ----------------- | -------------------------- |
| id                   | int            | PK                | 主键                       |
| type                 | int            |                   | 渠道类型（对应常量定义）   |
| key                  | varchar        | NOT NULL          | API 密钥                   |
| openai_organization  | varchar        | NULLABLE          | OpenAI 组织 ID             |
| test_model           | varchar        | NULLABLE          | 测试模型                   |
| status               | int            | DEFAULT 1         | 状态                       |
| name                 | varchar        | INDEX             | 渠道名称                   |
| weight               | uint           | DEFAULT 0         | 权重                       |
| created_time         | bigint         |                   | 创建时间                   |
| test_time            | bigint         |                   | 最后测试时间               |
| response_time        | int            |                   | 响应时间（毫秒）           |
| base_url             | varchar        | NULLABLE          | 自定义 Base URL            |
| other                | text           |                   | 其他配置（JSON）           |
| balance              | float64        |                   | 余额                       |
| balance_updated_time | bigint         |                   | 余额更新时间               |
| models               | text           |                   | 支持的模型（逗号分隔）     |
| group                | varchar(64)    | DEFAULT 'default' | 渠道组                     |
| used_quota           | bigint         | DEFAULT 0         | 已用配额                   |
| model_mapping        | text           | NULLABLE          | 模型映射（JSON）           |
| status_code_mapping  | varchar(1024)  | DEFAULT ''        | 状态码映射                 |
| priority             | bigint         | DEFAULT 0, INDEX  | 优先级                     |
| auto_ban             | int            | DEFAULT 1         | 是否自动封禁               |
| other_info           | text           |                   | 其他信息（JSON）           |
| tag                  | varchar        | INDEX             | 标签                       |
| setting              | text           |                   | 渠道设置（JSON）           |
| param_override       | text           |                   | 参数覆盖（JSON）           |
| header_override      | text           |                   | 请求头覆盖（JSON）         |
| remark               | varchar(255)   |                   | 备注                       |
| channel_info         | json           |                   | 多密钥模式信息             |
| settings             | varchar        |                   | 其他设置                   |

---

### 4. abilities — 能力路由表

渠道-模型-用户组的路由映射关系，决定请求如何分发到具体渠道。

| 字段       | 类型         | 约束                           | 说明             |
| ---------- | ------------ | ------------------------------ | ---------------- |
| group      | varchar(64)  | 联合主键                       | 用户组           |
| model      | varchar(255) | 联合主键                       | 模型名称         |
| channel_id | int          | 联合主键, INDEX                | 渠道 ID          |
| enabled    | bool         |                                | 是否启用         |
| priority   | bigint       | INDEX, DEFAULT 0               | 优先级           |
| weight     | uint         | INDEX, DEFAULT 0               | 权重             |
| tag        | varchar      | INDEX, NULLABLE                | 标签             |

**联合主键**: (group, model, channel_id)

---

### 5. logs — 日志表

系统操作日志和 API 消费日志，支持独立数据库存储。

| 字段              | 类型         | 约束                                         | 说明                             |
| ----------------- | ------------ | -------------------------------------------- | -------------------------------- |
| id                | int          | PK                                           | 主键                             |
| user_id           | int          | INDEX (idx_user_id_id)                       | 用户 ID                          |
| created_at        | bigint       | INDEX (idx_created_at_id, idx_created_at_type) | 创建时间                        |
| type              | int          | INDEX (idx_created_at_type)                  | 日志类型（0-6）                  |
| content           | text         |                                              | 日志内容                         |
| username          | varchar      | DEFAULT '', INDEX (index_username_model_name) | 用户名                          |
| token_name        | varchar      | DEFAULT '', INDEX                            | 令牌名称                         |
| model_name        | varchar      | DEFAULT '', INDEX (index_username_model_name) | 模型名称                        |
| quota             | int          | DEFAULT 0                                    | 消耗配额                         |
| prompt_tokens     | int          | DEFAULT 0                                    | 输入 token 数                    |
| completion_tokens | int          | DEFAULT 0                                    | 输出 token 数                    |
| use_time          | int          | DEFAULT 0                                    | 使用时间                         |
| is_stream         | bool         |                                              | 是否流式请求                     |
| channel_id        | int          | INDEX                                        | 渠道 ID                          |
| token_id          | int          | DEFAULT 0, INDEX                             | 令牌 ID                          |
| group             | varchar      | INDEX                                        | 用户组                           |
| ip                | varchar      | DEFAULT '', INDEX                            | 请求 IP                          |
| request_id        | varchar(64)  | INDEX                                        | 请求 ID                          |
| other             | text         |                                              | 其他信息（JSON）                 |

**日志类型**: 0=Unknown, 1=TopUp, 2=Consume, 3=Manage, 4=System, 5=Error, 6=Refund

**复合索引**:
- `idx_created_at_id` (created_at, id)
- `idx_user_id_id` (user_id, id)
- `idx_created_at_type` (created_at, type)
- `index_username_model_name` (username, model_name)

---

### 6. topups — 充值记录表

| 字段             | 类型         | 约束           | 说明                       |
| ---------------- | ------------ | -------------- | -------------------------- |
| id               | int          | PK             | 主键                       |
| user_id          | int          | INDEX          | 用户 ID                    |
| amount           | int64        |                | 充值配额数量               |
| money            | float64      |                | 充值金额                   |
| trade_no         | varchar(255) | UNIQUE, INDEX  | 交易流水号                 |
| payment_method   | varchar(50)  |                | 支付方式                   |
| create_time      | int64        |                | 创建时间                   |
| complete_time    | int64        |                | 完成时间                   |
| status           | varchar      |                | 状态：pending/success/failed |

---

### 7. redemptions — 兑换码表

| 字段          | 类型       | 约束              | 说明                         |
| ------------- | ---------- | ----------------- | ---------------------------- |
| id            | int        | PK                | 主键                         |
| user_id       | int        |                   | 创建者 ID                    |
| key           | char(32)   | UNIQUE INDEX      | 兑换码                       |
| status        | int        | DEFAULT 1         | 状态：1=启用, 2=已用, 3=禁用 |
| name          | varchar    | INDEX             | 名称                         |
| quota         | int        | DEFAULT 100       | 兑换配额                     |
| created_time  | bigint     |                   | 创建时间                     |
| redeemed_time | bigint     |                   | 兑换时间                     |
| used_user_id  | int        |                   | 兑换者 ID                    |
| expired_time  | bigint     |                   | 过期时间（0=永不过期）       |
| deleted_at    | timestamp  | INDEX（软删除）   | 软删除标记                   |

---

### 8. options — 系统配置表

系统全局配置键值对存储，包含 100+ 配置项。

| 字段  | 类型    | 约束 | 说明   |
| ----- | ------- | ---- | ------ |
| key   | varchar | PK   | 配置键 |
| value | text    |      | 配置值 |

**主要配置分类**:
- 认证设置（密码登录、OAuth、邮箱验证）
- 支付设置（Stripe、Creem、Waffo）
- 配额设置（新用户、邀请人、被邀请人配额）
- 比率设置（模型、分组、补全比率）
- 速率限制、敏感词过滤等

---

### 9. twofas — 两步验证表

| 字段            | 类型       | 约束              | 说明             |
| --------------- | ---------- | ----------------- | ---------------- |
| id              | int        | PK                | 主键             |
| user_id         | int        | UNIQUE INDEX      | 用户 ID          |
| secret          | varchar(255) |                 | TOTP 密钥        |
| is_enabled      | bool       |                   | 是否启用         |
| failed_attempts | int        | DEFAULT 0         | 失败尝试次数     |
| locked_until    | timestamp  | NULLABLE          | 锁定截止时间     |
| last_used_at    | timestamp  | NULLABLE          | 最后使用时间     |
| created_at      | timestamp  |                   | 创建时间         |
| updated_at      | timestamp  |                   | 更新时间         |
| deleted_at      | timestamp  | INDEX（软删除）   | 软删除标记       |

---

### 10. two_fa_backup_codes — 两步验证备用码表

| 字段       | 类型         | 约束            | 说明         |
| ---------- | ------------ | --------------- | ------------ |
| id         | int          | PK              | 主键         |
| user_id    | int          | INDEX           | 用户 ID      |
| code_hash  | varchar(255) |                 | 备用码哈希   |
| is_used    | bool         |                 | 是否已使用   |
| used_at    | timestamp    | NULLABLE        | 使用时间     |
| created_at | timestamp    |                 | 创建时间     |
| deleted_at | timestamp    | INDEX（软删除） | 软删除标记   |

---

### 11. passkey_credentials — Passkey 凭证表

WebAuthn/Passkey 登录凭证存储。

| 字段             | 类型         | 约束              | 说明             |
| ---------------- | ------------ | ----------------- | ---------------- |
| id               | int          | PK                | 主键             |
| user_id          | int          | UNIQUE INDEX      | 用户 ID          |
| credential_id    | varchar(512) | UNIQUE INDEX      | 凭证 ID（Base64）|
| public_key       | text         |                   | 公钥（Base64）   |
| attestation_type | varchar(255) |                   | 认证类型         |
| aaguid           | varchar(512) |                   | AAGUID（Base64） |
| sign_count       | uint32       | DEFAULT 0         | 签名计数         |
| clone_warning    | bool         |                   | 克隆警告         |
| user_present     | bool         |                   | 用户在场         |
| user_verified    | bool         |                   | 用户已验证       |
| backup_eligible  | bool         |                   | 可备份           |
| backup_state     | bool         |                   | 备份状态         |
| transports       | text         |                   | 传输方式（JSON） |
| attachment       | varchar(32)  |                   | 附件类型         |
| last_used_at     | timestamp    | NULLABLE          | 最后使用时间     |
| created_at       | timestamp    |                   | 创建时间         |
| updated_at       | timestamp    |                   | 更新时间         |
| deleted_at       | timestamp    | INDEX（软删除）   | 软删除标记       |

---

### 12. checkins — 签到表

| 字段          | 类型        | 约束                                | 说明           |
| ------------- | ----------- | ----------------------------------- | -------------- |
| id            | int         | PK                                  | 主键           |
| user_id       | int         | UNIQUE 联合 (user_id, checkin_date) | 用户 ID        |
| checkin_date  | varchar(10) | UNIQUE 联合 (user_id, checkin_date) | 签到日期 YYYY-MM-DD |
| quota_awarded | int         |                                     | 奖励配额       |
| created_at    | bigint      |                                     | 创建时间       |

---

### 13. custom_oauth_providers — 自定义 OAuth 提供商表

| 字段                   | 类型         | 约束         | 说明                           |
| ---------------------- | ------------ | ------------ | ------------------------------ |
| id                     | int          | PK           | 主键                           |
| name                   | varchar(64)  |              | 显示名称                       |
| slug                   | varchar(64)  | UNIQUE INDEX | URL 标识符                     |
| icon                   | varchar(128) |              | 图标名称                       |
| enabled                | bool         | DEFAULT false | 是否启用                      |
| client_id              | varchar(256) |              | OAuth Client ID                |
| client_secret          | varchar(512) |              | OAuth Client Secret            |
| authorization_endpoint | varchar(512) |              | 授权端点                       |
| token_endpoint         | varchar(512) |              | Token 端点                     |
| user_info_endpoint     | varchar(512) |              | 用户信息端点                   |
| scopes                 | varchar(256) | DEFAULT 'openid profile email' | OAuth Scopes     |
| user_id_field          | varchar(128) | DEFAULT 'sub' | 用户 ID 字段（JSONPath）      |
| username_field         | varchar(128) | DEFAULT 'preferred_username' | 用户名字段     |
| display_name_field     | varchar(128) | DEFAULT 'name' | 显示名称字段                 |
| email_field            | varchar(128) | DEFAULT 'email' | 邮箱字段                    |
| well_known             | varchar(512) |              | OIDC 发现端点（可选）          |
| auth_style             | int          |              | 认证方式：0=自动, 1=参数, 2=Basic |
| access_policy          | text         |              | 访问策略（JSON）               |
| access_denied_message  | varchar(512) |              | 拒绝访问消息模板              |
| created_at             | timestamp    |              | 创建时间                       |
| updated_at             | timestamp    |              | 更新时间                       |

---

### 14. user_oauth_bindings — 用户 OAuth 绑定表

| 字段             | 类型         | 约束                                     | 说明           |
| ---------------- | ------------ | ---------------------------------------- | -------------- |
| id               | int          | PK                                       | 主键           |
| user_id          | int          | UNIQUE 联合 (user_id, provider_id)       | 用户 ID        |
| provider_id      | int          | UNIQUE 联合 (user_id, provider_id)       | 提供商 ID      |
| provider_user_id | varchar(256) | UNIQUE 联合 (provider_id, provider_user_id) | 提供商用户 ID |
| created_at       | timestamp    |                                          | 创建时间       |

---

### 15. tasks — 异步任务表

用于跟踪异步 AI 任务（如图像生成、视频生成等）。

| 字段         | 类型         | 约束          | 说明                     |
| ------------ | ------------ | ------------- | ------------------------ |
| id           | int64        | PK            | 主键                     |
| created_at   | int64        | INDEX         | 创建时间                 |
| updated_at   | int64        |               | 更新时间                 |
| task_id      | varchar(191) | INDEX         | 第三方任务 ID            |
| platform     | varchar(30)  | INDEX         | 平台标识                 |
| user_id      | int          | INDEX         | 用户 ID                  |
| group        | varchar(50)  |               | 用户组                   |
| channel_id   | int          | INDEX         | 渠道 ID                  |
| quota        | int          |               | 消耗配额                 |
| action       | varchar(40)  | INDEX         | 任务动作类型             |
| status       | varchar(20)  | INDEX         | 任务状态                 |
| fail_reason  | text         |               | 失败原因                 |
| submit_time  | int64        | INDEX         | 提交时间                 |
| start_time   | int64        | INDEX         | 开始时间                 |
| finish_time  | int64        | INDEX         | 完成时间                 |
| progress     | varchar(20)  | INDEX         | 进度                     |
| properties   | json         |               | 输入属性（JSON）         |
| private_data | json         |               | 内部数据（不对外暴露）   |
| data         | json         |               | 公开响应数据（JSON）     |

---

### 16. midjourneys — Midjourney 任务表

| 字段        | 类型        | 约束  | 说明             |
| ----------- | ----------- | ----- | ---------------- |
| id          | int         | PK    | 主键             |
| user_id     | int         | INDEX | 用户 ID          |
| action      | varchar(40) | INDEX | 动作类型         |
| mj_id       | varchar     | INDEX | Midjourney 任务 ID |
| status      | varchar(20) | INDEX | 状态             |
| progress    | varchar(30) | INDEX | 进度             |
| prompt      | text        |       | 提示词           |
| code        | int         |       | 状态码           |
| state       | varchar     |       | 状态信息         |
| submit_time | bigint      |       | 提交时间         |
| start_time  | bigint      |       | 开始时间         |
| finish_time | bigint      |       | 完成时间         |

---

### 17. models — 模型元数据表

| 字段           | 类型         | 约束                                          | 说明               |
| -------------- | ------------ | --------------------------------------------- | ------------------ |
| id             | int          | PK                                            | 主键               |
| model_name     | varchar(128) | UNIQUE 联合 (model_name, deleted_at)          | 模型名称           |
| description    | text         |                                               | 模型描述           |
| icon           | varchar(128) |                                               | 图标               |
| tags           | varchar(255) |                                               | 标签               |
| vendor_id      | int          | INDEX                                         | 供应商 ID          |
| endpoints      | text         |                                               | 支持的端点         |
| status         | int          | DEFAULT 1                                     | 状态               |
| sync_official  | int          | DEFAULT 1                                     | 是否同步官方数据   |
| created_time   | bigint       |                                               | 创建时间           |
| updated_time   | bigint       |                                               | 更新时间           |
| name_rule      | int          | DEFAULT 0                                     | 命名规则           |
| deleted_at     | timestamp    | UNIQUE 联合 (model_name, deleted_at)（软删除） | 软删除标记         |

---

### 18. vendors — 供应商表

| 字段         | 类型           | 约束                                    | 说明         |
| ------------ | -------------- | --------------------------------------- | ------------ |
| id           | int            | PK                                      | 主键         |
| name         | varchar(128)   | NOT NULL, UNIQUE 联合 (name, deleted_at) | 供应商名称   |
| description  | text           |                                         | 描述         |
| icon         | varchar(128)   |                                         | 图标         |
| status       | int            | DEFAULT 1                               | 状态         |
| created_time | bigint         |                                         | 创建时间     |
| updated_time | bigint         |                                         | 更新时间     |
| deleted_at   | timestamp      | UNIQUE 联合 (name, deleted_at)（软删除） | 软删除标记   |

---

### 19. quota_data — 用量统计表

| 字段       | 类型        | 约束                                      | 说明       |
| ---------- | ----------- | ----------------------------------------- | ---------- |
| id         | int         | PK                                        | 主键       |
| user_id    | int         | INDEX                                     | 用户 ID    |
| username   | varchar(64) | DEFAULT '', INDEX (idx_qdt_model_user_name) | 用户名   |
| model_name | varchar(64) | DEFAULT '', INDEX (idx_qdt_model_user_name) | 模型名称 |
| created_at | bigint      | INDEX (idx_qdt_created_at)                | 创建时间   |
| token_used | int         | DEFAULT 0                                 | 使用 token 数 |
| count      | int         | DEFAULT 0                                 | 请求次数   |
| quota      | int         | DEFAULT 0                                 | 消耗配额   |

---

### 20. subscription_plans — 订阅计划表

| 字段                       | 类型           | 约束                | 说明                         |
| -------------------------- | -------------- | ------------------- | ---------------------------- |
| id                         | int            | PK                  | 主键                         |
| title                      | varchar(128)   | NOT NULL            | 计划标题                     |
| subtitle                   | varchar(255)   | DEFAULT ''          | 副标题                       |
| price_amount               | decimal(10,6)  | NOT NULL, DEFAULT 0 | 价格                         |
| currency                   | varchar(8)     | NOT NULL, DEFAULT 'USD' | 货币                      |
| duration_unit              | varchar(16)    | NOT NULL, DEFAULT 'month' | 周期单位               |
| duration_value             | int            | NOT NULL, DEFAULT 1 | 周期数值                     |
| custom_seconds             | bigint         | NOT NULL, DEFAULT 0 | 自定义周期（秒）             |
| enabled                    | bool           | DEFAULT true        | 是否启用                     |
| sort_order                 | int            | DEFAULT 0           | 排序                         |
| stripe_price_id            | varchar(128)   | DEFAULT ''          | Stripe Price ID              |
| creem_product_id           | varchar(128)   | DEFAULT ''          | Creem Product ID             |
| max_purchase_per_user      | int            | DEFAULT 0           | 每用户最大购买数（0=不限）   |
| upgrade_group              | varchar(64)    | DEFAULT ''          | 订阅后升级到的用户组         |
| total_amount               | bigint         | NOT NULL, DEFAULT 0 | 总配额                       |
| quota_reset_period         | varchar(16)    | DEFAULT 'never'     | 配额重置周期                 |
| quota_reset_custom_seconds | bigint         | DEFAULT 0           | 自定义重置周期（秒）         |
| created_at                 | bigint         |                     | 创建时间                     |
| updated_at                 | bigint         |                     | 更新时间                     |

---

### 21. subscription_orders — 订阅订单表

| 字段             | 类型         | 约束          | 说明           |
| ---------------- | ------------ | ------------- | -------------- |
| id               | int          | PK            | 主键           |
| user_id          | int          | INDEX         | 用户 ID        |
| plan_id          | int          | INDEX         | 计划 ID        |
| money            | float64      |               | 订单金额       |
| trade_no         | varchar(255) | UNIQUE, INDEX | 交易流水号     |
| payment_method   | varchar(50)  |               | 支付方式       |
| status           | varchar      |               | 订单状态       |
| create_time      | int64        |               | 创建时间       |
| complete_time    | int64        |               | 完成时间       |
| provider_payload | text         |               | 支付商回调数据 |

---

### 22. user_subscriptions — 用户订阅表

| 字段            | 类型        | 约束                                                       | 说明                   |
| --------------- | ----------- | ---------------------------------------------------------- | ---------------------- |
| id              | int         | PK                                                         | 主键                   |
| user_id         | int         | INDEX, INDEX (idx_user_sub_active, priority:1)             | 用户 ID                |
| plan_id         | int         | INDEX                                                      | 计划 ID                |
| amount_total    | bigint      | NOT NULL, DEFAULT 0                                        | 总配额                 |
| amount_used     | bigint      | NOT NULL, DEFAULT 0                                        | 已用配额               |
| start_time      | bigint      |                                                            | 开始时间               |
| end_time        | bigint      | INDEX, INDEX (idx_user_sub_active, priority:3)             | 结束时间               |
| status          | varchar(32) | INDEX, INDEX (idx_user_sub_active, priority:2)             | 状态                   |
| source          | varchar(32) | DEFAULT 'order'                                            | 来源                   |
| last_reset_time | bigint      | DEFAULT 0                                                  | 上次重置时间           |
| next_reset_time | bigint      | DEFAULT 0, INDEX                                           | 下次重置时间           |
| upgrade_group   | varchar(64) | DEFAULT ''                                                 | 升级用户组             |
| prev_user_group | varchar(64) | DEFAULT ''                                                 | 原用户组               |
| created_at      | bigint      |                                                            | 创建时间               |
| updated_at      | bigint      |                                                            | 更新时间               |

**复合索引**: `idx_user_sub_active` (user_id, status, end_time)

---

### 23. subscription_pre_consume_records — 订阅预消费记录表

| 字段                 | 类型        | 约束         | 说明           |
| -------------------- | ----------- | ------------ | -------------- |
| id                   | int         | PK           | 主键           |
| request_id           | varchar(64) | UNIQUE INDEX | 请求 ID        |
| user_id              | int         | INDEX        | 用户 ID        |
| user_subscription_id | int         | INDEX        | 用户订阅 ID    |
| pre_consumed         | bigint      | NOT NULL, DEFAULT 0 | 预消费配额 |
| status               | varchar(32) | INDEX        | 状态           |
| created_at           | bigint      |              | 创建时间       |
| updated_at           | bigint      | INDEX        | 更新时间       |

---

### 24. prefill_groups — 预填充分组表

| 字段       | 类型        | 约束                                          | 说明             |
| ---------- | ----------- | --------------------------------------------- | ---------------- |
| id         | int         | PK                                            | 主键             |
| name       | varchar(64) | UNIQUE（deleted_at 为空时）                   | 分组名称         |
| type       | varchar(32) | INDEX                                         | 分组类型         |
| items      | json        |                                               | 项目列表（JSON） |
| deleted_at | timestamp   | 软删除                                        | 软删除标记       |

---

### 25. setups — 系统初始化表

| 字段           | 类型        | 约束 | 说明         |
| -------------- | ----------- | ---- | ------------ |
| id             | uint        | PK   | 主键         |
| version        | varchar(50) |      | 系统版本     |
| initialized_at | bigint      |      | 初始化时间   |

---

## Doris 分析数据库（OLAP）

项目使用 **Apache Doris** 作为独立的分析数据库，存储详细请求日志和账单记录，与主数据库完全解耦。

- **写入方式**：异步批量 Stream Load（HTTP PUT），内存 buffer + 定时/阈值触发 flush
- **查询方式**：MySQL 协议（端口 9030），`database/sql` 驱动直连
- **开关控制**：需同时满足 `DORIS_HOST` 已配置 + `DorisLogEnabled` 选项为 true
- **建表脚本**：`scripts/doris-setup.sh`

### Doris 环境变量

| 变量名                  | 默认值        | 说明                                       |
| ----------------------- | ------------- | ------------------------------------------ |
| `DORIS_HOST`            | (空，不启用)  | Doris FE 地址（Docker 内应填服务名如 doris）|
| `DORIS_PORT`            | `8030`        | Doris FE HTTP 端口（Stream Load 写入）     |
| `DORIS_QUERY_PORT`      | `9030`        | Doris MySQL 协议端口（查询用）             |
| `DORIS_USER`            | `root`        | Doris 用户名                               |
| `DORIS_PASSWORD`        | (空)          | Doris 密码                                 |
| `DORIS_DATABASE`        | `new_api`     | Doris 数据库名                             |
| `DORIS_TABLE`           | `request_logs`| Doris 请求日志表名                         |
| `DORIS_FLUSH_INTERVAL`  | `5`           | 批量刷写间隔（秒）                         |
| `DORIS_FLUSH_BATCH_SIZE`| `100`         | 触发即时刷写的缓冲区行数阈值               |

### D1. request_logs — 请求日志表

存储每一次 API 请求的完整详情（含请求体和响应内容），用于审计、调试和分析。

| 字段              | 类型           | 说明                                         |
| ----------------- | -------------- | -------------------------------------------- |
| created_at        | DATETIME       | 请求时间 (UTC)                               |
| request_id        | VARCHAR(128)   | 请求 ID                                     |
| user_id           | INT            | 用户 ID                                     |
| token_id          | INT            | 令牌 ID                                     |
| token_name        | VARCHAR(256)   | 令牌名称                                     |
| token_key         | VARCHAR(512)   | 完整 API 密钥（敏感，仅管理员可见）          |
| user_group        | VARCHAR(128)   | 用户所在分组                                 |
| token_group       | VARCHAR(128)   | 令牌分组                                     |
| using_group       | VARCHAR(128)   | 实际使用的分组                               |
| model_name        | VARCHAR(256)   | 请求模型名称                                 |
| upstream_model    | VARCHAR(256)   | 上游实际模型名称                             |
| channel_id        | INT            | 渠道 ID                                     |
| channel_type      | INT            | 渠道类型                                     |
| channel_name      | VARCHAR(256)   | 渠道名称                                     |
| is_stream         | TINYINT        | 是否流式 (0/1)                               |
| relay_mode        | INT            | 中继模式                                     |
| request_path      | VARCHAR(512)   | 请求路径                                     |
| client_ip         | VARCHAR(64)    | 客户端 IP                                   |
| request_body      | STRING         | 请求体 JSON（无长度限制）                    |
| response_content  | STRING         | 模型输出文本（无长度限制）                   |
| prompt_tokens     | INT            | 输入 Token 数                                |
| completion_tokens | INT            | 输出 Token 数                                |
| total_tokens      | INT            | 总 Token 数                                  |
| cache_tokens      | INT            | 缓存 Token 数                                |
| quota             | INT            | 消耗额度                                     |
| model_ratio       | DOUBLE         | 模型倍率                                     |
| group_ratio       | DOUBLE         | 分组倍率                                     |
| completion_ratio  | DOUBLE         | 补全倍率                                     |
| model_price       | DOUBLE         | 模型价格                                     |
| use_time_ms       | BIGINT         | 请求耗时（毫秒）                             |
| is_success        | TINYINT        | 是否成功 (0/1)                               |
| retry_count       | INT            | 重试次数                                     |
| status_code       | INT            | HTTP 状态码                                  |
| error_type        | VARCHAR(128)   | 错误类型                                     |
| error_message     | VARCHAR(1024)  | 错误消息                                     |

**表引擎**: OLAP DUPLICATE KEY(created_at, request_id)
**分区**: 按天动态分区，保留 30 天（`dynamic_partition.start = -30`）
**分桶**: HASH(request_id) BUCKETS AUTO

**相关代码**:
- 写入: `service/doris_logger.go`（buffer + Stream Load）
- 查询: `service/doris_query.go`（MySQL 协议）
- 触发: `service/doris_hook.go` → `EmitDorisLog` / `EmitDorisLogWithSummary` / `EmitDorisErrorLog`
- API: `GET /api/log/doris`（管理员）、`GET /api/log/doris/self`（用户，脱敏 token_key）

---

### D2. billing_records — 账单记录表

轻量级账单表，不含请求体/响应内容，保留周期更长（90 天），用于账单查询和多维度汇总。

| 字段              | 类型           | 说明                           |
| ----------------- | -------------- | ------------------------------ |
| created_at        | DATETIME       | 计费时间 (UTC)                 |
| request_id        | VARCHAR(128)   | 请求 ID                       |
| user_id           | INT            | 用户 ID                       |
| token_id          | INT            | 令牌 ID                       |
| token_name        | VARCHAR(256)   | 令牌名称                       |
| token_key         | VARCHAR(512)   | API 密钥                      |
| user_group        | VARCHAR(128)   | 用户分组                       |
| using_group       | VARCHAR(128)   | 实际使用分组                   |
| model_name        | VARCHAR(256)   | 请求模型                       |
| channel_id        | INT            | 渠道 ID                       |
| channel_name      | VARCHAR(256)   | 渠道名称                       |
| prompt_tokens     | INT            | 输入 Token                    |
| completion_tokens | INT            | 输出 Token                    |
| total_tokens      | INT            | 总 Token                      |
| cache_tokens      | INT            | 缓存 Token                    |
| quota             | INT            | 消耗额度                       |
| model_ratio       | DOUBLE         | 模型倍率                       |
| group_ratio       | DOUBLE         | 分组倍率                       |
| model_price       | DOUBLE         | 模型价格                       |
| is_success        | TINYINT        | 是否成功 (0/1)                 |
| use_time_ms       | BIGINT         | 耗时（毫秒）                   |

**表引擎**: OLAP DUPLICATE KEY(created_at, request_id)
**分区**: 按天动态分区，保留 90 天（`dynamic_partition.start = -90`）
**分桶**: HASH(request_id) BUCKETS AUTO

**与 request_logs 的区别**:
- 无 `request_body`、`response_content` 等大字段，存储更轻量
- 保留 90 天 vs request_logs 的 30 天
- 独立的 buffer/flush 循环，互不影响

**相关代码**:
- 写入: `service/doris_billing_logger.go`（独立 buffer + Stream Load）
- 查询: `service/doris_billing_query.go`（明细 + 按天/Token/模型汇总）
- 触发: 
  - 文本请求: `service/text_quota.go` → `emitDorisTextLog` 末尾调用 `RecordBillingLog`
  - 音频请求: `service/doris_hook.go` → `EmitDorisLog` → `EmitBillingRecord`
  - WSS 请求: `service/doris_hook.go` → `EmitDorisLogWithSummary` → `EmitBillingRecordWithSummary`
- API:
  - `GET /api/billing/`（管理员，全量明细）
  - `GET /api/billing/self`（用户，自己的明细，脱敏 channel/token_key）
  - `GET /api/billing/summary?group_by=day|token|model`（管理员汇总）
  - `GET /api/billing/self/summary?group_by=day|token|model`（用户汇总）

**常用汇总查询示例**:

```sql
-- 按天汇总消耗额度
SELECT DATE(created_at) AS dt, COUNT(*) AS requests,
       SUM(quota) AS total_quota, SUM(total_tokens) AS total_tokens
FROM billing_records
WHERE created_at >= CURDATE() - INTERVAL 7 DAY
GROUP BY dt ORDER BY dt DESC;

-- 按模型汇总
SELECT model_name, COUNT(*) AS requests,
       SUM(quota) AS total_quota, SUM(total_tokens) AS total_tokens
FROM billing_records
WHERE created_at >= CURDATE() - INTERVAL 30 DAY
GROUP BY model_name ORDER BY total_quota DESC;

-- 按令牌汇总
SELECT token_id, token_name, COUNT(*) AS requests,
       SUM(quota) AS total_quota
FROM billing_records
WHERE user_id = 1 AND created_at >= CURDATE() - INTERVAL 30 DAY
GROUP BY token_id, token_name ORDER BY total_quota DESC;
```

---

### Doris 架构说明

```
API 请求 → 计费结算完成
    │
    ├── RecordDorisLog(dorisLog)       → dorisBuffer   → dorisFlushLoop   → Stream Load → request_logs
    │
    └── RecordBillingLog(billingRecord) → billingBuffer → billingFlushLoop → Stream Load → billing_records
```

- 两个表使用**独立的 buffer 和 flush 循环**，共享 `dorisHttpClient`（在 `InitDorisLogger` 中创建）
- Stream Load 使用 HTTP PUT 到 FE 的 8030 端口，FE 会 307 重定向到 BE
- Docker 环境下的重定向地址修正逻辑见 `dorisRedirectPolicy`
- 写入失败时自动将 batch 重新放回 buffer 头部，下次 flush 重试

---

## Redis 缓存

可选的 Redis 缓存层，用于减少主数据库压力。未配置 `REDIS_CONN_STRING` 时自动禁用。

### Redis 环境变量

| 变量名              | 默认值 | 说明                                      |
| ------------------- | ------ | ----------------------------------------- |
| `REDIS_CONN_STRING` | (空)   | Redis 连接 URL，格式 `redis://[:pwd]@host:port/db` |
| `REDIS_POOL_SIZE`   | `10`   | 连接池大小                                |
| `SYNC_FREQUENCY`    | `60`   | 缓存同步间隔（秒）                        |

### 缓存 Key 模式

| Key 模式                                        | 说明               |
| ------------------------------------------------ | ------------------ |
| `user:quota:{user_id}`                           | 用户配额余额       |
| `user:group:{user_id}`                           | 用户分组           |
| `user:setting:{user_id}`                         | 用户设置           |
| `user:status:{user_id}`                          | 用户状态           |
| `token:{key}`                                    | 令牌完整对象       |
| `new-api:subscription_plan:v1:{plan_id}`         | 订阅计划缓存       |
| `new-api:subscription_plan_info:v1:{plan_id}`    | 订阅计划信息       |

---

## 软删除

以下表使用 GORM 软删除机制（`deleted_at` 字段）：

- `users`
- `tokens`
- `redemptions`
- `twofas`
- `two_fa_backup_codes`
- `passkey_credentials`
- `models`
- `vendors`
- `prefill_groups`

查询时自动过滤已删除记录，需要 `db.Unscoped()` 才能访问。

---

## 迁移机制

### 自动迁移

使用 GORM 的 `AutoMigrate` 自动创建/更新表结构，在 `model/main.go` 中的 `migrateDBFast()` 通过 goroutine 并行执行迁移。

### 特殊迁移

| 迁移函数                                 | 说明                                     |
| ---------------------------------------- | ---------------------------------------- |
| `ensureSubscriptionPlanTableSQLite()`    | SQLite 手动建表（decimal 类型兼容）      |
| `migrateTokenModelLimitsToText()`        | Token 表 model_limits 从 varchar 迁移到 text |
| `migrateSubscriptionPlanPriceAmount()`   | 价格字段从 float 迁移到 decimal(10,6)   |
| `checkMySQLChineseSupport()`             | 检查 MySQL 中文字符集支持               |

---

## 缓存策略

| 数据          | 缓存类型        | 说明                             |
| ------------- | --------------- | -------------------------------- |
| 用户配额      | Redis           | 带回写 DB 的热缓存              |
| Token 信息    | Redis           | 令牌验证缓存                    |
| 渠道数据      | 内存            | 启动时加载，变更时刷新           |
| 订阅计划      | Redis + 内存    | 混合缓存，可配置 TTL            |
| Ability 路由  | 内存            | 启动时加载                       |
| 系统配置      | 内存            | 定期从 DB 同步                   |

---

## 事务与并发控制

- **行级锁**: 关键操作使用 `FOR UPDATE`（兑换码兑换、充值处理）
- **批量更新**: 可选的配额批量更新系统，减少 DB 写入频率
- **分块处理**: 大数据集操作使用分块（chunk size: 50-200）

---

## 跨数据库兼容注意事项

| 场景         | MySQL / SQLite       | PostgreSQL         | 代码中的变量              |
| ------------ | -------------------- | ------------------ | ------------------------- |
| 列名引用     | `` `column` ``       | `"column"`         | `commonGroupCol`, `commonKeyCol` |
| 布尔值       | `1` / `0`            | `true` / `false`   | `commonTrueVal`, `commonFalseVal` |
| 字符串拼接   | `CONCAT()`           | `\|\|`             | 按数据库类型分支           |
| JSON 存储    | `TEXT`               | `TEXT`（非 JSONB） | 统一使用 TEXT             |
| ALTER COLUMN | 支持                 | 支持               | SQLite 不支持，需用 ADD COLUMN |
