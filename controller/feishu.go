package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// TestFeishuAlert sends a test alert through every configured Feishu mode
// (webhook and/or app). The endpoint is synchronous so the API response can
// surface the actual upstream reply (auth/sign/business code).
func TestFeishuAlert(c *gin.Context) {
	hasWebhook := common.FeishuAlertWebhookUrl != ""
	hasApp := common.FeishuAlertAppId != "" && common.FeishuAlertAppSecret != "" && common.FeishuAlertReceiveId != ""
	if !hasWebhook && !hasApp {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请先配置 Webhook URL 或 App (App ID + App Secret + Receive ID) 后再测试",
		})
		return
	}
	modes := []string{}
	if hasWebhook {
		modes = append(modes, "webhook")
	}
	if hasApp {
		modes = append(modes, "app")
	}
	err := service.SendFeishuAlertSync(service.AlertEvent{
		Kind:  service.AlertKindTest,
		Level: service.AlertLevelInfo,
		Title: "飞书告警测试",
		Fields: []service.AlertField{
			{Label: "测试模式", Value: strings.Join(modes, ", "), Short: true},
			{Label: "来源", Value: common.SystemName, Short: true},
			{Label: "说明", Value: "这是一条测试消息，用于验证飞书机器人配置是否能正常收到告警卡片。", Short: false},
		},
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "已发送测试消息，请检查飞书是否收到",
	})
}
