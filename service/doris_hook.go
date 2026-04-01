package service

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

// EmitDorisLog builds a DorisRequestLog from the relay context and enqueues it
// for async batch write to Doris. Called after successful quota consumption.
func EmitDorisLog(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, usage *dto.Usage) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		return
	}
	if relayInfo == nil {
		return
	}

	log := DorisRequestLog{
		RequestId:   relayInfo.RequestId,
		UserId:      relayInfo.UserId,
		TokenId:     relayInfo.TokenId,
		TokenName:   ctx.GetString("token_name"),
		UserGroup:   relayInfo.UserGroup,
		TokenGroup:  relayInfo.TokenGroup,
		UsingGroup:  relayInfo.UsingGroup,
		ModelName:   relayInfo.OriginModelName,
		IsStream:    relayInfo.IsStream,
		RelayMode:   relayInfo.RelayMode,
		RequestPath: relayInfo.RequestURLPath,
		ClientIp:    ctx.ClientIP(),
		IsSuccess:   true,
		CreatedAt:   time.Now().UTC().Format("2006-01-02 15:04:05"),
	}

	if relayInfo.ChannelMeta != nil {
		log.ChannelId = relayInfo.ChannelId
		log.ChannelType = relayInfo.ChannelType
		log.UpstreamModel = relayInfo.UpstreamModelName
	}
	log.ChannelName = ctx.GetString("channel_name")

	if usage != nil {
		log.PromptTokens = usage.PromptTokens
		log.CompletionTokens = usage.CompletionTokens
		log.TotalTokens = usage.TotalTokens
		log.CacheTokens = usage.PromptTokensDetails.CachedTokens
	}

	log.ModelRatio = relayInfo.PriceData.ModelRatio
	log.GroupRatio = relayInfo.PriceData.GroupRatioInfo.GroupRatio
	log.ModelPrice = relayInfo.PriceData.ModelPrice

	log.UseTimeMs = time.Since(relayInfo.StartTime).Milliseconds()
	log.RetryCount = relayInfo.RetryIndex

	log.StatusCode = ctx.Writer.Status()

	RecordDorisLog(log)
}

// EmitDorisLogWithSummary builds a DorisRequestLog using quota summary info
// for audio/wss paths where dto.Usage is not directly available.
func EmitDorisLogWithSummary(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, totalTokens int, promptTokens int, completionTokens int, quota int) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		return
	}
	if relayInfo == nil {
		return
	}

	log := DorisRequestLog{
		RequestId:        relayInfo.RequestId,
		UserId:           relayInfo.UserId,
		TokenId:          relayInfo.TokenId,
		TokenName:        ctx.GetString("token_name"),
		UserGroup:        relayInfo.UserGroup,
		TokenGroup:       relayInfo.TokenGroup,
		UsingGroup:       relayInfo.UsingGroup,
		ModelName:        relayInfo.OriginModelName,
		IsStream:         relayInfo.IsStream,
		RelayMode:        relayInfo.RelayMode,
		RequestPath:      relayInfo.RequestURLPath,
		ClientIp:         ctx.ClientIP(),
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		TotalTokens:      totalTokens,
		Quota:            quota,
		IsSuccess:        true,
		StatusCode:       ctx.Writer.Status(),
		CreatedAt:        time.Now().UTC().Format("2006-01-02 15:04:05"),
	}

	if relayInfo.ChannelMeta != nil {
		log.ChannelId = relayInfo.ChannelId
		log.ChannelType = relayInfo.ChannelType
		log.UpstreamModel = relayInfo.UpstreamModelName
	}
	log.ChannelName = ctx.GetString("channel_name")
	log.ModelRatio = relayInfo.PriceData.ModelRatio
	log.GroupRatio = relayInfo.PriceData.GroupRatioInfo.GroupRatio
	log.ModelPrice = relayInfo.PriceData.ModelPrice
	log.UseTimeMs = time.Since(relayInfo.StartTime).Milliseconds()
	log.RetryCount = relayInfo.RetryIndex

	RecordDorisLog(log)
}

// EmitDorisErrorLog records a failed request to Doris.
func EmitDorisErrorLog(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, statusCode int, errType string, errMsg string) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		return
	}
	if relayInfo == nil {
		return
	}

	log := DorisRequestLog{
		RequestId:    relayInfo.RequestId,
		UserId:       relayInfo.UserId,
		TokenId:      relayInfo.TokenId,
		TokenName:    ctx.GetString("token_name"),
		UserGroup:    relayInfo.UserGroup,
		TokenGroup:   relayInfo.TokenGroup,
		UsingGroup:   relayInfo.UsingGroup,
		ModelName:    relayInfo.OriginModelName,
		IsStream:     relayInfo.IsStream,
		RelayMode:    relayInfo.RelayMode,
		RequestPath:  relayInfo.RequestURLPath,
		ClientIp:     ctx.ClientIP(),
		IsSuccess:    false,
		StatusCode:   statusCode,
		ErrorType:    errType,
		ErrorMessage: truncateString(errMsg, 500),
		CreatedAt:    time.Now().UTC().Format("2006-01-02 15:04:05"),
	}

	if relayInfo.ChannelMeta != nil {
		log.ChannelId = relayInfo.ChannelId
		log.ChannelType = relayInfo.ChannelType
		log.UpstreamModel = relayInfo.UpstreamModelName
	}
	log.ChannelName = ctx.GetString("channel_name")
	log.UseTimeMs = time.Since(relayInfo.StartTime).Milliseconds()
	log.RetryCount = relayInfo.RetryIndex

	RecordDorisLog(log)
}

func truncateString(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen])
}
