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

// GetConditionalRatioDimensions 返回 v2 框架下所有已注册的维度元数据,
// 供前端「价格配置 v2」UI 在新增/编辑规则时渲染条件选择控件。
//
// 数据来源: 各 task adapter 在 init() 时调 common.RegisterDimension 注册。
func GetConditionalRatioDimensions(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    common.ListDimensions(),
	})
}
