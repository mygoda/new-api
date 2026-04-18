package controller

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

// validateDealerOwnership checks that the target user belongs to the current dealer.
func validateDealerOwnership(c *gin.Context, targetUserId int) (*model.User, error) {
	dealerId := c.GetInt("id")
	user, err := model.GetUserById(targetUserId, false)
	if err != nil {
		return nil, fmt.Errorf("用户不存在")
	}
	if user.ParentId != dealerId {
		return nil, fmt.Errorf("无权操作此用户")
	}
	return user, nil
}

// ==================== Sub-user Management ====================

func GetDealerUsers(c *gin.Context) {
	dealerId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)

	users, total, err := model.GetDealerUsers(dealerId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(users)
	common.ApiSuccess(c, pageInfo)
}

func SearchDealerUsers(c *gin.Context) {
	dealerId := c.GetInt("id")
	keyword := c.Query("keyword")
	pageInfo := common.GetPageQuery(c)

	users, total, err := model.SearchDealerUsers(dealerId, keyword, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(users)
	common.ApiSuccess(c, pageInfo)
}

func CreateDealerUser(c *gin.Context) {
	dealerId := c.GetInt("id")

	var req struct {
		Username        string  `json:"username"`
		Password        string  `json:"password"`
		DisplayName     string  `json:"display_name"`
		UserRatio       float64 `json:"user_ratio"`
		UserModelRatios string  `json:"user_model_ratios"`
		DealerRemark    string  `json:"dealer_remark"`
		InitialQuota    int     `json:"initial_quota"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	if req.Username == "" || req.Password == "" {
		common.ApiErrorMsg(c, "用户名和密码不能为空")
		return
	}
	if len(req.Username) > 20 || len(req.Password) < 8 || len(req.Password) > 20 {
		common.ApiErrorMsg(c, "用户名不超过20字符，密码8-20字符")
		return
	}

	if req.UserRatio < 0 {
		common.ApiErrorMsg(c, "用户倍率不能为负数")
		return
	}

	cleanUser := model.User{
		Username:        req.Username,
		Password:        req.Password,
		DisplayName:     req.DisplayName,
		Role:            common.RoleCommonUser,
		Status:          common.UserStatusEnabled,
		ParentId:        dealerId,
		UserRatio:       req.UserRatio,
		UserModelRatios: req.UserModelRatios,
		DealerRemark:    req.DealerRemark,
		CreatedBy:       dealerId,
	}

	if err := cleanUser.Insert(0); err != nil {
		common.ApiError(c, err)
		return
	}

	// Transfer initial quota from dealer to new user
	if req.InitialQuota > 0 {
		if err := model.TransferQuota(dealerId, cleanUser.Id, req.InitialQuota); err != nil {
			// User created but quota transfer failed - still success but warn
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": fmt.Sprintf("用户创建成功，但初始额度转移失败: %s", err.Error()),
			})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func UpdateDealerUser(c *gin.Context) {
	dealerId := c.GetInt("id")

	var req struct {
		Id              int      `json:"id"`
		DisplayName     *string  `json:"display_name,omitempty"`
		Password        *string  `json:"password,omitempty"`
		UserRatio       *float64 `json:"user_ratio,omitempty"`
		UserModelRatios *string  `json:"user_model_ratios,omitempty"`
		DealerRemark    *string  `json:"dealer_remark,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	user, err := validateDealerOwnership(c, req.Id)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	_ = dealerId

	updates := map[string]interface{}{}
	if req.DisplayName != nil {
		updates["display_name"] = *req.DisplayName
	}
	if req.Password != nil && *req.Password != "" {
		hash, err := common.Password2Hash(*req.Password)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		updates["password"] = hash
	}
	if req.UserRatio != nil {
		if *req.UserRatio < 0 {
			common.ApiErrorMsg(c, "用户倍率不能为负数")
			return
		}
		updates["user_ratio"] = *req.UserRatio
	}
	if req.UserModelRatios != nil {
		updates["user_model_ratios"] = *req.UserModelRatios
	}
	if req.DealerRemark != nil {
		updates["dealer_remark"] = *req.DealerRemark
	}

	if len(updates) == 0 {
		common.ApiErrorMsg(c, "没有需要更新的字段")
		return
	}

	if err := model.DB.Model(&model.User{}).Where("id = ?", user.Id).Updates(updates).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func DeleteDealerUser(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	if _, err := validateDealerOwnership(c, id); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	if err := model.HardDeleteUserById(id); err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func ManageDealerUser(c *gin.Context) {
	var req struct {
		UserId int    `json:"user_id"`
		Action string `json:"action"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	user, err := validateDealerOwnership(c, req.UserId)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	switch req.Action {
	case "disable":
		user.Status = common.UserStatusDisabled
	case "enable":
		user.Status = common.UserStatusEnabled
	default:
		common.ApiErrorMsg(c, "不支持的操作: "+req.Action)
		return
	}

	if err := user.Update(false); err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// ==================== Quota Management ====================

func TransferQuotaToUser(c *gin.Context) {
	dealerId := c.GetInt("id")

	var req struct {
		UserId int `json:"user_id"`
		Quota  int `json:"quota"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	if req.Quota <= 0 {
		common.ApiErrorMsg(c, "转移额度必须大于0")
		return
	}

	if _, err := validateDealerOwnership(c, req.UserId); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	if err := model.TransferQuota(dealerId, req.UserId, req.Quota); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func GetDealerQuotaStats(c *gin.Context) {
	dealerId := c.GetInt("id")

	// Dealer's own quota
	dealerQuota, err := model.GetUserQuota(dealerId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	allocatedQuota, usedQuota, err := model.GetDealerQuotaStats(dealerId)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	subUserCount := model.CountSubUsers(dealerId)

	common.ApiSuccess(c, gin.H{
		"dealer_quota":    dealerQuota,
		"allocated_quota": allocatedQuota,
		"used_quota":      usedQuota,
		"sub_user_count":  subUserCount,
	})
}

// ==================== Sub-user Token Management ====================

func GetDealerUserTokens(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))

	if _, err := validateDealerOwnership(c, userId); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	pageInfo := common.GetPageQuery(c)
	tokens, err := model.GetAllUserTokens(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	total, _ := model.CountUserTokens(userId)
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(tokens)
	common.ApiSuccess(c, pageInfo)
}

func CreateDealerUserToken(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))

	if _, err := validateDealerOwnership(c, userId); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	token := model.Token{}
	if err := c.ShouldBindJSON(&token); err != nil {
		common.ApiError(c, err)
		return
	}

	if len(token.Name) > 50 {
		common.ApiErrorMsg(c, "令牌名称不超过50字符")
		return
	}

	key, err := common.GenerateKey()
	if err != nil {
		common.ApiErrorMsg(c, "生成令牌失败")
		return
	}

	cleanToken := model.Token{
		UserId:             userId,
		Name:               token.Name,
		Key:                key,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       common.GetTimestamp(),
		ExpiredTime:        token.ExpiredTime,
		RemainQuota:        token.RemainQuota,
		UnlimitedQuota:     token.UnlimitedQuota,
		ModelLimitsEnabled: token.ModelLimitsEnabled,
		ModelLimits:        token.ModelLimits,
		Group:              token.Group,
	}

	if err := cleanToken.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func UpdateDealerUserToken(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))

	if _, err := validateDealerOwnership(c, userId); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	token := model.Token{}
	if err := c.ShouldBindJSON(&token); err != nil {
		common.ApiError(c, err)
		return
	}

	cleanToken, err := model.GetTokenByIds(token.Id, userId)
	if err != nil {
		common.ApiErrorMsg(c, "令牌不存在")
		return
	}

	cleanToken.Name = token.Name
	cleanToken.ExpiredTime = token.ExpiredTime
	cleanToken.RemainQuota = token.RemainQuota
	cleanToken.UnlimitedQuota = token.UnlimitedQuota
	cleanToken.ModelLimitsEnabled = token.ModelLimitsEnabled
	cleanToken.ModelLimits = token.ModelLimits
	cleanToken.Group = token.Group

	if err := cleanToken.Update(); err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func DeleteDealerUserToken(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))
	tokenId, _ := strconv.Atoi(c.Param("token_id"))

	if _, err := validateDealerOwnership(c, userId); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	if err := model.DeleteTokenById(tokenId, userId); err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// ==================== Billing ====================

func GetDealerBillingRecords(c *gin.Context) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		common.ApiErrorMsg(c, "账单功能未启用")
		return
	}

	dealerId := c.GetInt("id")
	userIds, err := model.GetSubUserIds(dealerId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(userIds) == 0 {
		pageInfo := common.GetPageQuery(c)
		pageInfo.SetTotal(0)
		pageInfo.SetItems([]interface{}{})
		common.ApiSuccess(c, pageInfo)
		return
	}

	pageInfo := common.GetPageQuery(c)
	filter := parseBillingRecordsFilter(c)
	filter.UserIds = userIds
	filter.UserId = 0 // use UserIds instead

	result, err := service.QueryBillingRecords(filter, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiErrorMsg(c, "查询账单失败: "+err.Error())
		return
	}

	// Mask sensitive fields
	for i := range result.Items {
		result.Items[i].ChannelId = 0
		result.Items[i].ChannelName = ""
		result.Items[i].TokenKey = ""
	}

	pageInfo.SetTotal(result.Total)
	pageInfo.SetItems(result.Items)
	common.ApiSuccess(c, pageInfo)
}

func GetDealerBillingSummary(c *gin.Context) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		common.ApiErrorMsg(c, "账单功能未启用")
		return
	}

	dealerId := c.GetInt("id")
	userIds, err := model.GetSubUserIds(dealerId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(userIds) == 0 {
		pageInfo := common.GetPageQuery(c)
		pageInfo.SetTotal(0)
		pageInfo.SetItems([]interface{}{})
		common.ApiSuccess(c, pageInfo)
		return
	}

	pageInfo := common.GetPageQuery(c)
	filter := parseBillingRecordsFilter(c)
	filter.UserIds = userIds
	filter.UserId = 0
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
