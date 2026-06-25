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
	var extraGroupsRaw string
	var userRole int
	var hideGroupRatio bool
	if exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			group = user.Group
			extraGroupsRaw = user.ExtraGroups
			hideGroupRatio = user.HideGroupRatio
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
		usableGroup = service.GetUserUsableGroupsWithExtra(group, extraGroupsRaw)
	} else if exists && group != "" {
		// 已登录普通用户：UserUsableGroups + GroupSpecialUsableGroup + users.extra_groups
		usableGroup = service.GetUserUsableGroupsWithExtra(group, extraGroupsRaw)
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

	// 该用户被设为隐藏真实倍率：对非管理员把所有分组倍率遮蔽为 1.0（仅展示，
	// 实际计费仍用真实倍率）。管理员不受影响，始终看真实值。
	if hideGroupRatio && userRole < common.RoleAdminUser {
		for g := range groupRatio {
			groupRatio[g] = 1.0
		}
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
	ModelName       string             `json:"model_name"`
	Description     string             `json:"description,omitempty"`
	Icon            string             `json:"icon,omitempty"`
	Tags            string             `json:"tags,omitempty"`
	ContextLength   string             `json:"context_length,omitempty"`
	QuotaType       int                `json:"quota_type"` // 0 = 按量计费, 1 = 按次计费
	InputPrice      float64            `json:"input_price,omitempty"`
	OutputPrice     float64            `json:"output_price,omitempty"`
	CachedPrice     *float64           `json:"cached_price,omitempty"`
	Tiers           []PublicTierPrice  `json:"tiers,omitempty"`
	// ConditionalPricing 仅当模型存在条件分价规则(admin 在「价格设置」配)时填充,
	// 客户端凭 omitempty 决定是否展示「条件分价」徽章 + 详情。
	ConditionalPricing *model.PricingConditional `json:"conditional_pricing,omitempty"`
	PricePerRequest float64            `json:"price_per_request,omitempty"`
	Currency        string             `json:"currency"`
	Unit            string             `json:"unit"`
}

// PublicTierPrice 单档阶梯计费的展示信息
type PublicTierPrice struct {
	Threshold   int      `json:"threshold"`
	InputPrice  float64  `json:"input_price"`
	OutputPrice float64  `json:"output_price"`
	CachedPrice *float64 `json:"cached_price,omitempty"`
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
			if len(p.ModelRatioTiers) > 0 {
				info.Tiers = make([]PublicTierPrice, 0, len(p.ModelRatioTiers))
				for _, t := range p.ModelRatioTiers {
					tier := PublicTierPrice{
						Threshold:   t.Threshold,
						InputPrice:  t.ModelRatio * perMillion,
						OutputPrice: t.ModelRatio * t.CompletionRatio * perMillion,
					}
					if t.CacheRatio > 0 {
						cached := t.ModelRatio * t.CacheRatio * perMillion
						tier.CachedPrice = &cached
					}
					info.Tiers = append(info.Tiers, tier)
				}
			}
		}
		// 条件分价(v2)透传:同时适用于按 token 与按次计费的模型
		info.ConditionalPricing = p.ConditionalPricing
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
