# 上游错误处理流程

本文档详细描述当上游 AI 服务商返回错误时，系统如何解析、包装、重试并最终响应给客户端。

## 目录

- [整体流程概览](#整体流程概览)
- [核心数据结构](#核心数据结构)
- [详细流程](#详细流程)
  - [1. 请求入口与预校验](#1-请求入口与预校验)
  - [2. 重试循环](#2-重试循环)
  - [3. Helper 层：发送请求与检查响应](#3-helper-层发送请求与检查响应)
  - [4. 上游错误响应解析](#4-上游错误响应解析)
  - [5. Adaptor 层：响应体内错误检测](#5-adaptor-层响应体内错误检测)
  - [6. 流式与非流式差异](#6-流式与非流式差异)
  - [7. 重试判断逻辑](#7-重试判断逻辑)
  - [8. 渠道错误处理与自动禁用](#8-渠道错误处理与自动禁用)
  - [9. 错误响应格式化与输出](#9-错误响应格式化与输出)
  - [10. 额度退还](#10-额度退还)
- [错误码一览](#错误码一览)
- [关键文件索引](#关键文件索引)

---

## 整体流程概览

```
客户端请求
    │
    ▼
controller/relay.go: Relay()
    │
    ├─ 预校验（请求解析、参数校验、额度预扣）
    │
    ├─ 重试循环 ──────────────────────────────────────────────────┐
    │   │                                                         │
    │   ├─ getChannel() ─── 选取渠道/密钥                         │
    │   │                                                         │
    │   ├─ RelayHandler ─── 分发到对应 Helper                     │
    │   │   │                                                     │
    │   │   ├─ adaptor.ConvertRequest()  转换请求格式              │
    │   │   ├─ adaptor.DoRequest()       发送 HTTP 请求到上游      │
    │   │   ├─ 检查 HTTP 状态码                                   │
    │   │   │   └─ 非 200 → RelayErrorHandler() 解析错误          │
    │   │   └─ adaptor.DoResponse()      解析响应体               │
    │   │       └─ 响应体内含错误 → 包装为 NewAPIError             │
    │   │                                                         │
    │   ├─ 出错 → processChannelError() 记录渠道故障              │
    │   ├─ shouldRetry()? ─── 是 → 换渠道继续循环                 │
    │   └─────────────────── 否 → break                           │
    │                                                              │
    ▼
错误响应阶段
    ├─ Billing.Refund()        退还预扣额度
    ├─ 格式化错误（OpenAI / Claude / WebSocket）
    └─ 返回给客户端
```

---

## 核心数据结构

### NewAPIError (`types/error.go:90-99`)

系统内部统一的错误表示，贯穿整个错误处理链路：

```go
type NewAPIError struct {
    Err            error           // 底层 Go error，包含完整错误信息
    RelayError     any             // 原始上游错误（OpenAIError 或 ClaudeError）
    skipRetry      bool            // 是否跳过重试
    recordErrorLog *bool           // 是否记录错误日志
    errorType      ErrorType       // 错误类型分类
    errorCode      ErrorCode       // 机器可读的错误码
    StatusCode     int             // 返回给客户端的 HTTP 状态码
    Metadata       json.RawMessage // 附加元数据
}
```

### ErrorType (`types/error.go:28-36`)

标识错误的来源类型：

| ErrorType | 含义 |
|-----------|------|
| `ErrorTypeNewAPIError` | 系统内部错误 |
| `ErrorTypeOpenAIError` | 来自上游的 OpenAI 格式错误 |
| `ErrorTypeClaudeError` | 来自上游的 Claude 格式错误 |
| `ErrorTypeUpstreamError` | 通用上游错误 |
| `ErrorTypeMidjourneyError` | Midjourney 错误 |
| `ErrorTypeGeminiError` | Gemini 错误 |

### GeneralErrorResponse (`dto/error.go:23-39`)

用于兼容解析各种上游错误响应格式的通用结构：

```go
type GeneralErrorResponse struct {
    Error    json.RawMessage  // 主错误字段（可能是 object 或 string）
    Message  string           // 直接消息字段
    Msg      string           // 备选消息字段
    Err      string           // 备选错误字段
    ErrorMsg string           // 备选错误消息字段
    Detail   string           // 详情字段
    Header   struct { Message string }           // 嵌套消息
    Response struct { Error struct { Message string } } // 深层嵌套消息
}
```

支持的上游错误格式示例：

```json
// OpenAI / Anthropic / Gemini 标准格式
{"error": {"message": "...", "type": "...", "code": "..."}}

// 简单字符串格式
{"error": "something went wrong"}

// 其他厂商的非标格式
{"message": "..."}
{"msg": "..."}
{"detail": "..."}
{"header": {"message": "..."}}
{"response": {"error": {"message": "..."}}}
```

---

## 详细流程

### 1. 请求入口与预校验

**入口函数**: `controller/relay.go: Relay()` (line 67)

在进入重试循环之前，依次进行以下校验，任一失败则直接返回错误，不进入重试：

| 步骤 | 函数 | 错误码 |
|------|------|--------|
| 解析请求体 | `helper.GetAndValidateRequest()` | `ErrorCodeInvalidRequest` |
| 生成中继信息 | `helper.GenRelayInfo()` | `ErrorCodeGenRelayInfoFailed` |
| Token 计数 | `service.EstimateRequestToken()` | `ErrorCodeCountTokenFailed` |
| 敏感词检测 | `service.CheckSensitiveWords()` | `ErrorCodeSensitiveWordsDetected` |
| 模型定价 | `service.ModelPriceHelper()` | `ErrorCodeModelPriceError` |
| 额度预扣 | `service.PreConsumeBilling()` | `ErrorCodeInsufficientUserQuota` 等 |

### 2. 重试循环

**代码位置**: `controller/relay.go:195-241`

```
for retryIndex = 0; retryIndex <= common.RetryTimes; retryIndex++ {
    1. getChannel()        → 选取可用渠道，失败则 break
    2. 恢复请求体          → 从 BodyStorage 重新构建 Request.Body
    3. 分发到对应 Handler  → 根据 relayFormat 选择:
       ├─ RelayFormatClaude    → ClaudeHelper()
       ├─ RelayFormatGemini    → geminiRelayHandler()
       ├─ RelayFormatRealtime  → WssHelper()
       └─ 默认 (OpenAI)       → relayHandler() → TextHelper / ImageHelper / ...
    4. 无错误              → return（成功）
    5. 有错误:
       a. NormalizeViolationFeeError()  规范化违规费用错误
       b. processChannelError()         记录渠道故障、可能禁用渠道
       c. shouldRetry()?                判断是否继续重试
          ├─ true  → 继续循环
          └─ false → break
}
```

每次重试会选择不同的渠道/密钥，请求体从 `BodyStorage` 重新读取以支持重放。

### 3. Helper 层：发送请求与检查响应

以 `TextHelper`（`relay/compatible_handler.go:26-217`）为例，这是 OpenAI 兼容格式的主处理函数：

```
1. adaptor.ConvertOpenAIRequest()
   └─ 失败 → NewError(err, ErrorCodeConvertRequestFailed, ErrOptionWithSkipRetry())
            （标记 skipRetry，不会重试）

2. adaptor.DoRequest()
   └─ 失败 → NewOpenAIError(err, ErrorCodeDoRequestFailed, 500)
            （网络级别失败，可重试）

3. 检查 HTTP 状态码
   └─ httpResp.StatusCode != 200:
      a. service.RelayErrorHandler()  → 解析上游错误响应体
      b. service.ResetStatusCode()    → 应用渠道级别状态码映射
      c. 返回 NewAPIError

4. adaptor.DoResponse()
   └─ 失败 → 由各 adaptor 内部包装为 NewAPIError
      a. service.ResetStatusCode()    → 应用状态码映射
      b. 返回错误
```

`ClaudeHelper`（`relay/claude_handler.go`）流程类似，但调用 `adaptor.ConvertClaudeRequest()` 并处理 Claude 协议格式。

### 4. 上游错误响应解析

**核心函数**: `service/error.go: RelayErrorHandler()` (line 86-129)

当上游返回非 200 状态码时，此函数负责读取并解析错误响应体：

```
RelayErrorHandler(ctx, resp, showBodyWhenFail):
    │
    ├─ io.ReadAll(resp.Body)  读取完整响应体
    │   └─ 失败 → 返回初始错误（仅含状态码，无消息）
    │
    ├─ common.Unmarshal → GeneralErrorResponse
    │   └─ 失败（非 JSON）:
    │       ├─ showBodyWhenFail=true → 错误消息包含原始响应体
    │       └─ showBodyWhenFail=false → 仅记录日志，错误消息只含状态码
    │
    ├─ 判断 error 字段类型:
    │   └─ 是 object:
    │       ├─ TryToOpenAIError() → 尝试解析为 OpenAI 格式
    │       │   └─ 成功 → WithOpenAIError(oaiError, statusCode) 返回
    │       └─ 失败 → 继续下一步
    │
    └─ 兜底: ToMessage() 按优先级提取文本消息
        → NewOpenAIError(message, ErrorCodeBadResponseStatusCode, statusCode)
```

**ToMessage() 优先级** (`dto/error.go:52-93`):

```
error (object → .message) > error (string) > message > msg > err >
error_msg > detail > header.message > response.error.message
```

### 5. Adaptor 层：响应体内错误检测

即使 HTTP 状态码为 200，响应体内部仍可能包含错误信息。各 Adaptor 负责检测这类错误：

#### OpenAI 非流式 (`relay/channel/openai/relay-openai.go: OpenaiHandler`, line 196)

```
1. io.ReadAll(resp.Body)
2. Unmarshal → OpenAITextResponse
3. 检查 response.Error 字段:
   └─ 非空 → WithOpenAIError(response.Error, 500)
4. 检查 finish_reason == "content_filter"
   └─ 是 → ErrorCodeBadResponse
```

#### OpenAI 流式 (`relay/channel/openai/relay-openai.go: OaiStreamHandler`, line 106)

```
StreamScannerHandler() 逐行处理 SSE:
    对每一行:
    1. 解析 JSON → ChatCompletionsStreamResponse
    2. 检查 response.Error 字段
       └─ 非空 → 记录日志，但继续处理后续 SSE
    3. 提取 usage（通常在最后一条 SSE 中）
```

#### Claude 非流式 (`relay/channel/claude/relay-claude.go: ClaudeHandler`, line 877)

```
1. ReadAll(resp.Body)
2. Unmarshal → ClaudeResponse
3. GetClaudeError() 检查错误
   └─ 非空 → WithClaudeError(claudeError, 500)
```

#### Claude 流式 (`relay/channel/claude/relay-claude.go: ClaudeStreamHandler`, line 809)

```
StreamScannerHandler() 逐行处理 SSE:
    对每一行调用 HandleStreamResponseData():
    1. Unmarshal JSON
    2. GetClaudeError() 检查错误
       └─ 非空 → WithClaudeError(error, 500)，返回 false 停止流
    3. 检查 stop_reason == "refusal"
```

### 6. 流式与非流式差异

| 场景 | 非流式 | 流式 |
|------|--------|------|
| **HTTP 状态码非 200** | `RelayErrorHandler()` 解析后完整返回错误 JSON | 同左，此时 SSE 头尚未发送 |
| **HTTP 200 但响应体含错误** | 解析响应体后包装为 `NewAPIError` 返回 | OpenAI: 记录日志但继续流；Claude: 立即停止流 |
| **传输中途出错** | 不适用 | SSE 头已发送 (HTTP 200)，无法修改状态码，流被截断 |
| **错误信息完整性** | 完整错误 JSON 返回客户端 | 取决于错误发生时机，已发送的数据无法撤回 |

**流式传输基础设施** (`relay/helper/stream_scanner.go`):

StreamScannerHandler 启动三个并发 goroutine：
- **Scanner goroutine**: 从 `resp.Body` 读取 SSE 行，发送到 `dataChan`
- **Data handler goroutine**: 从 `dataChan` 读取，调用业务回调处理每行数据
- **Ping goroutine**: 定期发送 `: ping` 保持连接

超时保护：默认 300 秒流式超时，可通过配置调整。

### 7. 重试判断逻辑

**函数**: `controller/relay.go: shouldRetry()` (line 324-354)

按以下顺序判断，命中即返回：

```
1. 渠道亲和性失败后不重试                → false
2. 是 channel:* 错误码（渠道级错误）      → true（换渠道重试）
3. 标记了 skipRetry                      → false
4. 剩余重试次数 <= 0                     → false
5. 指定了特定渠道 ID                     → false（不换渠道）
6. 状态码 2xx                           → false（成功不重试）
7. 状态码不在 100-599 范围               → true（异常状态码，重试）
8. 配置为始终跳过重试的错误码             → false
9. 根据状态码配置判断是否重试             → 查配置决定
```

**哪些错误标记了 skipRetry（不会重试）**:

- `ErrorCodeInvalidRequest` — 客户端请求无效
- `ErrorCodeConvertRequestFailed` — 请求格式转换失败
- `ErrorCodeReadRequestBodyFailed` — 请求体读取失败
- `ErrorCodeGetChannelFailed` — 无可用渠道
- `ErrorCodeChannelNoAvailableKey` — 无可用密钥

### 8. 渠道错误处理与自动禁用

**函数**: `controller/relay.go: processChannelError()` (line 356-401)

每次上游报错都会执行：

```
1. 记录错误日志（含渠道 ID、状态码、错误信息）

2. 判断是否自动禁用渠道:
   if ShouldDisableChannel(channelType, err) && channel.AutoBan:
       → 异步执行 DisableChannel()

3. 如果启用了错误日志记录 (ErrorLogEnabled):
   → 保存到数据库，包含:
     - error_type, error_code, status_code
     - channel_id, channel_name, channel_type
     - request_path
     - user_id, token_name, model_name
     - use_channel 列表（重试路径）
```

### 9. 错误响应格式化与输出

**代码位置**: `controller/relay.go:88-106` (defer 块)

最终错误根据客户端请求的协议格式输出：

#### OpenAI 格式（默认）

```json
{
  "error": {
    "message": "错误信息 (request id: xxx)",
    "type": "new_api_error",
    "code": "bad_response_status_code"
  }
}
```

#### Claude 格式

```json
{
  "type": "error",
  "error": {
    "type": "api_error",
    "message": "错误信息 (request id: xxx)"
  }
}
```

#### WebSocket 格式（Realtime API）

通过 `helper.WssError()` 发送 WebSocket 错误帧。

**错误信息脱敏**:

`ToOpenAIError()` 和 `ToClaudeError()` 在输出前会调用 `common.MaskSensitiveInfo()` 遮蔽敏感信息（如上游密钥、内部 URL），防止泄露。

**状态码映射**:

`service.ResetStatusCode()` 支持渠道级别的状态码映射配置，例如将上游的 429 映射为 503，格式为 JSON 字符串 `{"429": 503}`。

### 10. 额度退还

**代码位置**: `controller/relay.go:175-184` (defer 块)

```go
defer func() {
    if newAPIError != nil {
        newAPIError = service.NormalizeViolationFeeError(newAPIError)
        if relayInfo.Billing != nil {
            relayInfo.Billing.Refund(c)  // 退还预扣额度
        }
        service.ChargeViolationFeeIfNeeded(c, relayInfo, newAPIError)  // 如有违规则扣费
    }
}()
```

流程：请求前预扣额度 → 上游失败 → 全额退还预扣额度 → 若触发违规（如 CSAM 检测）则单独扣除违规费用。

---

## 错误码一览

### 请求阶段错误

| 错误码 | 含义 | 可重试 |
|--------|------|--------|
| `invalid_request` | 客户端请求无效 | 否 |
| `sensitive_words_detected` | 触发敏感词检测 | 否 |
| `read_request_body_failed` | 请求体读取失败 | 否 |
| `convert_request_failed` | 请求格式转换失败 | 否 |
| `count_token_failed` | Token 计数失败 | 否 |
| `model_price_error` | 模型定价错误 | 否 |

### 渠道/网络阶段错误

| 错误码 | 含义 | 可重试 |
|--------|------|--------|
| `get_channel_failed` | 获取渠道失败 | 否 |
| `channel:no_available_key` | 渠道无可用密钥 | 否 |
| `channel:invalid_key` | 当前密钥无效 | 是（换密钥） |
| `channel:model_mapped_error` | 模型映射错误 | 是（换渠道） |
| `channel:aws_client_error` | AWS 客户端错误 | 是（换渠道） |
| `do_request_failed` | HTTP 请求发送失败 | 是 |

### 响应阶段错误

| 错误码 | 含义 | 可重试 |
|--------|------|--------|
| `bad_response_status_code` | 上游返回非 200 状态码 | 通常是 |
| `bad_response_body` | 响应体解析失败 | 是 |
| `bad_response` | 响应内容无效 | 是 |
| `read_response_body_failed` | 响应体读取失败 | 是 |
| `empty_response` | 响应为空 | 是 |
| `model_not_found` | 上游不识别模型 | 否 |
| `prompt_blocked` | 提示词被上游拦截 | 否 |

### 额度错误

| 错误码 | 含义 | 可重试 |
|--------|------|--------|
| `insufficient_user_quota` | 用户额度不足 | 否 |
| `pre_consume_token_quota_failed` | 预扣额度失败 | 否 |

---

## 关键文件索引

| 文件 | 职责 |
|------|------|
| `types/error.go` | `NewAPIError` 定义、错误码常量、构造函数、`ToOpenAIError()`/`ToClaudeError()` 格式转换、skipRetry 机制 |
| `dto/error.go` | `GeneralErrorResponse` 通用错误解析结构、`TryToOpenAIError()`、`ToMessage()` 多格式兼容 |
| `service/error.go` | `RelayErrorHandler()` 上游错误响应解析、`ResetStatusCode()` 状态码映射 |
| `controller/relay.go` | `Relay()` 主入口、重试循环、`shouldRetry()` 判断、`processChannelError()` 渠道故障处理、错误响应输出 |
| `relay/compatible_handler.go` | `TextHelper()` OpenAI 兼容格式的请求发送与错误检查 |
| `relay/claude_handler.go` | `ClaudeHelper()` Claude 协议格式处理 |
| `relay/channel/openai/relay-openai.go` | `OaiStreamHandler()` / `OpenaiHandler()` 流式与非流式响应处理及错误检测 |
| `relay/channel/claude/relay-claude.go` | `ClaudeStreamHandler()` / `ClaudeHandler()` Claude 响应处理及错误检测 |
| `relay/channel/openai/adaptor.go` | `DoRequest()` / `DoResponse()` 请求发送与响应路由分发 |
| `relay/helper/stream_scanner.go` | `StreamScannerHandler()` SSE 流解析基础设施、超时保护、ping 保活 |
