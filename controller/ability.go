package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func GetAbilityList(c *gin.Context) {
	modelName := c.Query("model")
	group := c.Query("group")
	channelId, _ := strconv.Atoi(c.Query("channel_id"))
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	items, total, err := model.GetAbilityList(modelName, group, channelId, keyword, page, pageSize)
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

type AbilityUpdateRequest struct {
	Group     string `json:"group" binding:"required"`
	Model     string `json:"model" binding:"required"`
	ChannelId int    `json:"channel_id" binding:"required"`
	Priority  *int64 `json:"priority"`
	Weight    *uint  `json:"weight"`
}

func UpdateAbility(c *gin.Context) {
	var req AbilityUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "参数错误",
		})
		return
	}
	if req.Priority == nil && req.Weight == nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请至少提供优先级或权重",
		})
		return
	}
	err := model.UpdateAbilityPriorityWeight(req.Group, req.Model, req.ChannelId, req.Priority, req.Weight)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InitChannelCache()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}
