package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetCreationAssets 获取用户的作品列表（分页）
// GET /api/creation/assets?page=1&size=50&modality=image&status=success
func GetCreationAssets(c *gin.Context) {
	userID := c.GetInt("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "50"))
	if size > 200 {
		size = 200
	}
	modality := c.Query("modality")
	status := c.Query("status")

	db := model.DB.Where("user_id = ?", userID)
	if modality != "" {
		db = db.Where("modality = ?", modality)
	}
	if status != "" {
		db = db.Where("status = ?", status)
	}

	var total int64
	db.Model(&model.CreationAsset{}).Count(&total)

	var assets []model.CreationAsset
	offset := (page - 1) * size
	err := db.Order("created_at DESC").Limit(size).Offset(offset).Find(&assets).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items": assets,
			"total": total,
			"page":  page,
			"size":  size,
		},
	})
}

// CreateCreationAsset 创建一条作品记录
// POST /api/creation/assets
func CreateCreationAsset(c *gin.Context) {
	userID := c.GetInt("id")
	var req model.CreationAsset
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的参数",
		})
		return
	}
	req.UserID = userID
	if err := model.DB.Create(&req).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    req,
	})
}

// UpdateCreationAsset 更新作品（仅允许更新自己的）
// PUT /api/creation/assets/:id
func UpdateCreationAsset(c *gin.Context) {
	userID := c.GetInt("id")
	id, _ := strconv.Atoi(c.Param("id"))
	var existing model.CreationAsset
	if err := model.DB.Where("id = ? AND user_id = ?", id, userID).First(&existing).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "作品不存在或无权限",
		})
		return
	}
	var req model.CreationAsset
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的参数",
		})
		return
	}
	// 只允许更新部分字段
	updates := map[string]interface{}{
		"asset_url": req.AssetURL,
		"status":    req.Status,
		"task_id":   req.TaskID,
	}
	if err := model.DB.Model(&existing).Updates(updates).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// DeleteCreationAsset 删除作品
// DELETE /api/creation/assets/:id
func DeleteCreationAsset(c *gin.Context) {
	userID := c.GetInt("id")
	id, _ := strconv.Atoi(c.Param("id"))
	result := model.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.CreationAsset{})
	if result.Error != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": result.Error.Error(),
		})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "作品不存在或无权限",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}
