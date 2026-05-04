package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func ListHeartbeats(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	status, _ := strconv.Atoi(c.DefaultQuery("status", "0"))
	channelId, _ := strconv.Atoi(c.DefaultQuery("channel_id", "0"))
	modelName := c.Query("model")
	keyword := c.Query("keyword")

	items, total, err := model.ListHeartbeats(model.HeartbeatListFilter{
		Status:    status,
		ChannelId: channelId,
		Model:     modelName,
		Keyword:   keyword,
		Page:      page,
		PageSize:  pageSize,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items": items,
			"total": total,
		},
	})
}

func GetHeartbeat(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	hb, err := model.GetHeartbeatById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    hb,
	})
}

func PauseHeartbeat(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.PauseHeartbeat(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

func ResumeHeartbeat(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.ResumeHeartbeat(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

func TriggerHeartbeat(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.TriggerHeartbeat(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

type heartbeatUpdateRequest struct {
	SuccessThreshold *int `json:"success_threshold"`
	IntervalSeconds  *int `json:"interval_seconds"`
}

func UpdateHeartbeat(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req heartbeatUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if req.SuccessThreshold == nil && req.IntervalSeconds == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请至少提供成功阈值或检测间隔"})
		return
	}
	if err := model.UpdateHeartbeatConfig(id, req.SuccessThreshold, req.IntervalSeconds); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

func DeleteHeartbeat(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	hb, err := model.GetHeartbeatById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if _, err := model.UpdateAbilityEnabledByChannelModel(hb.ChannelId, hb.Model, true); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteHeartbeat(id); err != nil {
		common.ApiError(c, err)
		return
	}
	model.InitChannelCache()
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}
