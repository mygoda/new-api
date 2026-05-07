package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

// GetConditionalRatioFamilies 返回所有已注册的条件分价族元数据,
// 供前端「价格配置」UI 渲染编辑表单。
//
// admin-only(挂在 /api/option/ 群组内,RootAuth 已生效)。
func GetConditionalRatioFamilies(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    common.ListConditionalRatioFamilies(),
	})
}
