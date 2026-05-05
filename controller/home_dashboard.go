package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// GetHomeDashboard 是首页公开接口,返回首页所需的全部聚合数据。
// 无需鉴权,内部 5 分钟内存缓存,支持高并发首页打开。
func GetHomeDashboard(c *gin.Context) {
	d := service.GetHomeDashboard()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    d,
	})
}
