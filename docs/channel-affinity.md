# 渠道亲和度（Channel Affinity）

## 概述

渠道亲和度功能可以让同一个用户/会话的请求始终路由到同一个上游渠道，从而提高上游 **Prompt Cache** 命中率，显著降低 Token 费用。

当平台配置了多个相同模型的渠道时，默认会随机选择渠道转发请求。但 AI 服务商（如 Claude、OpenAI）的 Prompt Cache 是按 API Key 隔离的——如果连续对话被分配到不同渠道（对应不同 Key），上游缓存无法命中，每次都需要重新计算完整 Prompt，费用更高。

渠道亲和度通过从请求中提取一个"亲和值"（如会话 ID、用户 ID），将其与选中的渠道绑定并缓存。后续相同亲和值的请求会优先路由到同一渠道，使上游 Prompt Cache 持续命中。

---

## 工作流程

```
请求到达
  │
  ▼
① 按规则匹配（model_regex + path_regex + user_agent_include）
  │
  ▼
② 匹配成功 → 从请求体或上下文中提取亲和值
  │
  ▼
③ 查找缓存（Redis + 内存 LRU 混合缓存）
  │
  ├── 命中 → 使用绑定的渠道，上游 Prompt Cache 命中率大幅提升
  │
  └── 未命中 → 随机选择渠道
                │
                ▼
              ④ 请求成功后，将渠道 ID 写入缓存，建立亲和关系
```

---

## 配置入口

管理员进入 **设置 → 运营设置** 页面底部，即可看到"渠道亲和性"配置区域。

> **注意**：渠道亲和度组件需要在 `OperationSetting.jsx` 中引入 `SettingsChannelAffinity`。如果页面中没有显示，请确认该组件已正确导入和渲染。

---

## 全局参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| **启用** | 开启 | 总开关，关闭后所有亲和度规则不生效 |
| **仅成功时记录** | 开启 | 仅在请求成功时才缓存渠道绑定，避免绑定到故障渠道 |
| **缓存容量** | 100,000 | 内存 LRU 缓存最大条目数，超出后自动淘汰最久未使用的 |
| **默认 TTL** | 3600 秒 | 缓存过期时间，过期后重新选择渠道。各规则可单独覆盖 |

---

## 规则配置

系统按规则列表**顺序匹配**，第一条匹配的规则生效。每条规则包含以下字段：

### 匹配条件

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 规则名称，用于日志标识和缓存 key |
| `model_regex` | 是 | 模型名正则匹配列表，如 `["^gpt-.*$"]`、`["^claude-.*$"]` |
| `path_regex` | 否 | 请求路径正则匹配，如 `["/v1/chat/completions"]`。为空则匹配所有路径 |
| `user_agent_include` | 否 | User-Agent 子串匹配（不区分大小写），如 `["curl", "PostmanRuntime"]` |

### 亲和值提取

| 字段 | 说明 |
|------|------|
| `key_sources` | 亲和值来源列表，按优先级依次尝试，取第一个非空值（见下方详解） |
| `value_regex` | 亲和值格式校验正则（可选），不匹配则跳过本规则 |

### 缓存与行为

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `ttl_seconds` | 0（使用全局默认） | 本规则的缓存过期时间 |
| `skip_retry_on_failure` | false | 亲和渠道失败时不切换其他渠道重试，直接返回错误 |
| `include_using_group` | false | 缓存 key 中包含用户分组，不同分组独立亲和 |
| `include_rule_name` | false | 缓存 key 中包含规则名，方便按规则清缓存 |
| `param_override_template` | 无 | 亲和命中时自动合并的参数覆盖模板（如透传请求头） |

---

## 亲和值来源类型（key_sources）

`key_sources` 是一个数组，系统按顺序尝试每个来源，取第一个非空值作为亲和值。

### context_int — 从请求上下文取整数值

```json
{ "type": "context_int", "key": "id" }
```

适用于**用户级亲和**。可用的 context key：

| key | 说明 |
|-----|------|
| `id` | 用户 ID（最常用） |
| `token_id` | 令牌 ID |
| `specific_channel_id` | 指定渠道 ID |

### context_string — 从请求上下文取字符串值

```json
{ "type": "context_string", "key": "token_key" }
```

适用于**令牌级亲和**。可用的 context key：

| key | 说明 |
|-----|------|
| `token_key` | 令牌 Key |
| `token_group` | 令牌分组 |
| `group` | 使用分组（using_group） |
| `username` | 用户名 |
| `user_group` | 用户分组 |
| `user_email` | 用户邮箱 |

### gjson — 从请求体 JSON 中按路径提取

```json
{ "type": "gjson", "path": "metadata.user_id" }
```

适用于**会话级亲和**。使用 [GJSON 语法](https://github.com/tidwall/gjson) 从请求体中提取值。常见路径：

| path | 说明 | 典型场景 |
|------|------|---------|
| `metadata.user_id` | Claude SDK 写入的用户标识 | Claude Code 会话亲和 |
| `prompt_cache_key` | Codex SDK 写入的缓存 key | Codex CLI 会话亲和 |
| `user` | OpenAI API 的 user 字段 | 通用用户标识 |

### 粒度对比

| 来源 | 粒度 | 说明 |
|------|------|------|
| `context_int` + `id` | 用户级 | 同一用户所有请求固定渠道 |
| `context_string` + `token_key` | 令牌级 | 同一令牌所有请求固定渠道 |
| `gjson` + `metadata.user_id` | CLI 实例级 | 同一 Claude Code 实例固定渠道 |
| `gjson` + `prompt_cache_key` | 会话级 | 同一 Codex 会话固定渠道 |

> **提示**：粒度越细，缓存命中率越高但缓存条目也越多。建议 CLI 场景用会话级，通用场景用用户级。

---

## 内置默认规则

系统预置了两条规则，覆盖最常见的 CLI 编程工具场景：

### Codex CLI Trace

```json
{
  "name": "codex cli trace",
  "model_regex": ["^gpt-.*$"],
  "path_regex": ["/v1/responses"],
  "key_sources": [
    { "type": "gjson", "path": "prompt_cache_key" }
  ],
  "skip_retry_on_failure": true,
  "include_using_group": true,
  "include_rule_name": true,
  "param_override_template": {
    "operations": [
      {
        "mode": "pass_headers",
        "value": ["Originator", "Session_id", "User-Agent", "X-Codex-Beta-Features", "X-Codex-Turn-Metadata"],
        "keep_origin": true
      }
    ]
  }
}
```

- **匹配**：所有 `gpt-*` 模型 + `/v1/responses` 路径
- **亲和值**：请求体中的 `prompt_cache_key`（Codex SDK 自动生成）
- **粒度**：会话级
- **自动透传**：Codex 特有请求头

### Claude CLI Trace

```json
{
  "name": "claude cli trace",
  "model_regex": ["^claude-.*$"],
  "path_regex": ["/v1/messages"],
  "key_sources": [
    { "type": "gjson", "path": "metadata.user_id" }
  ],
  "skip_retry_on_failure": true,
  "include_using_group": true,
  "include_rule_name": true,
  "param_override_template": {
    "operations": [
      {
        "mode": "pass_headers",
        "value": ["X-Stainless-Arch", "X-Stainless-Lang", "X-Stainless-Os", "X-Stainless-Package-Version", "X-Stainless-Retry-Count", "X-Stainless-Runtime", "X-Stainless-Runtime-Version", "X-Stainless-Timeout", "User-Agent", "X-App", "Anthropic-Beta", "Anthropic-Dangerous-Direct-Browser-Access", "Anthropic-Version"],
        "keep_origin": true
      }
    ]
  }
}
```

- **匹配**：所有 `claude-*` 模型 + `/v1/messages` 路径
- **亲和值**：请求体中的 `metadata.user_id`（Claude SDK 自动生成）
- **粒度**：CLI 实例级
- **自动透传**：Anthropic 特有请求头

---

## 自定义规则示例

### 示例 1：按用户 ID 做全局亲和

所有模型、所有请求，以用户 ID 为亲和值，缓存 30 分钟。

```json
{
  "name": "user-level-affinity",
  "model_regex": [".*"],
  "path_regex": [],
  "key_sources": [
    { "type": "context_int", "key": "id" }
  ],
  "value_regex": "",
  "ttl_seconds": 1800,
  "skip_retry_on_failure": false,
  "include_using_group": true,
  "include_rule_name": true
}
```

> 同一用户的所有请求（无论使用哪个令牌、哪个客户端）都会路由到同一渠道。

### 示例 2：按令牌做亲和

适用于给不同客户分配不同令牌的场景。

```json
{
  "name": "token-level-affinity",
  "model_regex": [".*"],
  "path_regex": [],
  "key_sources": [
    { "type": "context_string", "key": "token_key" }
  ],
  "ttl_seconds": 3600,
  "skip_retry_on_failure": false,
  "include_using_group": true,
  "include_rule_name": true
}
```

### 示例 3：仅对特定模型和特定 User-Agent 生效

只对 Claude 模型 + 来自 Cursor 编辑器的请求做亲和。

```json
{
  "name": "cursor-claude-affinity",
  "model_regex": ["^claude-.*$"],
  "path_regex": ["/v1/chat/completions"],
  "user_agent_include": ["Cursor"],
  "key_sources": [
    { "type": "context_int", "key": "id" }
  ],
  "ttl_seconds": 600,
  "skip_retry_on_failure": false,
  "include_using_group": true,
  "include_rule_name": true
}
```

---

## 参数覆盖模板（param_override_template）

亲和规则可以附带一个参数覆盖模板，在亲和命中时自动合并到渠道的参数覆盖配置中。最常见的用法是**透传请求头**：

```json
{
  "param_override_template": {
    "operations": [
      {
        "mode": "pass_headers",
        "value": ["User-Agent", "X-Custom-Header"],
        "keep_origin": true
      }
    ]
  }
}
```

合并规则：
- 模板中的 `operations` 会**前置**到渠道原有的 operations 列表
- 模板中的其他字段**不会覆盖**渠道已有的同名字段
- 最终效果 = 模板 operations + 渠道原有 operations

---

## 缓存管理

### 缓存架构

渠道亲和度使用 **Redis + 内存 LRU 混合缓存**：
- **内存 LRU**：低延迟访问，容量由 `max_entries` 控制
- **Redis**：多节点共享（如果启用了 Redis）
- **过期策略**：每条记录独立 TTL，到期自动清除

### 缓存 Key 格式

```
new-api:channel_affinity:v1:[rule_name]:[using_group]:[affinity_value_hash]
```

其中：
- `rule_name` — 仅在 `include_rule_name=true` 时包含
- `using_group` — 仅在 `include_using_group=true` 时包含
- `affinity_value_hash` — 亲和值原文（非哈希）

### 手动清除缓存

在运营设置的亲和度配置区域：
- **清空全部缓存** — 清除所有亲和记录
- **按规则名清空** — 仅清除指定规则的缓存（需要规则开启 `include_rule_name`）

API 接口：
```
# 查看缓存统计
GET /api/option/channel_affinity_cache

# 清空全部
DELETE /api/option/channel_affinity_cache?all=true

# 按规则清空
DELETE /api/option/channel_affinity_cache?rule_name=codex+cli+trace
```

---

## 日志与监控

### 请求日志中的亲和信息

每次亲和匹配后，日志的 `admin_info` 中会记录：

```json
{
  "channel_affinity": {
    "reason": "claude cli trace",
    "rule_name": "claude cli trace",
    "using_group": "default",
    "selected_group": "default",
    "model": "claude-sonnet-4-20250514",
    "request_path": "/v1/messages",
    "channel_id": 15,
    "key_source": "gjson",
    "key_path": "metadata.user_id",
    "key_hint": "a1b2...y3z4",
    "key_fp": "3f8a92c1"
  }
}
```

字段说明：
- `key_hint` — 亲和值的脱敏显示（首尾各 4 字符）
- `key_fp` — 亲和值的 SHA1 指纹（前 8 位），用于统计分析

### 使用统计

通过 API 查看特定亲和组合的使用统计：

```
GET /api/log/channel_affinity_usage_cache?rule_name=claude+cli+trace&using_group=default&key_fp=3f8a92c1
```

返回的统计信息包括：
- 缓存命中率（命中次数 / 总请求次数）
- Token 用量（prompt / completion / total）
- 缓存 Token 比例（反映上游 Prompt Cache 效果）

---

## 常见问题

### 开启后能省多少钱？

以 Claude 为例，Prompt Cache 命中时输入 token 价格为原价的 **10%**。如果 Claude Code 连续对话中有 80% 的 prompt 可被缓存，开启亲和度后这部分费用降低 90%。OpenAI 的缓存折扣类似（50%）。实际节省取决于对话长度和上游缓存策略。

### 会不会导致负载不均衡？

会有一定程度的不均衡——高频用户的请求会集中在某个渠道上。但由于亲和缓存有 TTL 过期机制，长期来看负载会自然平衡。如果某些用户请求量极大，可以考虑缩短 TTL 或按用户分组隔离。

### 渠道下线/删除后怎么办？

已缓存的亲和记录仍指向被删除的渠道，直到缓存过期（默认 1 小时）。期间这些请求会因找不到渠道而失败，然后在下次请求时重新分配。如需立即生效，可在运营设置中点击"清空缓存"按钮手动清除。

### "失败不重试"（skip_retry_on_failure）是什么意思？

内置的 Codex/Claude 规则默认开启了此选项。意味着亲和渠道返回错误时，**不会自动切换到其他渠道重试**，而是直接将错误返回给客户端。

这是因为切换渠道会导致上游缓存丢失，不如让客户端自行重试重新建立亲和。如果你希望自动切换，可在规则中关闭此选项。

### 亲和度是全局还是用户级的？

取决于 `key_sources` 配置：

| 配置 | 粒度 |
|------|------|
| `context_int` + `id` | 用户级 — 同一用户所有请求固定渠道 |
| `context_string` + `token_key` | 令牌级 — 同一令牌固定渠道 |
| `gjson` + `metadata.user_id` | CLI 实例级 — 同一 Claude Code 实例固定渠道 |
| `gjson` + `prompt_cache_key` | 会话级 — 同一 Codex 会话固定渠道 |

配合 `include_using_group: true`，还会按用户分组隔离，变成 **分组 + 亲和值** 的二维粒度。

### 多条规则的匹配顺序？

规则按**列表顺序**匹配，**第一条匹配的规则生效**。建议将更具体的规则放在前面，通用规则放在后面。

### 需要配置 Redis 吗？

不是必须的。没有 Redis 时使用纯内存 LRU 缓存，功能完全正常。但如果部署了多个 new-api 节点，建议开启 Redis 以实现跨节点的亲和缓存共享。
