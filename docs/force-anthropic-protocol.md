# 强制 Anthropic 协议切换

## 概述

当客户端使用 OpenAI 协议（`POST /v1/chat/completions`）请求时，如果模型名称匹配配置的关键词，系统会自动将出站请求切换为 Anthropic 协议（`POST /v1/messages`）转发给上游。

这使得一个 OpenAI 类型的渠道可以同时承载 OpenAI 和 Claude 系列模型，无需拆分为多个渠道。

## 工作原理

```
客户端 POST /v1/chat/completions
  │
  ├─ 模型名 = "gpt-4o"        → 不匹配 → OpenAI 协议转发 → 上游 /v1/chat/completions
  │
  └─ 模型名 = "claude-sonnet"  → 匹配 "claude"、"sonnet" → Anthropic 协议转发 → 上游 /v1/messages
```

匹配规则：
- 大小写不敏感
- 使用子字符串包含匹配（`strings.Contains`）
- 模型名只要包含列表中任一关键词即触发切换

## 配置方法

### 管理后台

进入 **设置** → **模型设置** → **全局设置** → **强制 Anthropic 协议关键词**

### 配置格式

JSON 字符串数组，每个元素为一个关键词：

```json
["claude", "opus", "sonnet", "haiku"]
```

### 配置项说明

| 属性 | 值 |
|------|-----|
| 配置键 | `global.force_anthropic_keywords` |
| 类型 | `string[]`（JSON 数组） |
| 默认值 | `["claude", "opus", "sonnet", "haiku"]` |
| 空数组行为 | `[]` — 禁用自动协议切换，所有请求保持 OpenAI 协议 |

### API 修改方式

```
PUT /api/option/
Content-Type: application/json

{
  "key": "global.force_anthropic_keywords",
  "value": "[\"claude\", \"opus\", \"sonnet\", \"haiku\", \"my-custom-model\"]"
}
```

权限：管理员

## 使用场景

### 场景一：上游是另一个 new-api 实例

上游 new-api 同时代理 OpenAI 和 Claude 模型。只需创建一个 OpenAI 类型渠道，将所有模型填入模型列表。系统会根据关键词自动选择正确的协议转发。

### 场景二：自定义模型名需要走 Anthropic 协议

如果上游有自定义命名的 Claude 模型（如 `my-claude-proxy`），只需将 `my-claude-proxy` 或其子串加入关键词列表即可。

### 场景三：禁用自动切换

将配置设为空数组 `[]`，所有请求将严格按照渠道类型决定的协议转发，不再自动切换。

## 注意事项

- 关键词匹配是**子字符串包含**，设置过于宽泛的关键词（如 `"o"`）会导致大量误匹配
- 如果客户端直接使用 Anthropic 协议（`POST /v1/messages`），则不受此配置影响，始终走 Anthropic 协议
- 修改配置后立即生效，无需重启服务

## 相关代码

| 文件 | 说明 |
|------|------|
| `setting/model_setting/global.go` | `ForceAnthropicKeywords` 字段定义和 `IsForceAnthropicModel()` 匹配函数 |
| `controller/relay.go` | 协议切换判断逻辑（约 line 126） |
| `relay/common/relay_info.go` | `InitChannelMeta` 中强制覆盖 `apiType` 为 Anthropic（约 line 182） |
| `constant/context_key.go` | `ContextKeyForceAnthropicAPI` 上下文键定义 |
