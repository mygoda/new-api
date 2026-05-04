package service

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
)

func formatNotifyType(channelId int, status int) string {
	return fmt.Sprintf("%s_%d_%d", dto.NotifyTypeChannelUpdate, channelId, status)
}

// disable & notify
func DisableChannel(channelError types.ChannelError, reason string) {
	common.SysLog(fmt.Sprintf("通道「%s」（#%d）发生错误，准备禁用，原因：%s", channelError.ChannelName, channelError.ChannelId, reason))

	// 检查是否启用自动禁用功能
	if !channelError.AutoBan {
		common.SysLog(fmt.Sprintf("通道「%s」（#%d）未启用自动禁用功能，跳过禁用操作", channelError.ChannelName, channelError.ChannelId))
		return
	}

	success := model.UpdateChannelStatus(channelError.ChannelId, channelError.UsingKey, common.ChannelStatusAutoDisabled, reason)
	if success {
		subject := fmt.Sprintf("通道「%s」（#%d）已被禁用", channelError.ChannelName, channelError.ChannelId)
		content := fmt.Sprintf("通道「%s」（#%d）已被禁用，原因：%s", channelError.ChannelName, channelError.ChannelId, reason)
		NotifyRootUser(formatNotifyType(channelError.ChannelId, common.ChannelStatusAutoDisabled), subject, content)
	}
}

// DisableChannelModel disables a single (channel, model) pair across all groups by toggling
// the corresponding ability rows, and creates / resets a heartbeat task that the worker will
// poll until N consecutive successes are observed. Falls back to whole-channel disable when
// the model is unknown or the feature is turned off.
func DisableChannelModel(channelError types.ChannelError, reason string) {
	if channelError.Model == "" || !common.AutomaticDisableChannelModelEnabled {
		DisableChannel(channelError, reason)
		return
	}
	if !channelError.AutoBan {
		common.SysLog(fmt.Sprintf("通道「%s」（#%d）模型「%s」未启用自动禁用，跳过", channelError.ChannelName, channelError.ChannelId, channelError.Model))
		return
	}

	rows, err := model.UpdateAbilityEnabledByChannelModel(channelError.ChannelId, channelError.Model, false)
	if err != nil {
		common.SysLog(fmt.Sprintf("禁用通道模型失败 channel=%d model=%s err=%s", channelError.ChannelId, channelError.Model, err.Error()))
		return
	}
	if rows == 0 {
		common.SysLog(fmt.Sprintf("未找到对应 ability 行,跳过 channel=%d model=%s", channelError.ChannelId, channelError.Model))
		return
	}

	hb, err := model.UpsertHeartbeat(
		channelError.ChannelId,
		channelError.Model,
		channelError.ChannelName,
		reason,
		common.ChannelModelHeartbeatSuccessThreshold,
		common.ChannelModelHeartbeatIntervalSeconds,
	)
	if err != nil {
		common.SysLog(fmt.Sprintf("创建心跳任务失败 channel=%d model=%s err=%s", channelError.ChannelId, channelError.Model, err.Error()))
		return
	}
	model.InitChannelCache()

	subject := fmt.Sprintf("通道「%s」（#%d）模型「%s」已被禁用", channelError.ChannelName, channelError.ChannelId, channelError.Model)
	content := fmt.Sprintf("通道「%s」（#%d）模型「%s」已被自动禁用，原因：%s。已创建心跳任务 #%d，将每 %d 秒探测一次，连续 %d 次成功后自动恢复。",
		channelError.ChannelName, channelError.ChannelId, channelError.Model, reason, hb.Id, hb.IntervalSeconds, hb.SuccessThreshold)
	NotifyRootUser(fmt.Sprintf("channel_model_disabled_%d_%s", channelError.ChannelId, channelError.Model), subject, content)
}

func EnableChannel(channelId int, usingKey string, channelName string) {
	success := model.UpdateChannelStatus(channelId, usingKey, common.ChannelStatusEnabled, "")
	if success {
		subject := fmt.Sprintf("通道「%s」（#%d）已被启用", channelName, channelId)
		content := fmt.Sprintf("通道「%s」（#%d）已被启用", channelName, channelId)
		NotifyRootUser(formatNotifyType(channelId, common.ChannelStatusEnabled), subject, content)
	}
}

func ShouldDisableChannel(channelType int, err *types.NewAPIError) bool {
	if !common.AutomaticDisableChannelEnabled {
		return false
	}
	if err == nil {
		return false
	}
	if types.IsChannelError(err) {
		return true
	}
	if types.IsSkipRetryError(err) {
		return false
	}
	if operation_setting.ShouldDisableByStatusCode(err.StatusCode) {
		return true
	}
	//if err.StatusCode == http.StatusUnauthorized {
	//	return true
	//}
	if err.StatusCode == http.StatusForbidden {
		switch channelType {
		case constant.ChannelTypeGemini:
			return true
		}
	}
	oaiErr := err.ToOpenAIError()
	switch oaiErr.Code {
	case "invalid_api_key":
		return true
	case "account_deactivated":
		return true
	case "billing_not_active":
		return true
	case "pre_consume_token_quota_failed":
		return true
	case "Arrearage":
		return true
	}
	switch oaiErr.Type {
	case "insufficient_quota":
		return true
	case "insufficient_user_quota":
		return true
	// https://docs.anthropic.com/claude/reference/errors
	case "authentication_error":
		return true
	case "permission_error":
		return true
	case "forbidden":
		return true
	}

	lowerMessage := strings.ToLower(err.Error())
	search, _ := AcSearch(lowerMessage, operation_setting.AutomaticDisableKeywords, true)
	return search
}

func ShouldEnableChannel(newAPIError *types.NewAPIError, status int) bool {
	if !common.AutomaticEnableChannelEnabled {
		return false
	}
	if newAPIError != nil {
		return false
	}
	if status != common.ChannelStatusAutoDisabled {
		return false
	}
	return true
}
