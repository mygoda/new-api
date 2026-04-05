package model

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"

	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

type Log struct {
	Id               int    `json:"id" gorm:"index:idx_created_at_id,priority:1;index:idx_user_id_id,priority:2"`
	UserId           int    `json:"user_id" gorm:"index;index:idx_user_id_id,priority:1"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint;index:idx_created_at_id,priority:2;index:idx_created_at_type"`
	Type             int    `json:"type" gorm:"index:idx_created_at_type"`
	Content          string `json:"content"`
	Username         string `json:"username" gorm:"index;index:index_username_model_name,priority:2;default:''"`
	TokenName        string `json:"token_name" gorm:"index;default:''"`
	ModelName        string `json:"model_name" gorm:"index;index:index_username_model_name,priority:1;default:''"`
	Quota            int    `json:"quota" gorm:"default:0"`
	PromptTokens     int    `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens int    `json:"completion_tokens" gorm:"default:0"`
	UseTime          int    `json:"use_time" gorm:"default:0"`
	IsStream         bool   `json:"is_stream"`
	ChannelId        int    `json:"channel" gorm:"index"`
	ChannelName      string `json:"channel_name" gorm:"->"`
	TokenId          int    `json:"token_id" gorm:"default:0;index"`
	Group            string `json:"group" gorm:"index"`
	Ip               string `json:"ip" gorm:"index;default:''"`
	RequestId        string `json:"request_id,omitempty" gorm:"type:varchar(64);index:idx_logs_request_id;default:''"`
	Other            string `json:"other"`
}

// don't use iota, avoid change log type value
const (
	LogTypeUnknown = 0
	LogTypeTopup   = 1
	LogTypeConsume = 2
	LogTypeManage  = 3
	LogTypeSystem  = 4
	LogTypeError   = 5
	LogTypeRefund  = 6
)

func formatUserLogs(logs []*Log, startIdx int) {
	for i := range logs {
		logs[i].ChannelName = ""
		var otherMap map[string]interface{}
		otherMap, _ = common.StrToMap(logs[i].Other)
		if otherMap != nil {
			// Remove admin-only debug fields.
			delete(otherMap, "admin_info")
			delete(otherMap, "reject_reason")
		}
		logs[i].Other = common.MapToJsonStr(otherMap)
		logs[i].Id = startIdx + i + 1
	}
}

func GetLogByTokenId(tokenId int) (logs []*Log, err error) {
	err = LOG_DB.Model(&Log{}).Where("token_id = ?", tokenId).Order("id desc").Limit(common.MaxRecentItems).Find(&logs).Error
	formatUserLogs(logs, 0)
	return logs, err
}

func RecordLog(userId int, logType int, content string) {
	if logType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(userId, false)
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   content,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		common.SysLog("failed to record log: " + err.Error())
	}
}

func RecordErrorLog(c *gin.Context, userId int, channelId int, modelName string, tokenName string, content string, tokenId int, useTimeSeconds int,
	isStream bool, group string, other map[string]interface{}) {
	logger.LogInfo(c, fmt.Sprintf("record error log: userId=%d, channelId=%d, modelName=%s, tokenName=%s, content=%s", userId, channelId, modelName, tokenName, content))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	otherStr := common.MapToJsonStr(other)
	// 判断是否需要记录 IP
	needRecordIp := false
	if settingMap, err := GetUserSetting(userId, false); err == nil {
		if settingMap.RecordIpLog {
			needRecordIp = true
		}
	}
	log := &Log{
		UserId:           userId,
		Username:         username,
		CreatedAt:        common.GetTimestamp(),
		Type:             LogTypeError,
		Content:          content,
		PromptTokens:     0,
		CompletionTokens: 0,
		TokenName:        tokenName,
		ModelName:        modelName,
		Quota:            0,
		ChannelId:        channelId,
		TokenId:          tokenId,
		UseTime:          useTimeSeconds,
		IsStream:         isStream,
		Group:            group,
		Ip: func() string {
			if needRecordIp {
				return c.ClientIP()
			}
			return ""
		}(),
		RequestId: requestId,
		Other:     otherStr,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
	}
}

type RecordConsumeLogParams struct {
	ChannelId        int                    `json:"channel_id"`
	PromptTokens     int                    `json:"prompt_tokens"`
	CompletionTokens int                    `json:"completion_tokens"`
	ModelName        string                 `json:"model_name"`
	TokenName        string                 `json:"token_name"`
	Quota            int                    `json:"quota"`
	Content          string                 `json:"content"`
	TokenId          int                    `json:"token_id"`
	UseTimeSeconds   int                    `json:"use_time_seconds"`
	IsStream         bool                   `json:"is_stream"`
	Group            string                 `json:"group"`
	Other            map[string]interface{} `json:"other"`
}

func RecordConsumeLog(c *gin.Context, userId int, params RecordConsumeLogParams) {
	if !common.LogConsumeEnabled {
		return
	}
	logger.LogInfo(c, fmt.Sprintf("record consume log: userId=%d, params=%s", userId, common.GetJsonString(params)))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	otherStr := common.MapToJsonStr(params.Other)
	// 判断是否需要记录 IP
	needRecordIp := false
	if settingMap, err := GetUserSetting(userId, false); err == nil {
		if settingMap.RecordIpLog {
			needRecordIp = true
		}
	}
	log := &Log{
		UserId:           userId,
		Username:         username,
		CreatedAt:        common.GetTimestamp(),
		Type:             LogTypeConsume,
		Content:          params.Content,
		PromptTokens:     params.PromptTokens,
		CompletionTokens: params.CompletionTokens,
		TokenName:        params.TokenName,
		ModelName:        params.ModelName,
		Quota:            params.Quota,
		ChannelId:        params.ChannelId,
		TokenId:          params.TokenId,
		UseTime:          params.UseTimeSeconds,
		IsStream:         params.IsStream,
		Group:            params.Group,
		Ip: func() string {
			if needRecordIp {
				return c.ClientIP()
			}
			return ""
		}(),
		RequestId: requestId,
		Other:     otherStr,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
	}
	if common.DataExportEnabled {
		gopool.Go(func() {
			LogQuotaData(userId, username, params.ModelName, params.Quota, common.GetTimestamp(), params.PromptTokens+params.CompletionTokens)
		})
	}
}

type RecordTaskBillingLogParams struct {
	UserId    int
	LogType   int
	Content   string
	ChannelId int
	ModelName string
	Quota     int
	TokenId   int
	Group     string
	Other     map[string]interface{}
}

func RecordTaskBillingLog(params RecordTaskBillingLogParams) {
	if params.LogType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(params.UserId, false)
	tokenName := ""
	if params.TokenId > 0 {
		if token, err := GetTokenById(params.TokenId); err == nil {
			tokenName = token.Name
		}
	}
	log := &Log{
		UserId:    params.UserId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      params.LogType,
		Content:   params.Content,
		TokenName: tokenName,
		ModelName: params.ModelName,
		Quota:     params.Quota,
		ChannelId: params.ChannelId,
		TokenId:   params.TokenId,
		Group:     params.Group,
		Other:     common.MapToJsonStr(params.Other),
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		common.SysLog("failed to record task billing log: " + err.Error())
	}
}

func GetAllLogs(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, startIdx int, num int, channel int, group string, requestId string) (logs []*Log, total int64, err error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB
	} else {
		tx = LOG_DB.Where("logs.type = ?", logType)
	}

	if modelName != "" {
		tx = tx.Where("logs.model_name like ?", modelName)
	}
	if username != "" {
		tx = tx.Where("logs.username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if channel != 0 {
		tx = tx.Where("logs.channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", group)
	}
	err = tx.Model(&Log{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = tx.Order("logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}

	channelIds := types.NewSet[int]()
	for _, log := range logs {
		if log.ChannelId != 0 {
			channelIds.Add(log.ChannelId)
		}
	}

	if channelIds.Len() > 0 {
		var channels []struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if common.MemoryCacheEnabled {
			// Cache get channel
			for _, channelId := range channelIds.Items() {
				if cacheChannel, err := CacheGetChannel(channelId); err == nil {
					channels = append(channels, struct {
						Id   int    `gorm:"column:id"`
						Name string `gorm:"column:name"`
					}{
						Id:   channelId,
						Name: cacheChannel.Name,
					})
				}
			}
		} else {
			// Bulk query channels from DB
			if err = DB.Table("channels").Select("id, name").Where("id IN ?", channelIds.Items()).Find(&channels).Error; err != nil {
				return logs, total, err
			}
		}
		channelMap := make(map[int]string, len(channels))
		for _, channel := range channels {
			channelMap[channel.Id] = channel.Name
		}
		for i := range logs {
			logs[i].ChannelName = channelMap[logs[i].ChannelId]
		}
	}

	return logs, total, err
}

const logSearchCountLimit = 10000

func GetUserLogs(userId int, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, startIdx int, num int, group string, requestId string) (logs []*Log, total int64, err error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB.Where("logs.user_id = ?", userId)
	} else {
		tx = LOG_DB.Where("logs.user_id = ? and logs.type = ?", userId, logType)
	}

	if modelName != "" {
		modelNamePattern, err := sanitizeLikePattern(modelName)
		if err != nil {
			return nil, 0, err
		}
		tx = tx.Where("logs.model_name LIKE ? ESCAPE '!'", modelNamePattern)
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", group)
	}
	err = tx.Model(&Log{}).Limit(logSearchCountLimit).Count(&total).Error
	if err != nil {
		common.SysError("failed to count user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}
	err = tx.Order("logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		common.SysError("failed to search user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}

	formatUserLogs(logs, startIdx)
	return logs, total, err
}

type Stat struct {
	Quota int `json:"quota"`
	Rpm   int `json:"rpm"`
	Tpm   int `json:"tpm"`
}

func SumUsedQuota(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, channel int, group string) (stat Stat, err error) {
	tx := LOG_DB.Table("logs").Select("sum(quota) quota")

	// 为rpm和tpm创建单独的查询
	rpmTpmQuery := LOG_DB.Table("logs").Select("count(*) rpm, sum(prompt_tokens) + sum(completion_tokens) tpm")

	if username != "" {
		tx = tx.Where("username = ?", username)
		rpmTpmQuery = rpmTpmQuery.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
		rpmTpmQuery = rpmTpmQuery.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		modelNamePattern, err := sanitizeLikePattern(modelName)
		if err != nil {
			return stat, err
		}
		tx = tx.Where("model_name LIKE ? ESCAPE '!'", modelNamePattern)
		rpmTpmQuery = rpmTpmQuery.Where("model_name LIKE ? ESCAPE '!'", modelNamePattern)
	}
	if channel != 0 {
		tx = tx.Where("channel_id = ?", channel)
		rpmTpmQuery = rpmTpmQuery.Where("channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where(logGroupCol+" = ?", group)
		rpmTpmQuery = rpmTpmQuery.Where(logGroupCol+" = ?", group)
	}

	tx = tx.Where("type = ?", LogTypeConsume)
	rpmTpmQuery = rpmTpmQuery.Where("type = ?", LogTypeConsume)

	// 只统计最近60秒的rpm和tpm
	rpmTpmQuery = rpmTpmQuery.Where("created_at >= ?", time.Now().Add(-60*time.Second).Unix())

	// 执行查询
	if err := tx.Scan(&stat).Error; err != nil {
		common.SysError("failed to query log stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}
	if err := rpmTpmQuery.Scan(&stat).Error; err != nil {
		common.SysError("failed to query rpm/tpm stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}

	return stat, nil
}

func SumUsedToken(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string) (token int) {
	tx := LOG_DB.Table("logs").Select("ifnull(sum(prompt_tokens),0) + ifnull(sum(completion_tokens),0)")
	if username != "" {
		tx = tx.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		tx = tx.Where("model_name = ?", modelName)
	}
	tx.Where("type = ?", LogTypeConsume).Scan(&token)
	return token
}

// ChannelStats represents aggregated performance metrics per channel
type ChannelStats struct {
	ChannelId           int                     `json:"channel_id"`
	ChannelName         string                  `json:"channel_name" gorm:"-"`
	TotalRequests       int64                   `json:"total_requests"`
	ErrorRequests      int64                   `json:"error_requests"`
	ErrorRate           float64                 `json:"error_rate" gorm:"-"`
	AvgLatency          float64                 `json:"avg_latency"`
	MaxLatency          float64                 `json:"max_latency"`
	MinLatency          float64                 `json:"min_latency"`
	LatencyP50          float64                 `json:"latency_p50"`
	LatencyP90          float64                 `json:"latency_p90"`
	LatencyP95          float64                 `json:"latency_p95"`
	StreamRequestCount  int64                   `json:"stream_request_count"`
	StreamRatio         float64                 `json:"stream_ratio" gorm:"-"`
	AvgTokensPerRequest float64                 `json:"avg_tokens_per_request" gorm:"-"`
	TotalQuota          int64                   `json:"total_quota"`
	TotalTokens         int64                   `json:"total_tokens"`
	QPS                 float64                 `json:"qps" gorm:"-"`
	TPM                 float64                 `json:"tpm" gorm:"-"`
	Availability        float64                 `json:"availability" gorm:"-"`
	HealthScore         float64                 `json:"health_score" gorm:"-"`
	ErrorBreakdown      map[string]int64        `json:"error_breakdown" gorm:"-"`
	ConsecutiveFailures int64                   `json:"consecutive_failures"`
	IsHealthy           bool                    `json:"is_healthy" gorm:"-"`
}

// ModelPerformanceStats represents aggregated performance metrics per model for a user
type ModelPerformanceStats struct {
	ModelName           string  `json:"model_name"`
	TotalRequests       int64   `json:"total_requests"`
	ErrorRequests       int64   `json:"error_requests"`
	ErrorRate           float64 `json:"error_rate" gorm:"-"`
	AvgLatency          float64 `json:"avg_latency"`
	MaxLatency          float64 `json:"max_latency"`
	MinLatency          float64 `json:"min_latency"`
	LatencyP50          float64 `json:"latency_p50"`
	LatencyP90          float64 `json:"latency_p90"`
	LatencyP95          float64 `json:"latency_p95"`
	StreamRequestCount  int64   `json:"stream_request_count"`
	StreamRatio         float64 `json:"stream_ratio" gorm:"-"`
	AvgTokensPerRequest float64 `json:"avg_tokens_per_request" gorm:"-"`
	TotalTokens         int64   `json:"total_tokens"`
}

// 错误类型分类常量
const (
	ErrorTypeTimeout        = "timeout"
	ErrorTypeRateLimit      = "rate_limit"
	ErrorTypeAuth           = "auth"
	ErrorTypeQuota          = "quota"
	ErrorTypeServerError     = "server_error"
	ErrorTypeChannelUnavail = "channel_unavailable"
	ErrorTypeInvalidParam    = "invalid_param"
	ErrorTypeNetwork        = "network"
	ErrorTypeUnknown        = "unknown"
)

// classifyError 根据错误内容分类错误类型
func classifyError(content string) string {
	contentLower := strings.ToLower(content)
	switch {
	case strings.Contains(contentLower, "timeout") ||
		strings.Contains(contentLower, "timed out") ||
		strings.Contains(contentLower, "deadline exceeded"):
		return ErrorTypeTimeout
	case strings.Contains(contentLower, "rate limit") ||
		strings.Contains(contentLower, "rate_limit") ||
		strings.Contains(contentLower, "too many request") ||
		strings.Contains(contentLower, "quota exceed"):
		return ErrorTypeRateLimit
	case strings.Contains(contentLower, "auth") ||
		strings.Contains(contentLower, "unauthorized") ||
		strings.Contains(contentLower, "invalid api key") ||
		strings.Contains(contentLower, "permission"):
		return ErrorTypeAuth
	case strings.Contains(contentLower, "quota") ||
		strings.Contains(contentLower, "balance") ||
		strings.Contains(contentLower, "insufficient"):
		return ErrorTypeQuota
	case strings.Contains(contentLower, "internal server error") ||
		strings.Contains(contentLower, "500") ||
		strings.Contains(contentLower, "502") ||
		strings.Contains(contentLower, "503") ||
		strings.Contains(contentLower, "server error"):
		return ErrorTypeServerError
	case strings.Contains(contentLower, "channel") &&
		(strings.Contains(contentLower, "unavailable") ||
			strings.Contains(contentLower, "not found") ||
			strings.Contains(contentLower, "not available")):
		return ErrorTypeChannelUnavail
	case strings.Contains(contentLower, "invalid") ||
		strings.Contains(contentLower, "parameter") ||
		strings.Contains(contentLower, "bad request") ||
		strings.Contains(contentLower, "validation"):
		return ErrorTypeInvalidParam
	case strings.Contains(contentLower, "network") ||
		strings.Contains(contentLower, "connection") ||
		strings.Contains(contentLower, "eof") ||
		strings.Contains(contentLower, "refused"):
		return ErrorTypeNetwork
	default:
		return ErrorTypeUnknown
	}
}

func streamRequestSumExpr() string {
	if common.UsingPostgreSQL {
		return "SUM(CASE WHEN is_stream IS TRUE THEN 1 ELSE 0 END) as stream_request_count"
	}
	return "SUM(CASE WHEN is_stream <> 0 THEN 1 ELSE 0 END) as stream_request_count"
}

// percentileExpr 返回分位数表达式，兼容 PostgreSQL/MySQL/SQLite
// percentile: 0.5 表示 P50, 0.9 表示 P90, 0.95 表示 P95
// 注意：MySQL 8.0.28+ 才支持 PERCENTILE_CONT，因此统一使用 Go 后处理方式计算分位数
func percentileExpr(percentile float64) string {
	if common.UsingPostgreSQL {
		return fmt.Sprintf("PERCENTILE_CONT(%g) WITHIN GROUP (ORDER BY use_time)", percentile)
	}
	// MySQL 和 SQLite: 分位数通过 Go 后处理计算（见 GetChannelStats 函数中的 SQLite 处理逻辑）
	return "NULL"
}

// percentileExprForModel 返回模型分位数表达式
func percentileExprForModel(percentile float64) string {
	if common.UsingPostgreSQL {
		return fmt.Sprintf("PERCENTILE_CONT(%g) WITHIN GROUP (ORDER BY use_time)", percentile)
	}
	return "NULL"
}

func GetChannelStats(startTimestamp int64, endTimestamp int64) ([]ChannelStats, error) {
	streamSum := streamRequestSumExpr()

	// PostgreSQL/MySQL 支持 PERCENTILE_CONT，SQLite 需要后处理
	var selectConsume string
	if common.UsingSQLite {
		selectConsume = fmt.Sprintf(
			"channel_id, COUNT(*) as total_requests, AVG(use_time) as avg_latency, MAX(use_time) as max_latency, MIN(NULLIF(use_time, 0)) as min_latency, SUM(quota) as total_quota, SUM(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) as total_tokens, %s",
			streamSum,
		)
	} else {
		// PostgreSQL/MySQL: 直接在 SQL 中计算分位数
		selectConsume = fmt.Sprintf(
			"channel_id, COUNT(*) as total_requests, AVG(use_time) as avg_latency, MAX(use_time) as max_latency, MIN(NULLIF(use_time, 0)) as min_latency, SUM(quota) as total_quota, SUM(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) as total_tokens, %s, %s as latency_p50, %s as latency_p90, %s as latency_p95",
			streamSum,
			percentileExpr(0.5),
			percentileExpr(0.9),
			percentileExpr(0.95),
		)
	}

	var consumeStats []ChannelStats
	consumeQuery := LOG_DB.Table("logs").
		Select(selectConsume).
		Where("type = ? AND channel_id > 0", LogTypeConsume)
	if startTimestamp != 0 {
		consumeQuery = consumeQuery.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		consumeQuery = consumeQuery.Where("created_at <= ?", endTimestamp)
	}
	if err := consumeQuery.Group("channel_id").Find(&consumeStats).Error; err != nil {
		return nil, err
	}

	// PostgreSQL 直接用 SQL 计算分位数，MySQL/SQLite 通过 Go 后处理计算
	if !common.UsingPostgreSQL {
		for i := range consumeStats {
			var latencyVals []float64
			latencyQuery := LOG_DB.Table("logs").
				Select("use_time").
				Where("type = ? AND channel_id = ? AND use_time > 0", LogTypeConsume, consumeStats[i].ChannelId)
			if startTimestamp != 0 {
				latencyQuery = latencyQuery.Where("created_at >= ?", startTimestamp)
			}
			if endTimestamp != 0 {
				latencyQuery = latencyQuery.Where("created_at <= ?", endTimestamp)
			}
			if err := latencyQuery.Order("use_time").Find(&latencyVals).Error; err == nil && len(latencyVals) > 0 {
				consumeStats[i].LatencyP50 = percentileCalculate(latencyVals, 0.5)
				consumeStats[i].LatencyP90 = percentileCalculate(latencyVals, 0.9)
				consumeStats[i].LatencyP95 = percentileCalculate(latencyVals, 0.95)
			}
		}
	}

	type errorCount struct {
		ChannelId     int   `json:"channel_id"`
		ErrorRequests int64 `json:"error_requests"`
	}
	var errorStats []errorCount
	errorQuery := LOG_DB.Table("logs").
		Select("channel_id, COUNT(*) as error_requests").
		Where("type = ? AND channel_id > 0", LogTypeError)
	if startTimestamp != 0 {
		errorQuery = errorQuery.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		errorQuery = errorQuery.Where("created_at <= ?", endTimestamp)
	}
	if err := errorQuery.Group("channel_id").Find(&errorStats).Error; err != nil {
		return nil, err
	}

	errorMap := make(map[int]int64, len(errorStats))
	for _, e := range errorStats {
		errorMap[e.ChannelId] = e.ErrorRequests
	}

	// 获取错误日志详情用于错误类型分类
	type errorLogContent struct {
		ChannelId int
		Content   string
		CreatedAt int64
	}
	var errorLogs []errorLogContent
	errorLogsQuery := LOG_DB.Table("logs").
		Select("channel_id, content, created_at").
		Where("type = ? AND channel_id > 0", LogTypeError)
	if startTimestamp != 0 {
		errorLogsQuery = errorLogsQuery.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		errorLogsQuery = errorLogsQuery.Where("created_at <= ?", endTimestamp)
	}
	if err := errorLogsQuery.Order("created_at desc").Find(&errorLogs).Error; err != nil {
		// 如果出错，继续处理不影响主流程
	}

	// 按渠道分组错误日志，并统计错误类型
	errorBreakdownMap := make(map[int]map[string]int64)
	consecutiveFailuresMap := make(map[int]int64)
	for _, log := range errorLogs {
		if _, ok := errorBreakdownMap[log.ChannelId]; !ok {
			errorBreakdownMap[log.ChannelId] = make(map[string]int64)
		}
		errorType := classifyError(log.Content)
		errorBreakdownMap[log.ChannelId][errorType]++
	}

	// 计算连续失败次数（从最新的错误日志往前数）
	for channelId := range errorBreakdownMap {
		var consecutiveCount int64
		for _, log := range errorLogs {
			if log.ChannelId != channelId {
				continue
			}
			consecutiveCount++
		}
		consecutiveFailuresMap[channelId] = consecutiveCount
	}

	// 计算时间范围（秒），用于 QPS/TPM 计算
	timeRange := endTimestamp - startTimestamp
	if timeRange <= 0 {
		timeRange = 86400 // 默认 24 小时
	}

	seenConsume := make(map[int]struct{}, len(consumeStats))
	for i := range consumeStats {
		seenConsume[consumeStats[i].ChannelId] = struct{}{}
		if errCount, ok := errorMap[consumeStats[i].ChannelId]; ok {
			consumeStats[i].ErrorRequests = errCount
		}
		total := consumeStats[i].TotalRequests + consumeStats[i].ErrorRequests
		if total > 0 {
			consumeStats[i].ErrorRate = float64(consumeStats[i].ErrorRequests) / float64(total)
		}
		if consumeStats[i].TotalRequests > 0 {
			consumeStats[i].AvgTokensPerRequest = float64(consumeStats[i].TotalTokens) / float64(consumeStats[i].TotalRequests)
			consumeStats[i].StreamRatio = float64(consumeStats[i].StreamRequestCount) / float64(consumeStats[i].TotalRequests)
			// QPS = 总请求数 / 时间范围秒数
			consumeStats[i].QPS = float64(consumeStats[i].TotalRequests) / float64(timeRange)
			// TPM = 总 Token 数 / 时间范围分钟数
			consumeStats[i].TPM = float64(consumeStats[i].TotalTokens) / (float64(timeRange) / 60.0)
		}
		// 可用率 = 1 - 错误率
		consumeStats[i].Availability = 1 - consumeStats[i].ErrorRate
		// 健康度评分 = 可用率(30%) * 100 + 延迟得分(40%) + 错误率得分(30%)
		// 延迟得分：假设 1s 以内为满分，线性递减
		latencyScore := 1.0
		if consumeStats[i].AvgLatency > 0 {
			latencyScore = 1.0 / (1.0 + consumeStats[i].AvgLatency/2.0)
		}
		errorScore := 1.0 - consumeStats[i].ErrorRate
		consumeStats[i].HealthScore = consumeStats[i].Availability*100*0.3 + latencyScore*100*0.4 + errorScore*100*0.3
		// 添加错误类型分布
		if breakdown, ok := errorBreakdownMap[consumeStats[i].ChannelId]; ok {
			consumeStats[i].ErrorBreakdown = breakdown
		}
		// 添加连续失败次数
		if cf, ok := consecutiveFailuresMap[consumeStats[i].ChannelId]; ok {
			consumeStats[i].ConsecutiveFailures = cf
		}
		// 标记是否健康：健康度 >= 70 且错误率 < 10%
		consumeStats[i].IsHealthy = consumeStats[i].HealthScore >= 70 && consumeStats[i].ErrorRate < 0.1
	}

	// 仅有错误、无成功消费记录的渠道也要展示，便于 MaaS 运维发现「全失败」渠道
	for _, e := range errorStats {
		if _, ok := seenConsume[e.ChannelId]; ok {
			continue
		}
		newChannel := ChannelStats{
			ChannelId:     e.ChannelId,
			ErrorRequests: e.ErrorRequests,
			ErrorRate:     1,
			Availability:  0,
			HealthScore:   0,
			IsHealthy:     false,
		}
		if breakdown, ok := errorBreakdownMap[e.ChannelId]; ok {
			newChannel.ErrorBreakdown = breakdown
		}
		if cf, ok := consecutiveFailuresMap[e.ChannelId]; ok {
			newChannel.ConsecutiveFailures = cf
		}
		consumeStats = append(consumeStats, newChannel)
	}

	channelIds := types.NewSet[int]()
	for i := range consumeStats {
		channelIds.Add(consumeStats[i].ChannelId)
	}
	if channelIds.Len() > 0 {
		var channels []struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if common.MemoryCacheEnabled {
			for _, channelId := range channelIds.Items() {
				if cacheChannel, err := CacheGetChannel(channelId); err == nil {
					channels = append(channels, struct {
						Id   int    `gorm:"column:id"`
						Name string `gorm:"column:name"`
					}{
						Id:   channelId,
						Name: cacheChannel.Name,
					})
				}
			}
		} else {
			if err := DB.Table("channels").Select("id, name").Where("id IN ?", channelIds.Items()).Find(&channels).Error; err != nil {
				return consumeStats, nil
			}
		}
		channelMap := make(map[int]string, len(channels))
		for _, ch := range channels {
			channelMap[ch.Id] = ch.Name
		}
		for i := range consumeStats {
			consumeStats[i].ChannelName = channelMap[consumeStats[i].ChannelId]
		}
	}

	return consumeStats, nil
}

// percentileCalculate 从已排序的数值切片中计算分位数
func percentileCalculate(sortedVals []float64, percentile float64) float64 {
	if len(sortedVals) == 0 {
		return 0
	}
	idx := percentile * float64(len(sortedVals)-1)
	lower := int(idx)
	upper := lower + 1
	if upper >= len(sortedVals) {
		return sortedVals[len(sortedVals)-1]
	}
	frac := idx - float64(lower)
	return sortedVals[lower]*(1-frac) + sortedVals[upper]*frac
}

func GetModelPerformanceStats(userId int, startTimestamp int64, endTimestamp int64) ([]ModelPerformanceStats, error) {
	streamSum := streamRequestSumExpr()
	selectConsume := fmt.Sprintf(
		"model_name, COUNT(*) as total_requests, AVG(use_time) as avg_latency, MAX(use_time) as max_latency, MIN(NULLIF(use_time, 0)) as min_latency, SUM(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) as total_tokens, %s",
		streamSum,
	)

	var consumeStats []ModelPerformanceStats
	consumeQuery := LOG_DB.Table("logs").
		Select(selectConsume).
		Where("type = ? AND user_id = ?", LogTypeConsume, userId)
	if startTimestamp != 0 {
		consumeQuery = consumeQuery.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		consumeQuery = consumeQuery.Where("created_at <= ?", endTimestamp)
	}
	if err := consumeQuery.Group("model_name").Find(&consumeStats).Error; err != nil {
		return nil, err
	}

	type errorCount struct {
		ModelName     string `json:"model_name"`
		ErrorRequests int64  `json:"error_requests"`
	}
	var errorStats []errorCount
	errorQuery := LOG_DB.Table("logs").
		Select("model_name, COUNT(*) as error_requests").
		Where("type = ? AND user_id = ?", LogTypeError, userId)
	if startTimestamp != 0 {
		errorQuery = errorQuery.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		errorQuery = errorQuery.Where("created_at <= ?", endTimestamp)
	}
	if err := errorQuery.Group("model_name").Find(&errorStats).Error; err != nil {
		return nil, err
	}

	errorMap := make(map[string]int64, len(errorStats))
	for _, e := range errorStats {
		errorMap[e.ModelName] = e.ErrorRequests
	}

	seenModel := make(map[string]struct{}, len(consumeStats))
	for i := range consumeStats {
		seenModel[consumeStats[i].ModelName] = struct{}{}
		if errCount, ok := errorMap[consumeStats[i].ModelName]; ok {
			consumeStats[i].ErrorRequests = errCount
		}
		total := consumeStats[i].TotalRequests + consumeStats[i].ErrorRequests
		if total > 0 {
			consumeStats[i].ErrorRate = float64(consumeStats[i].ErrorRequests) / float64(total)
		}
		if consumeStats[i].TotalRequests > 0 {
			consumeStats[i].AvgTokensPerRequest = float64(consumeStats[i].TotalTokens) / float64(consumeStats[i].TotalRequests)
			consumeStats[i].StreamRatio = float64(consumeStats[i].StreamRequestCount) / float64(consumeStats[i].TotalRequests)
		}
	}

	for _, e := range errorStats {
		if e.ModelName == "" {
			continue
		}
		if _, ok := seenModel[e.ModelName]; ok {
			continue
		}
		consumeStats = append(consumeStats, ModelPerformanceStats{
			ModelName:     e.ModelName,
			ErrorRequests: e.ErrorRequests,
			ErrorRate:     1,
		})
	}

	return consumeStats, nil
}

// ModelChannelCrossStats represents aggregated performance metrics per model-channel combination
type ModelChannelCrossStats struct {
	ModelName           string  `json:"model_name"`
	ChannelId           int     `json:"channel_id"`
	ChannelName         string  `json:"channel_name" gorm:"-"`
	TotalRequests       int64   `json:"total_requests"`
	ErrorRequests       int64   `json:"error_requests"`
	ErrorRate           float64 `json:"error_rate" gorm:"-"`
	AvgLatency          float64 `json:"avg_latency"`
	MaxLatency          float64 `json:"max_latency"`
	MinLatency          float64 `json:"min_latency"`
	LatencyP50          float64 `json:"latency_p50"`
	LatencyP90          float64 `json:"latency_p90"`
	LatencyP95          float64 `json:"latency_p95"`
	StreamRequestCount  int64   `json:"stream_request_count"`
	StreamRatio         float64 `json:"stream_ratio" gorm:"-"`
	AvgTokensPerRequest float64 `json:"avg_tokens_per_request" gorm:"-"`
	TotalQuota          int64   `json:"total_quota"`
	TotalTokens         int64   `json:"total_tokens"`
}

func GetModelChannelCrossStats(modelName string, startTimestamp int64, endTimestamp int64) ([]ModelChannelCrossStats, error) {
	streamSum := streamRequestSumExpr()

	var selectConsume string
	if common.UsingSQLite {
		selectConsume = fmt.Sprintf(
			"model_name, channel_id, COUNT(*) as total_requests, AVG(use_time) as avg_latency, MAX(use_time) as max_latency, MIN(NULLIF(use_time, 0)) as min_latency, SUM(quota) as total_quota, SUM(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) as total_tokens, %s",
			streamSum,
		)
	} else {
		selectConsume = fmt.Sprintf(
			"model_name, channel_id, COUNT(*) as total_requests, AVG(use_time) as avg_latency, MAX(use_time) as max_latency, MIN(NULLIF(use_time, 0)) as min_latency, SUM(quota) as total_quota, SUM(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) as total_tokens, %s, %s as latency_p50, %s as latency_p90, %s as latency_p95",
			streamSum,
			percentileExpr(0.5),
			percentileExpr(0.9),
			percentileExpr(0.95),
		)
	}

	var consumeStats []ModelChannelCrossStats
	consumeQuery := LOG_DB.Table("logs").
		Select(selectConsume).
		Where("type = ? AND channel_id > 0", LogTypeConsume)
	if modelName != "" {
		consumeQuery = consumeQuery.Where("model_name = ?", modelName)
	}
	if startTimestamp != 0 {
		consumeQuery = consumeQuery.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		consumeQuery = consumeQuery.Where("created_at <= ?", endTimestamp)
	}
	if err := consumeQuery.Group("model_name, channel_id").Find(&consumeStats).Error; err != nil {
		return nil, err
	}

	// 非 PostgreSQL: 后处理计算分位数
	if !common.UsingPostgreSQL {
		for i := range consumeStats {
			var latencyVals []float64
			latencyQuery := LOG_DB.Table("logs").
				Select("use_time").
				Where("type = ? AND channel_id = ? AND model_name = ? AND use_time > 0", LogTypeConsume, consumeStats[i].ChannelId, consumeStats[i].ModelName)
			if startTimestamp != 0 {
				latencyQuery = latencyQuery.Where("created_at >= ?", startTimestamp)
			}
			if endTimestamp != 0 {
				latencyQuery = latencyQuery.Where("created_at <= ?", endTimestamp)
			}
			if err := latencyQuery.Order("use_time").Find(&latencyVals).Error; err == nil && len(latencyVals) > 0 {
				consumeStats[i].LatencyP50 = percentileCalculate(latencyVals, 0.5)
				consumeStats[i].LatencyP90 = percentileCalculate(latencyVals, 0.9)
				consumeStats[i].LatencyP95 = percentileCalculate(latencyVals, 0.95)
			}
		}
	}

	type errorCount struct {
		ModelName     string `json:"model_name"`
		ChannelId     int    `json:"channel_id"`
		ErrorRequests int64  `json:"error_requests"`
	}
	var errorStats []errorCount
	errorQuery := LOG_DB.Table("logs").
		Select("model_name, channel_id, COUNT(*) as error_requests").
		Where("type = ? AND channel_id > 0", LogTypeError)
	if modelName != "" {
		errorQuery = errorQuery.Where("model_name = ?", modelName)
	}
	if startTimestamp != 0 {
		errorQuery = errorQuery.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		errorQuery = errorQuery.Where("created_at <= ?", endTimestamp)
	}
	if err := errorQuery.Group("model_name, channel_id").Find(&errorStats).Error; err != nil {
		return nil, err
	}

	type crossKey struct {
		ModelName string
		ChannelId int
	}
	errorMap := make(map[crossKey]int64, len(errorStats))
	for _, e := range errorStats {
		errorMap[crossKey{e.ModelName, e.ChannelId}] = e.ErrorRequests
	}

	seenKeys := make(map[crossKey]struct{}, len(consumeStats))
	for i := range consumeStats {
		key := crossKey{consumeStats[i].ModelName, consumeStats[i].ChannelId}
		seenKeys[key] = struct{}{}
		if errCount, ok := errorMap[key]; ok {
			consumeStats[i].ErrorRequests = errCount
		}
		total := consumeStats[i].TotalRequests + consumeStats[i].ErrorRequests
		if total > 0 {
			consumeStats[i].ErrorRate = float64(consumeStats[i].ErrorRequests) / float64(total)
		}
		if consumeStats[i].TotalRequests > 0 {
			consumeStats[i].AvgTokensPerRequest = float64(consumeStats[i].TotalTokens) / float64(consumeStats[i].TotalRequests)
			consumeStats[i].StreamRatio = float64(consumeStats[i].StreamRequestCount) / float64(consumeStats[i].TotalRequests)
		}
	}

	// 仅有错误的 model-channel 组合
	for _, e := range errorStats {
		key := crossKey{e.ModelName, e.ChannelId}
		if _, ok := seenKeys[key]; ok {
			continue
		}
		consumeStats = append(consumeStats, ModelChannelCrossStats{
			ModelName:     e.ModelName,
			ChannelId:     e.ChannelId,
			ErrorRequests: e.ErrorRequests,
			ErrorRate:     1,
		})
	}

	// 填充渠道名称
	channelIds := types.NewSet[int]()
	for i := range consumeStats {
		channelIds.Add(consumeStats[i].ChannelId)
	}
	if channelIds.Len() > 0 {
		var channels []struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if common.MemoryCacheEnabled {
			for _, channelId := range channelIds.Items() {
				if cacheChannel, err := CacheGetChannel(channelId); err == nil {
					channels = append(channels, struct {
						Id   int    `gorm:"column:id"`
						Name string `gorm:"column:name"`
					}{
						Id:   channelId,
						Name: cacheChannel.Name,
					})
				}
			}
		} else {
			DB.Table("channels").Select("id, name").Where("id IN ?", channelIds.Items()).Find(&channels)
		}
		channelMap := make(map[int]string, len(channels))
		for _, ch := range channels {
			channelMap[ch.Id] = ch.Name
		}
		for i := range consumeStats {
			consumeStats[i].ChannelName = channelMap[consumeStats[i].ChannelId]
		}
	}

	return consumeStats, nil
}

func DeleteOldLog(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	var total int64 = 0

	for {
		if nil != ctx.Err() {
			return total, ctx.Err()
		}

		result := LOG_DB.Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&Log{})
		if nil != result.Error {
			return total, result.Error
		}

		total += result.RowsAffected

		if result.RowsAffected < int64(limit) {
			break
		}
	}

	return total, nil
}
