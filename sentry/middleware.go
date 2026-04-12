package sentry

import (
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"
)

// GinMiddleware 返回 Sentry Gin 中间件。
// 未启用时返回 no-op handler。
// Repanic=true 确保 panic 上报后重新抛出，由 gin.CustomRecovery 处理响应。
func GinMiddleware() gin.HandlerFunc {
	if !initialized.Load() {
		return func(c *gin.Context) { c.Next() }
	}
	return sentrygin.New(sentrygin.Options{
		Repanic: true,
	})
}
