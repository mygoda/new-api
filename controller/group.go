package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func GetGroups(c *gin.Context) {
	groupNames := make([]string, 0)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		groupNames = append(groupNames, groupName)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
}

func GetUserGroups(c *gin.Context) {
	usableGroups := make(map[string]map[string]interface{})
	userId := c.GetInt("id")
	userGroup, _ := model.GetUserGroup(userId, false)
	userRole := c.GetInt("role")

	if userRole >= common.RoleAdminUser {
		// 管理员可以看到全部分组
		for groupName := range ratio_setting.GetGroupRatioCopy() {
			usableGroups[groupName] = map[string]interface{}{
				"ratio": ratio_setting.GetGroupRatio(groupName),
				"desc":  setting.GetUsableGroupDescription(groupName),
			}
		}
	} else {
		// 普通用户只能看到自己所在的分组
		if userGroup != "" {
			usableGroups[userGroup] = map[string]interface{}{
				"ratio": ratio_setting.GetGroupRatio(userGroup),
				"desc":  setting.GetUsableGroupDescription(userGroup),
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    usableGroups,
	})
}

// GetGroupList returns all groups with full details (ratio, description, counts).
func GetGroupList(c *gin.Context) {
	groups, err := service.ListAllGroups()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, groups)
}

// CreateGroupHandler creates a new group.
func CreateGroupHandler(c *gin.Context) {
	var req dto.CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := service.CreateGroup(&req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, nil)
}

// UpdateGroupHandler updates an existing group.
func UpdateGroupHandler(c *gin.Context) {
	var req dto.UpdateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := service.UpdateGroup(&req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, nil)
}

// DeleteGroupHandler deletes a group by name.
func DeleteGroupHandler(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		common.ApiErrorMsg(c, "缺少分组名称")
		return
	}
	force := c.Query("force") == "true"
	if err := service.DeleteGroup(name, force); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, nil)
}

// GetGroupChannelsHandler returns channels belonging to the specified group, with group-specific weights.
func GetGroupChannelsHandler(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		common.ApiErrorMsg(c, "缺少分组名称")
		return
	}
	channels, err := service.GetGroupChannelsWithWeight(name)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, channels)
}

// UpdateGroupChannelWeightHandler updates the weight of a channel within a group.
func UpdateGroupChannelWeightHandler(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		common.ApiErrorMsg(c, "缺少分组名称")
		return
	}
	var req dto.UpdateGroupChannelWeightRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	err := service.UpdateGroupChannelWeight(name, req.ChannelId, req.Weight)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InitChannelCache()
	common.ApiSuccess(c, nil)
}
