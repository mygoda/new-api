package controller

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// MarketplaceModelInfo 模型广场（新）的展示数据
// 价格单位：美元 / 1M tokens（按量计费）；按次计费时使用 PricePerRequest（美元/次）
type MarketplaceModelInfo struct {
	ModelName       string            `json:"model_name"`
	Description     string            `json:"description,omitempty"`
	LongDescription string            `json:"long_description,omitempty"`
	Icon            string            `json:"icon,omitempty"`
	Tags            string            `json:"tags,omitempty"`
	ContextLength   string            `json:"context_length,omitempty"`
	MaxOutputTokens string            `json:"max_output_tokens,omitempty"`
	KnowledgeCutoff string            `json:"knowledge_cutoff,omitempty"`
	Capabilities    []string          `json:"capabilities,omitempty"`
	Endpoints       []string          `json:"endpoints,omitempty"`
	QuotaType       int               `json:"quota_type"`
	InputPrice      float64           `json:"input_price,omitempty"`
	OutputPrice     float64           `json:"output_price,omitempty"`
	CachedPrice     *float64          `json:"cached_price,omitempty"`
	CacheCreatePrice *float64         `json:"cache_create_price,omitempty"`
	Tiers           []PublicTierPrice `json:"tiers,omitempty"`
	PricePerRequest float64           `json:"price_per_request,omitempty"`
	Currency        string            `json:"currency"`
	Unit            string            `json:"unit"`
}

// loadMarketplaceMetaMap 从 models 表加载模型广场展示所需的扩展字段
func loadMarketplaceMetaMap() (map[string]*model.Model, error) {
	var models []*model.Model
	if err := model.DB.Where("status = ?", 1).Find(&models).Error; err != nil {
		return nil, err
	}
	out := make(map[string]*model.Model, len(models))
	for _, m := range models {
		out[m.ModelName] = m
	}
	return out, nil
}

func splitCapabilities(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// splitEndpoints 解析 model_meta.endpoints 字段
//
// 该字段历史上有两种存储格式：
//   - JSON 数组字符串：["openai","anthropic"]（新格式）
//   - 逗号分隔：openai,anthropic（旧格式）
//
// 此函数兼容两种格式
func splitEndpoints(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	// 优先尝试 JSON 数组解析
	if strings.HasPrefix(s, "[") {
		var arr []string
		if err := json.Unmarshal([]byte(s), &arr); err == nil {
			out := make([]string, 0, len(arr))
			for _, p := range arr {
				p = strings.TrimSpace(p)
				if p != "" {
					out = append(out, p)
				}
			}
			return out
		}
	}
	// 退化到逗号分隔
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func buildMarketplaceModelInfo(p model.Pricing, meta *model.Model) MarketplaceModelInfo {
	const perMillion = 2.0
	info := MarketplaceModelInfo{
		ModelName:     p.ModelName,
		Description:   p.Description,
		Icon:          p.Icon,
		Tags:          p.Tags,
		ContextLength: p.ContextLength,
		QuotaType:     p.QuotaType,
		Currency:      "USD",
		Unit:          "1M tokens",
	}
	if meta != nil {
		info.MaxOutputTokens = string(meta.MaxOutputTokens)
		info.Capabilities = splitCapabilities(meta.Capabilities)
		info.KnowledgeCutoff = meta.KnowledgeCutoff
		info.LongDescription = meta.LongDescription
		info.Endpoints = splitEndpoints(meta.Endpoints)
	}
	if p.QuotaType == 1 {
		info.PricePerRequest = p.ModelPrice
		info.Unit = "per request"
		return info
	}
	info.InputPrice = p.ModelRatio * perMillion
	info.OutputPrice = p.ModelRatio * p.CompletionRatio * perMillion
	if p.CacheRatio != nil {
		cached := p.ModelRatio * (*p.CacheRatio) * perMillion
		info.CachedPrice = &cached
	}
	if p.CreateCacheRatio != nil {
		create := p.ModelRatio * (*p.CreateCacheRatio) * perMillion
		info.CacheCreatePrice = &create
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
	return info
}

// GetMarketplaceModels admin-only 模型广场（新）列表接口
func GetMarketplaceModels(c *gin.Context) {
	pricing := model.GetPricing()
	metaMap, err := loadMarketplaceMetaMap()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	list := make([]MarketplaceModelInfo, 0, len(pricing))
	for _, p := range pricing {
		if !model.IsModelConfigured(p.ModelName) {
			continue
		}
		list = append(list, buildMarketplaceModelInfo(p, metaMap[p.ModelName]))
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": list})
}

// CreationModelInfo 创作中心使用的精简模型信息
// 不包含价格倍率等敏感字段，仅暴露：模型名、描述、图标、endpoints、capabilities
type CreationModelInfo struct {
	ModelName       string   `json:"model_name"`
	Description     string   `json:"description,omitempty"`
	Icon            string   `json:"icon,omitempty"`
	Tags            string   `json:"tags,omitempty"`
	VendorID        int      `json:"vendor_id,omitempty"`
	VendorName      string   `json:"vendor_name,omitempty"`
	Endpoints       []string `json:"endpoints,omitempty"`        // 模型管理表中显式配置的 endpoints
	Capabilities    []string `json:"capabilities,omitempty"`     // 能力标签（vision / function-call 等）
}

// GetCreationModels 公开接口：返回模型管理（model_meta 表）中已启用的模型列表
//
// 设计目的：
//   - 让创作中心从「模型管理」获取真实的模型列表（而不是 pricing/abilities 的合并）
//   - 不暴露任何价格、倍率等敏感信息
//   - 通过 endpoints 字段供前端按模态过滤
//
// 鉴权：公开接口，未登录也可访问
func GetCreationModels(c *gin.Context) {
	var models []*model.Model
	if err := model.DB.Where("status = ?", 1).Find(&models).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	// 加载 vendors 用于回填 vendor_name
	vendors := model.GetVendors()
	vendorMap := make(map[int]string, len(vendors))
	for _, v := range vendors {
		vendorMap[v.ID] = v.Name
	}

	list := make([]CreationModelInfo, 0, len(models))
	for _, m := range models {
		info := CreationModelInfo{
			ModelName:    m.ModelName,
			Description:  m.Description,
			Icon:         m.Icon,
			Tags:         m.Tags,
			VendorID:     m.VendorID,
			VendorName:   vendorMap[m.VendorID],
			Endpoints:    splitEndpoints(m.Endpoints),
			Capabilities: splitCapabilities(m.Capabilities),
		}
		list = append(list, info)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": list})
}

// GetMarketplaceModelDetail admin-only 模型广场（新）单模型详情
func GetMarketplaceModelDetail(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "model name is required"})
		return
	}
	pricing := model.GetPricing()
	var found *model.Pricing
	for i := range pricing {
		if pricing[i].ModelName == name {
			found = &pricing[i]
			break
		}
	}
	if found == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "model not found"})
		return
	}
	metaMap, err := loadMarketplaceMetaMap()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	info := buildMarketplaceModelInfo(*found, metaMap[name])
	c.JSON(http.StatusOK, gin.H{"success": true, "data": info})
}
