package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

func GetDorisLogs(c *gin.Context) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		common.ApiErrorMsg(c, "Doris 日志功能未启用")
		return
	}

	pageInfo := common.GetPageQuery(c)

	filter := service.DorisLogFilter{
		RequestId: c.Query("request_id"),
		TokenName: c.Query("token_name"),
		TokenKey:  c.Query("token_key"),
		ModelName: c.Query("model_name"),
		UserGroup: c.Query("group"),
		ClientIp:  c.Query("client_ip"),
	}

	if v, err := strconv.Atoi(c.Query("user_id")); err == nil && v > 0 {
		filter.UserId = v
	}
	if v, err := strconv.Atoi(c.Query("token_id")); err == nil && v > 0 {
		filter.TokenId = v
	}
	if v, err := strconv.Atoi(c.Query("channel")); err == nil && v > 0 {
		filter.ChannelId = v
	}
	if v := c.Query("is_success"); v == "true" {
		b := true
		filter.IsSuccess = &b
	} else if v == "false" {
		b := false
		filter.IsSuccess = &b
	}

	if v, err := strconv.ParseInt(c.Query("start_timestamp"), 10, 64); err == nil && v > 0 {
		filter.StartTime = time.Unix(v, 0).UTC().Format("2006-01-02 15:04:05")
	}
	if v, err := strconv.ParseInt(c.Query("end_timestamp"), 10, 64); err == nil && v > 0 {
		filter.EndTime = time.Unix(v, 0).UTC().Format("2006-01-02 15:04:05")
	}

	result, err := service.QueryDorisLogs(filter, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiErrorMsg(c, "查询 Doris 日志失败: "+err.Error())
		return
	}

	pageInfo.SetTotal(result.Total)
	pageInfo.SetItems(result.Items)
	common.ApiSuccess(c, pageInfo)
}

func GetDorisLogsSelf(c *gin.Context) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		common.ApiErrorMsg(c, "Doris 日志功能未启用")
		return
	}

	pageInfo := common.GetPageQuery(c)
	userId := c.GetInt("id")

	filter := service.DorisLogFilter{
		UserId:    userId,
		RequestId: c.Query("request_id"),
		TokenName: c.Query("token_name"),
		TokenKey:  c.Query("token_key"),
		ModelName: c.Query("model_name"),
		UserGroup: c.Query("group"),
	}

	if v, err := strconv.Atoi(c.Query("token_id")); err == nil && v > 0 {
		filter.TokenId = v
	}
	if v := c.Query("is_success"); v == "true" {
		b := true
		filter.IsSuccess = &b
	} else if v == "false" {
		b := false
		filter.IsSuccess = &b
	}

	if v, err := strconv.ParseInt(c.Query("start_timestamp"), 10, 64); err == nil && v > 0 {
		filter.StartTime = time.Unix(v, 0).UTC().Format("2006-01-02 15:04:05")
	}
	if v, err := strconv.ParseInt(c.Query("end_timestamp"), 10, 64); err == nil && v > 0 {
		filter.EndTime = time.Unix(v, 0).UTC().Format("2006-01-02 15:04:05")
	}

	result, err := service.QueryDorisLogs(filter, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiErrorMsg(c, "查询 Doris 日志失败: "+err.Error())
		return
	}

	for i := range result.Items {
		result.Items[i].ClientIp = ""
		result.Items[i].ChannelId = 0
		result.Items[i].ChannelType = 0
		result.Items[i].ChannelName = ""
		result.Items[i].UpstreamModel = ""
		result.Items[i].TokenKey = ""
	}

	pageInfo.SetTotal(result.Total)
	pageInfo.SetItems(result.Items)
	common.ApiSuccess(c, pageInfo)
}
