package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

func billingRecordsEnabled(c *gin.Context) bool {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		common.ApiErrorMsg(c, "账单功能未启用")
		return false
	}
	return true
}

func parseBillingRecordsFilter(c *gin.Context) service.BillingFilter {
	filter := service.BillingFilter{
		TokenName: c.Query("token_name"),
		ModelName: c.Query("model_name"),
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
	if v, err := strconv.ParseInt(c.Query("start_timestamp"), 10, 64); err == nil && v > 0 {
		filter.StartTime = time.Unix(v, 0).UTC().Format("2006-01-02 15:04:05")
	}
	if v, err := strconv.ParseInt(c.Query("end_timestamp"), 10, 64); err == nil && v > 0 {
		filter.EndTime = time.Unix(v, 0).UTC().Format("2006-01-02 15:04:05")
	}

	return filter
}

// GetBillingRecords returns billing records for admin.
func GetBillingRecords(c *gin.Context) {
	if !billingRecordsEnabled(c) {
		return
	}

	pageInfo := common.GetPageQuery(c)
	filter := parseBillingRecordsFilter(c)

	result, err := service.QueryBillingRecords(filter, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiErrorMsg(c, "查询账单失败: "+err.Error())
		return
	}

	pageInfo.SetTotal(result.Total)
	pageInfo.SetItems(result.Items)
	common.ApiSuccess(c, pageInfo)
}

// GetBillingRecordsSelf returns billing records for the current user.
func GetBillingRecordsSelf(c *gin.Context) {
	if !billingRecordsEnabled(c) {
		return
	}

	pageInfo := common.GetPageQuery(c)
	filter := parseBillingRecordsFilter(c)
	filter.UserId = c.GetInt("id")
	filter.ChannelId = 0

	result, err := service.QueryBillingRecords(filter, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiErrorMsg(c, "查询账单失败: "+err.Error())
		return
	}

	for i := range result.Items {
		result.Items[i].ChannelId = 0
		result.Items[i].ChannelName = ""
		result.Items[i].TokenKey = ""
	}

	pageInfo.SetTotal(result.Total)
	pageInfo.SetItems(result.Items)
	common.ApiSuccess(c, pageInfo)
}

// GetBillingSummary returns aggregated billing stats for admin.
func GetBillingSummary(c *gin.Context) {
	if !billingRecordsEnabled(c) {
		return
	}

	pageInfo := common.GetPageQuery(c)
	filter := parseBillingRecordsFilter(c)
	groupBy := c.DefaultQuery("group_by", "day")

	result, err := service.QueryBillingSummary(filter, groupBy, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiErrorMsg(c, "查询账单汇总失败: "+err.Error())
		return
	}

	pageInfo.SetTotal(result.Total)
	pageInfo.SetItems(result.Items)
	common.ApiSuccess(c, pageInfo)
}

// GetBillingSummarySelf returns aggregated billing stats for the current user.
func GetBillingSummarySelf(c *gin.Context) {
	if !billingRecordsEnabled(c) {
		return
	}

	pageInfo := common.GetPageQuery(c)
	filter := parseBillingRecordsFilter(c)
	filter.UserId = c.GetInt("id")
	filter.ChannelId = 0
	groupBy := c.DefaultQuery("group_by", "day")

	result, err := service.QueryBillingSummary(filter, groupBy, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiErrorMsg(c, "查询账单汇总失败: "+err.Error())
		return
	}

	pageInfo.SetTotal(result.Total)
	pageInfo.SetItems(result.Items)
	common.ApiSuccess(c, pageInfo)
}
