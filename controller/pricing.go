package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func GetPricing(c *gin.Context) {
	pricing := model.GetPricing()
	userId, exists := c.Get("id")
	usableGroup := map[string]string{}
	groupRatio := map[string]float64{}

	var group string
	var userRole int
	if exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			group = user.Group
		}
		if role, ok := c.Get("role"); ok {
			userRole, _ = role.(int)
		}
	}

	if userRole >= common.RoleAdminUser {
		// 管理员：显示所有分组
		for s, f := range ratio_setting.GetGroupRatioCopy() {
			groupRatio[s] = f
		}
		usableGroup = service.GetUserUsableGroups(group)
	} else if exists && group != "" {
		// 已登录普通用户：只显示用户可用分组
		usableGroup = service.GetUserUsableGroups(group)
		for g := range usableGroup {
			ratio, ok := ratio_setting.GetGroupGroupRatio(group, g)
			if ok {
				groupRatio[g] = ratio
			} else {
				groupRatio[g] = ratio_setting.GetGroupRatio(g)
			}
		}
	} else {
		// 未登录用户：只显示 default 分组
		usableGroup["default"] = "默认分组"
		groupRatio["default"] = ratio_setting.GetGroupRatio("default")
	}

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            model.GetVendors(),
		"group_ratio":        groupRatio,
		"usable_group":       usableGroup,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetUserAutoGroup(group),
		"_":                  "a42d372ccf0b5dd13ecf71203521f9d2",
	})
}

// PublicModelInfo 公开模型展示信息
// 价格单位：美元 / 1M tokens（按倍率计费时）；按次计费时使用 price_per_request（美元/次）
type PublicModelInfo struct {
	ModelName       string   `json:"model_name"`
	Description     string   `json:"description,omitempty"`
	Icon            string   `json:"icon,omitempty"`
	Tags            string   `json:"tags,omitempty"`
	ContextLength   string   `json:"context_length,omitempty"`
	QuotaType       int      `json:"quota_type"` // 0 = 按量计费, 1 = 按次计费
	InputPrice      float64  `json:"input_price,omitempty"`
	OutputPrice     float64  `json:"output_price,omitempty"`
	CachedPrice     *float64 `json:"cached_price,omitempty"`
	PricePerRequest float64  `json:"price_per_request,omitempty"`
	Currency        string   `json:"currency"`
	Unit            string   `json:"unit"`
}

// GetPublicModels 公开的模型列表接口，无需登录即可访问
// 仅返回模型详情介绍与价格等展示信息
func GetPublicModels(c *gin.Context) {
	pricing := model.GetPricing()
	// 1 倍率 = $0.002 / 1K tokens = $2 / 1M tokens
	const perMillion = 2.0

	list := make([]PublicModelInfo, 0, len(pricing))
	for _, p := range pricing {
		// 仅返回在「模型管理」中配置过的模型
		if !model.IsModelConfigured(p.ModelName) {
			continue
		}
		info := PublicModelInfo{
			ModelName:     p.ModelName,
			Description:   p.Description,
			Icon:          p.Icon,
			Tags:          p.Tags,
			ContextLength: p.ContextLength,
			QuotaType:     p.QuotaType,
			Currency:      "USD",
			Unit:          "1M tokens",
		}
		if p.QuotaType == 1 {
			info.PricePerRequest = p.ModelPrice
			info.Unit = "per request"
		} else {
			info.InputPrice = p.ModelRatio * perMillion
			info.OutputPrice = p.ModelRatio * p.CompletionRatio * perMillion
			if p.CacheRatio != nil {
				cached := p.ModelRatio * (*p.CacheRatio) * perMillion
				info.CachedPrice = &cached
			}
		}
		list = append(list, info)
	}

	c.JSON(200, gin.H{
		"success": true,
		"data":    list,
	})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	err := model.UpdateOption("ModelRatio", defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	err = ratio_setting.UpdateModelRatioByJSONString(defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "重置模型倍率成功",
	})
}
