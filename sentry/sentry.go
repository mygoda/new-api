package sentry

import (
	"context"
	"fmt"
	"sync/atomic"
	"time"

	sentrygo "github.com/getsentry/sentry-go"
)

var initialized atomic.Bool

// Options 初始化选项，不依赖项目内部包
type Options struct {
	DSN              string
	Environment      string
	Release          string
	SampleRate       float64
	EnableTracing    bool
	TracesSampleRate float64
	RequestIDKey     any // 用于从 context 提取 request_id
}

var requestIDKey any

// Init 初始化 Sentry SDK。DSN 为空时静默返回（禁用）。
func Init(opts Options) error {
	if opts.DSN == "" {
		initialized.Store(false)
		return nil
	}

	requestIDKey = opts.RequestIDKey

	if opts.Environment == "" {
		opts.Environment = "production"
	}
	if opts.SampleRate <= 0 {
		opts.SampleRate = 1.0
	}

	err := sentrygo.Init(sentrygo.ClientOptions{
		Dsn:              opts.DSN,
		Environment:      opts.Environment,
		Release:          opts.Release,
		SampleRate:       opts.SampleRate,
		EnableTracing:    opts.EnableTracing,
		TracesSampleRate: opts.TracesSampleRate,
		AttachStacktrace: true,
	})
	if err != nil {
		initialized.Store(false)
		return fmt.Errorf("sentry init failed: %w", err)
	}

	initialized.Store(true)
	return nil
}

// Reinit 使用新选项重新初始化。由配置热更新调用。
var ReinitFunc func()

// Flush 刷新缓冲事件，在应用退出前调用。
func Flush(timeout time.Duration) {
	if !initialized.Load() {
		return
	}
	sentrygo.Flush(timeout)
}

// CaptureException 上报错误到 Sentry。
func CaptureException(err error) {
	if !initialized.Load() || err == nil {
		return
	}
	sentrygo.CaptureException(err)
}

// CaptureMessage 上报消息到 Sentry。
func CaptureMessage(msg string) {
	if !initialized.Load() {
		return
	}
	sentrygo.CaptureMessage(msg)
}

// CaptureErrorWithContext 带 request_id 上下文上报错误消息。
// 签名 func(context.Context, string) 匹配 logger.LogErrorHook。
func CaptureErrorWithContext(ctx context.Context, msg string) {
	if !initialized.Load() {
		return
	}

	hub := sentrygo.CurrentHub().Clone()
	hub.ConfigureScope(func(scope *sentrygo.Scope) {
		if requestIDKey != nil {
			if reqID := ctx.Value(requestIDKey); reqID != nil {
				scope.SetTag("request_id", fmt.Sprintf("%v", reqID))
			}
		}
	})
	hub.CaptureMessage(msg)
}

// IsEnabled 返回 Sentry 是否已启用。
func IsEnabled() bool {
	return initialized.Load()
}
