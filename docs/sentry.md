# Sentry 错误监控集成

## 概述

new-api 集成了 [Sentry](https://sentry.io) 错误监控，自动捕获以下事件并上报：

- HTTP handler **panic**（含完整堆栈和请求上下文）
- 所有 `logger.LogError()` 调用（含 request_id）
- 所有 `common.SysError()` 调用（系统级错误）

不配置 DSN 时完全不启用，零开销。

## 配置方式

### 方式一：环境变量（推荐）

在 `.env` 文件或容器环境变量中设置：

```env
SENTRY_DSN=https://<key>@<host>/<project_id>
SENTRY_ENVIRONMENT=production
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SENTRY_DSN` | Sentry DSN 地址（必填，为空则禁用） | 空（禁用） |
| `SENTRY_ENVIRONMENT` | 环境标识（production / staging / development） | `production` |

环境变量优先级高于数据库配置。

### 方式二：管理后台 API

通过 `PUT /api/option/` 接口设置，需要管理员权限：

```bash
# 设置 DSN
curl -X PUT http://localhost:3010/api/option/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"key": "sentry.dsn", "value": "https://<key>@<host>/<project_id>"}'

# 设置环境标识
curl -X PUT http://localhost:3010/api/option/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"key": "sentry.environment", "value": "production"}'

# 设置采样率（0.0 ~ 1.0）
curl -X PUT http://localhost:3010/api/option/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"key": "sentry.sample_rate", "value": "1.0"}'
```

修改后**立即生效**，无需重启服务。

### 全部配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `sentry.dsn` | string | 空 | Sentry DSN 地址，为空则禁用 |
| `sentry.environment` | string | `production` | 环境标识 |
| `sentry.sample_rate` | float | `1.0` | 错误采样率，1.0 = 全量上报 |
| `sentry.enable_tracing` | bool | `false` | 是否启用性能追踪 |
| `sentry.traces_sample_rate` | float | `0.1` | 性能追踪采样率 |

## 获取 DSN

1. 登录 [sentry.io](https://sentry.io)（或自建 Sentry 实例）
2. 创建项目，平台选择 **Go**
3. 在 **Settings → Client Keys (DSN)** 中复制 DSN 地址

DSN 格式示例：
```
https://examplePublicKey@o0.ingest.sentry.io/0
```

## 验证配置

设置 DSN 后，在启动日志中会看到：

```
[SYS] 2026/04/12 - 10:00:00 | Sentry initialized, environment: production
```

如果没有看到此日志，说明 DSN 未设置或为空。

## 上报内容

### Panic 事件

自动捕获所有 HTTP 请求中的 panic，包含：
- 完整堆栈信息
- 请求 URL、Method、Headers
- Request ID

### 错误日志

所有通过 `logger.LogError()` 记录的错误会同步上报，包含：
- 错误消息
- Request ID（如在请求上下文中）

### 系统错误

所有通过 `common.SysError()` 记录的系统级错误会同步上报。

## 注意事项

- 环境变量 `SENTRY_DSN` 优先级高于数据库配置 `sentry.dsn`
- 采样率 `sample_rate` 设为 `0` 会禁用所有错误上报
- 性能追踪（Tracing）默认关闭，按需开启
- Sentry 事件异步发送，不影响请求响应延迟
- 应用退出时会等待最多 2 秒刷新缓冲事件

## 相关代码

| 文件 | 说明 |
|------|------|
| `sentry/sentry.go` | 核心封装：Init / Flush / Capture 函数 |
| `sentry/middleware.go` | Gin 中间件，捕获 panic |
| `setting/system_setting/sentry.go` | 配置结构定义 |
| `main.go` | 初始化入口和 Hook 注入 |
