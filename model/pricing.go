package model

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
)

type Pricing struct {
	ModelName              string                  `json:"model_name"`
	Description            string                  `json:"description,omitempty"`
	Icon                   string                  `json:"icon,omitempty"`
	Tags                   string                  `json:"tags,omitempty"`
	VendorID               int                     `json:"vendor_id,omitempty"`
	ContextLength          string                  `json:"context_length,omitempty"`
	QuotaType              int                     `json:"quota_type"`
	ModelRatio             float64                 `json:"model_ratio"`
	ModelPrice             float64                 `json:"model_price"`
	OwnerBy                string                  `json:"owner_by"`
	CompletionRatio        float64                 `json:"completion_ratio"`
	CacheRatio             *float64                `json:"cache_ratio,omitempty"`
	CreateCacheRatio       *float64                `json:"create_cache_ratio,omitempty"`
	ImageRatio             *float64                `json:"image_ratio,omitempty"`
	AudioRatio             *float64                `json:"audio_ratio,omitempty"`
	AudioCompletionRatio   *float64                `json:"audio_completion_ratio,omitempty"`
	ModelRatioTiers        []ratio_setting.ModelRatioTier `json:"model_ratio_tiers,omitempty"`
	EnableGroup            []string                `json:"enable_groups"`
	SupportedEndpointTypes []constant.EndpointType `json:"supported_endpoint_types"`
	PricingVersion         string                  `json:"pricing_version,omitempty"`
	// VideoInputRatio 输入含视频时的乘子。0=禁用(走基准价)。由「模型管理」配置。
	VideoInputRatio float64 `json:"video_input_ratio,omitempty"`
	// ConditionalPricing 仅当模型属于已注册的「条件分价」family 且总开关 enabled 时出现。
	// 用于在前台模型广场详情页展示「同模型不同条件下的价格」,客户能直观看到
	// generate_audio / draft / 1080p / 含视频输入等条件触发的乘子与折合单价。
	ConditionalPricing *PricingConditional `json:"conditional_pricing,omitempty"`
}

// PricingConditional 描述一个模型的条件分价规则集合(展示用)。
type PricingConditional struct {
	FamilyKey   string                    `json:"family_key"`   // family 标识(后端契约)
	FamilyLabel string                    `json:"family_label"` // 展示名,如 "Seedance 2.0"
	BaseHint    string                    `json:"base_hint"`    // 基准价说明文案
	Conditions  []PricingConditionalEntry `json:"conditions"`
}

// PricingConditionalEntry 单条 condition 的展示信息 + 当前生效乘子。
//
// Multiplier=0 / Enabled=false 时:此条件不再应用乘子(走基准价)。前端可选择
// 用「已停用」灰色标签展示,或直接过滤掉。
type PricingConditionalEntry struct {
	Key        string  `json:"key"`        // 条件 key
	Label      string  `json:"label"`      // 展示名
	Match      string  `json:"match"`      // 匹配条件的人话描述
	Hint       string  `json:"hint"`       // 来源备注
	Multiplier float64 `json:"multiplier"` // 当前生效乘子(总开关关闭或本条 disabled 时为 0)
	Enabled    bool    `json:"enabled"`    // 当前是否启用
}

type PricingVendor struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Icon        string `json:"icon,omitempty"`
}

var (
	pricingMap           []Pricing
	vendorsList          []PricingVendor
	supportedEndpointMap map[string]common.EndpointInfo
	// configuredModelSet 记录在「模型管理」中配置过的模型名集合（已应用名称规则匹配）
	configuredModelSet = make(map[string]bool)
	lastGetPricingTime time.Time
	updatePricingLock  sync.Mutex

	// 缓存映射：模型名 -> 启用分组 / 计费类型
	modelEnableGroups     = make(map[string][]string)
	modelQuotaTypeMap     = make(map[string]int)
	// modelVideoInputRatio:模型名 -> 输入含视频时的乘子,0 表示禁用。
	// 由「模型管理」配置,GetPricing 一并刷新,通用计费链路可低开销查询。
	modelVideoInputRatio  = make(map[string]float64)
	modelEnableGroupsLock = sync.RWMutex{}
)

var (
	modelSupportEndpointTypes = make(map[string][]constant.EndpointType)
	modelSupportEndpointsLock = sync.RWMutex{}
)

func GetPricing() []Pricing {
	if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
		updatePricingLock.Lock()
		defer updatePricingLock.Unlock()
		// Double check after acquiring the lock
		if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
			modelSupportEndpointsLock.Lock()
			defer modelSupportEndpointsLock.Unlock()
			updatePricing()
		}
	}
	return pricingMap
}

// GetVendors 返回当前定价接口使用到的供应商信息
func GetVendors() []PricingVendor {
	if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
		// 保证先刷新一次
		GetPricing()
	}
	return vendorsList
}

func GetModelSupportEndpointTypes(model string) []constant.EndpointType {
	if model == "" {
		return make([]constant.EndpointType, 0)
	}
	modelSupportEndpointsLock.RLock()
	defer modelSupportEndpointsLock.RUnlock()
	if endpoints, ok := modelSupportEndpointTypes[model]; ok {
		return endpoints
	}
	return make([]constant.EndpointType, 0)
}

func updatePricing() {
	//modelRatios := common.GetModelRatios()
	enableAbilities, err := GetAllEnableAbilityWithChannels()
	if err != nil {
		common.SysLog(fmt.Sprintf("GetAllEnableAbilityWithChannels error: %v", err))
		return
	}
	// 预加载模型元数据与供应商一次，避免循环查询
	var allMeta []Model
	_ = DB.Find(&allMeta).Error
	metaMap := make(map[string]*Model)
	prefixList := make([]*Model, 0)
	suffixList := make([]*Model, 0)
	containsList := make([]*Model, 0)
	for i := range allMeta {
		m := &allMeta[i]
		if m.NameRule == NameRuleExact {
			metaMap[m.ModelName] = m
		} else {
			switch m.NameRule {
			case NameRulePrefix:
				prefixList = append(prefixList, m)
			case NameRuleSuffix:
				suffixList = append(suffixList, m)
			case NameRuleContains:
				containsList = append(containsList, m)
			}
		}
	}

	// 将非精确规则模型匹配到 metaMap
	for _, m := range prefixList {
		for _, pricingModel := range enableAbilities {
			if strings.HasPrefix(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}
	for _, m := range suffixList {
		for _, pricingModel := range enableAbilities {
			if strings.HasSuffix(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}
	for _, m := range containsList {
		for _, pricingModel := range enableAbilities {
			if strings.Contains(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}

	// 预加载供应商
	var vendors []Vendor
	_ = DB.Find(&vendors).Error
	vendorMap := make(map[int]*Vendor)
	for i := range vendors {
		vendorMap[vendors[i].Id] = &vendors[i]
	}

	// 刷新「已在模型管理中配置」的模型名集合
	configuredModelSet = make(map[string]bool, len(metaMap))
	for name := range metaMap {
		configuredModelSet[name] = true
	}

	// 初始化默认供应商映射
	initDefaultVendorMapping(metaMap, vendorMap, enableAbilities)

	// 构建对前端友好的供应商列表
	vendorsList = make([]PricingVendor, 0, len(vendorMap))
	for _, v := range vendorMap {
		vendorsList = append(vendorsList, PricingVendor{
			ID:          v.Id,
			Name:        v.Name,
			Description: v.Description,
			Icon:        v.Icon,
		})
	}

	modelGroupsMap := make(map[string]*types.Set[string])

	for _, ability := range enableAbilities {
		groups, ok := modelGroupsMap[ability.Model]
		if !ok {
			groups = types.NewSet[string]()
			modelGroupsMap[ability.Model] = groups
		}
		groups.Add(ability.Group)
	}

	//这里使用切片而不是Set，因为一个模型可能支持多个端点类型，并且第一个端点是优先使用端点
	modelSupportEndpointsStr := make(map[string][]string)

	// 先根据已有能力填充原生端点
	for _, ability := range enableAbilities {
		endpoints := modelSupportEndpointsStr[ability.Model]
		channelTypes := common.GetEndpointTypesByChannelType(ability.ChannelType, ability.Model)
		for _, channelType := range channelTypes {
			if !common.StringsContains(endpoints, string(channelType)) {
				endpoints = append(endpoints, string(channelType))
			}
		}
		modelSupportEndpointsStr[ability.Model] = endpoints
	}

	// 再补充模型自定义端点：若配置有效则替换默认端点，不做合并
	for modelName, meta := range metaMap {
		if strings.TrimSpace(meta.Endpoints) == "" {
			continue
		}
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(meta.Endpoints), &raw); err == nil {
			endpoints := make([]string, 0, len(raw))
			for k, v := range raw {
				switch v.(type) {
				case string, map[string]interface{}:
					if !common.StringsContains(endpoints, k) {
						endpoints = append(endpoints, k)
					}
				}
			}
			if len(endpoints) > 0 {
				modelSupportEndpointsStr[modelName] = endpoints
			}
		}
	}

	modelSupportEndpointTypes = make(map[string][]constant.EndpointType)
	for model, endpoints := range modelSupportEndpointsStr {
		supportedEndpoints := make([]constant.EndpointType, 0)
		for _, endpointStr := range endpoints {
			endpointType := constant.EndpointType(endpointStr)
			supportedEndpoints = append(supportedEndpoints, endpointType)
		}
		modelSupportEndpointTypes[model] = supportedEndpoints
	}

	// 构建全局 supportedEndpointMap（默认 + 自定义覆盖）
	supportedEndpointMap = make(map[string]common.EndpointInfo)
	// 1. 默认端点
	for _, endpoints := range modelSupportEndpointTypes {
		for _, et := range endpoints {
			if info, ok := common.GetDefaultEndpointInfo(et); ok {
				if _, exists := supportedEndpointMap[string(et)]; !exists {
					supportedEndpointMap[string(et)] = info
				}
			}
		}
	}
	// 2. 自定义端点（models 表）覆盖默认
	for _, meta := range metaMap {
		if strings.TrimSpace(meta.Endpoints) == "" {
			continue
		}
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(meta.Endpoints), &raw); err == nil {
			for k, v := range raw {
				switch val := v.(type) {
				case string:
					supportedEndpointMap[k] = common.EndpointInfo{Path: val, Method: "POST"}
				case map[string]interface{}:
					ep := common.EndpointInfo{Method: "POST"}
					if p, ok := val["path"].(string); ok {
						ep.Path = p
					}
					if m, ok := val["method"].(string); ok {
						ep.Method = strings.ToUpper(m)
					}
					supportedEndpointMap[k] = ep
				default:
					// ignore unsupported types
				}
			}
		}
	}

	pricingMap = make([]Pricing, 0)
	for model, groups := range modelGroupsMap {
		pricing := Pricing{
			ModelName:              model,
			EnableGroup:            groups.Items(),
			SupportedEndpointTypes: modelSupportEndpointTypes[model],
		}

		// 补充模型元数据（描述、标签、供应商、状态）
		if meta, ok := metaMap[model]; ok {
			// 若模型被禁用(status!=1)，则直接跳过，不返回给前端
			if meta.Status != 1 {
				continue
			}
			pricing.Description = meta.Description
			pricing.Icon = meta.Icon
			pricing.Tags = meta.Tags
			pricing.VendorID = meta.VendorID
			pricing.ContextLength = string(meta.ContextLength)
			pricing.VideoInputRatio = meta.VideoInputRatio
		}
		modelPrice, findPrice := ratio_setting.GetModelPrice(model, false)
		if findPrice {
			pricing.ModelPrice = modelPrice
			pricing.QuotaType = 1
		} else {
			modelRatio, _, _ := ratio_setting.GetModelRatio(model)
			pricing.ModelRatio = modelRatio
			pricing.CompletionRatio = ratio_setting.GetCompletionRatio(model)
			pricing.QuotaType = 0
		}
		if tiers, ok := ratio_setting.GetModelRatioTiers(model); ok && len(tiers) > 0 {
			pricing.ModelRatioTiers = tiers
		}
		if cacheRatio, ok := ratio_setting.GetCacheRatio(model); ok {
			pricing.CacheRatio = &cacheRatio
		}
		if createCacheRatio, ok := ratio_setting.GetCreateCacheRatio(model); ok {
			pricing.CreateCacheRatio = &createCacheRatio
		}
		if imageRatio, ok := ratio_setting.GetImageRatio(model); ok {
			pricing.ImageRatio = &imageRatio
		}
		if ratio_setting.ContainsAudioRatio(model) {
			audioRatio := ratio_setting.GetAudioRatio(model)
			pricing.AudioRatio = &audioRatio
		}
		if ratio_setting.ContainsAudioCompletionRatio(model) {
			audioCompletionRatio := ratio_setting.GetAudioCompletionRatio(model)
			pricing.AudioCompletionRatio = &audioCompletionRatio
		}
		// 条件分价(仅 Seedance 等已注册 family + 总开关启用时填充)
		pricing.ConditionalPricing = buildPricingConditional(model)
		pricingMap = append(pricingMap, pricing)
	}

	// 防止大更新后数据不通用
	if len(pricingMap) > 0 {
		pricingMap[0].PricingVersion = "tiered-pricing-v1-2026-04"
	}

	// 刷新缓存映射，供高并发快速查询
	modelEnableGroupsLock.Lock()
	modelEnableGroups = make(map[string][]string)
	modelQuotaTypeMap = make(map[string]int)
	modelVideoInputRatio = make(map[string]float64)
	for _, p := range pricingMap {
		modelEnableGroups[p.ModelName] = p.EnableGroup
		modelQuotaTypeMap[p.ModelName] = p.QuotaType
		if p.VideoInputRatio > 0 {
			modelVideoInputRatio[p.ModelName] = p.VideoInputRatio
		}
	}
	modelEnableGroupsLock.Unlock()

	lastGetPricingTime = time.Now()
}

// GetSupportedEndpointMap 返回全局端点到路径的映射
func GetSupportedEndpointMap() map[string]common.EndpointInfo {
	return supportedEndpointMap
}

// IsModelConfigured 判断模型是否已在「模型管理」中配置（含名称规则匹配）
// 需先调用 GetPricing() 触发缓存构建
func IsModelConfigured(modelName string) bool {
	return configuredModelSet[modelName]
}

// GetModelVideoInputRatio 返回模型「输入含视频时的乘子」(0=未配置/禁用)。
// 由 GetPricing() 刷新内存缓存,通用计费链路 O(1) 查询,不打 DB。
func GetModelVideoInputRatio(modelName string) float64 {
	if modelName == "" {
		return 0
	}
	modelEnableGroupsLock.RLock()
	defer modelEnableGroupsLock.RUnlock()
	return modelVideoInputRatio[modelName]
}

// buildPricingConditional 为单个模型查找其所属的条件分价 family,把当前生效的乘子
// 装进 PricingConditional 返回。模型不属于任何 family 或总开关关闭时返回 nil,
// 客户端凭 omitempty 决定是否显示。
//
// 优先走 v2 (admin 在「价格设置」per-model 自助配的规则);v1 framework 作为
// fallback 保留向后兼容(目前 family 注册表为空,不会命中)。
func buildPricingConditional(modelName string) *PricingConditional {
	if v2 := buildPricingConditionalFromV2(modelName); v2 != nil {
		return v2
	}
	if !common.ConditionalRatioEnabled() {
		return nil
	}
	family, ok := common.FindConditionalRatioFamilyByModel(modelName)
	if !ok {
		return nil
	}
	entries := make([]PricingConditionalEntry, 0, len(family.Conditions))
	for _, c := range family.Conditions {
		mul, enabled := common.GetConditionalRatio(family.Key, c.Key)
		// 即便 disabled 也展示给客户(灰色),让客户知道有这一档
		entries = append(entries, PricingConditionalEntry{
			Key:        c.Key,
			Label:      c.Label,
			Match:      c.Match,
			Hint:       c.Hint,
			Multiplier: mul,
			Enabled:    enabled,
		})
	}
	return &PricingConditional{
		FamilyKey:   family.Key,
		FamilyLabel: family.Label,
		BaseHint:    family.BaseHint,
		Conditions:  entries,
	}
}

// buildPricingConditionalFromV2 把 v2 (per-model 自助配置)的规则转成展示结构。
// 模型未匹配到规则集 / 规则集为空时返回 nil。
//
// 公式:
//   - 目标 ratio = price_rmb_per_million / (USD2RMB × 2)
//   - 乘子 = 目标 ratio / 模型基础 ratio (即「相对基础价的倍数」)
//
// 维度 key (resolution / has_video_input / ...) 通过 common.ListDimensions()
// 翻译为中文 label,布尔值翻译为 是 / 否,生成人话 Match 字符串供前端展示。
func buildPricingConditionalFromV2(modelName string) *PricingConditional {
	cfg := ratio_setting.GetConditionalRatiosV2Copy()
	if cfg == nil || !cfg.Enabled || len(cfg.Models) == 0 {
		return nil
	}

	// 优先精确匹配,其次前缀通配 (xxx-*)
	var matched *ratio_setting.ModelRulesV2
	for i := range cfg.Models {
		if cfg.Models[i].ModelPattern == modelName {
			matched = &cfg.Models[i]
			break
		}
	}
	if matched == nil {
		for i := range cfg.Models {
			p := cfg.Models[i].ModelPattern
			if strings.HasSuffix(p, "*") &&
				strings.HasPrefix(modelName, strings.TrimSuffix(p, "*")) {
				matched = &cfg.Models[i]
				break
			}
		}
	}
	if matched == nil || len(matched.Rules) == 0 {
		return nil
	}

	// 拉维度元数据,把英文 key 翻译成中文 label
	dimLabels := map[string]string{}
	for _, d := range common.ListDimensions() {
		if d.Label != "" {
			dimLabels[d.Key] = d.Label
		}
	}

	baseRatio, _, _ := ratio_setting.GetModelRatio(modelName)
	entries := make([]PricingConditionalEntry, 0, len(matched.Rules))
	for _, r := range matched.Rules {
		match := formatV2ConditionsForDisplay(r.Conditions, dimLabels)
		if match == "" {
			match = "默认档(无条件)"
		}
		mul := 0.0
		if baseRatio > 0 && r.PriceRMBPerMillion > 0 {
			target := ratio_setting.RMBPriceToRatio(r.PriceRMBPerMillion)
			mul = target / baseRatio
		}
		label := r.Label
		if label == "" {
			label = match
		}
		entries = append(entries, PricingConditionalEntry{
			Key:        match,
			Label:      label,
			Match:      match,
			Hint:       fmt.Sprintf("%.2f 元/百万 token", r.PriceRMBPerMillion),
			Multiplier: mul,
			Enabled:    r.PriceRMBPerMillion > 0,
		})
	}

	familyLabel := matched.Label
	if familyLabel == "" {
		familyLabel = "条件分价"
	}
	baseHint := ""
	if baseRatio > 0 {
		basePriceRMB := baseRatio * 2 * ratio_setting.USD2RMB
		baseHint = fmt.Sprintf("基准: %.2f 元/百万 token (倍率 %.4f)", basePriceRMB, baseRatio)
	}
	return &PricingConditional{
		FamilyKey:   matched.ModelPattern,
		FamilyLabel: familyLabel,
		BaseHint:    baseHint,
		Conditions:  entries,
	}
}

// formatV2ConditionsForDisplay 把 {dim_key:value} 渲染成中文段落,
// e.g. "输出分辨率=1080p, 输入包含视频=是"。
// 与日志输出口径一致 (see taskcommon helpers)。
func formatV2ConditionsForDisplay(conds map[string]any, dimLabels map[string]string) string {
	if len(conds) == 0 {
		return ""
	}
	keys := make([]string, 0, len(conds))
	for k := range conds {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		label := dimLabels[k]
		if label == "" {
			label = k
		}
		v := conds[k]
		var s string
		switch x := v.(type) {
		case bool:
			if x {
				s = "是"
			} else {
				s = "否"
			}
		case string:
			s = x
		default:
			s = fmt.Sprintf("%v", v)
		}
		parts = append(parts, fmt.Sprintf("%s=%s", label, s))
	}
	return strings.Join(parts, ", ")
}
