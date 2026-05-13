// 「模型条件分价 v2」配置存储 + 应用引擎。
//
// 设计参考: see common/conditional_ratio_v2.go 顶部注释。
//
// 数据流:
//   - admin 在前端「价格配置」UI 为模型新增/编辑规则,PUT /api/option/ ConditionalRatiosV2
//   - 本文件 ParseConditionalRatiosV2 解析 JSON,UpdateConditionalRatiosV2 在 option 写入时被调
//   - 任务请求路径: BaseBilling.AdjustBillingOnSubmit ->
//     ratio_setting.ApplyConditionalRatiosV2(modelName, taskBody) -> 返回 OtherRatios map
//   - 框架按 baseRatio × ∏OtherRatios × groupRatio 重算预扣 / 结算
//
// 与 v1 的关系:
//   - v1 已废弃,框架代码 (common/conditional_ratio.go) 保留作为遗留接口
//   - v2 独立 option (ConditionalRatiosV2),不与 v1 互相影响

package ratio_setting

import (
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
)

// ConditionalRuleV2 一条「条件 -> 价格」规则。
// Conditions 为 AND 语义,所有键值对都满足才视为匹配。
// PriceRMBPerMillion 必填(>0),单位:元/百万 token。
// 后续可拓展 PricePerCall(按次)等。
type ConditionalRuleV2 struct {
	Conditions         map[string]any `json:"conditions"`
	PriceRMBPerMillion float64        `json:"price_rmb_per_million,omitempty"`
	Label              string         `json:"label,omitempty"`
}

// ModelRulesV2 某个模型 (pattern) 的规则集合。
// ModelPattern 支持:
//   - 精确匹配: "doubao-seedance-2-0-260128"
//   - 前缀通配: "doubao-seedance-2-0-*" (尾部 * 表示前缀匹配)
type ModelRulesV2 struct {
	ModelPattern string              `json:"model_pattern"`
	Label        string              `json:"label,omitempty"`
	Rules        []ConditionalRuleV2 `json:"rules"`
}

// ConditionalRatiosV2Config v2 的完整存储格式。
type ConditionalRatiosV2Config struct {
	Enabled bool           `json:"enabled"`
	Models  []ModelRulesV2 `json:"models"`
}

var (
	v2ConfigMu     sync.RWMutex
	v2Config       *ConditionalRatiosV2Config
	v2RawJSONStore = types.NewRWMap[string, string]() // key="raw" -> JSON,用于持久化时回写 option
)

// ConditionalRatiosV2JSONString 当前配置的 JSON(由 model.option 在 InitOptionMap 调用)。
func ConditionalRatiosV2JSONString() string {
	if v, ok := v2RawJSONStore.Get("raw"); ok && v != "" {
		return v
	}
	return `{"enabled":false,"models":[]}`
}

// UpdateConditionalRatiosV2ByJSONString 写入 admin 提交的新 JSON 后立刻生效。
// 解析失败时保持原配置不变并返回 error;调用方应回滚 option。
func UpdateConditionalRatiosV2ByJSONString(jsonStr string) error {
	cfg, err := ParseConditionalRatiosV2(jsonStr)
	if err != nil {
		return err
	}
	v2ConfigMu.Lock()
	v2Config = cfg
	v2ConfigMu.Unlock()
	v2RawJSONStore.Set("raw", jsonStr)
	InvalidateExposedDataCache()
	return nil
}

// ParseConditionalRatiosV2 解析 JSON,空串返回禁用空配置;不抛 fallback,
// 让调用方决定如何处理错误 (避免悄悄回退到错误的旧配置)。
func ParseConditionalRatiosV2(jsonStr string) (*ConditionalRatiosV2Config, error) {
	src := strings.TrimSpace(jsonStr)
	cfg := &ConditionalRatiosV2Config{Enabled: false, Models: []ModelRulesV2{}}
	if src == "" {
		return cfg, nil
	}
	if err := common.UnmarshalJsonStr(src, cfg); err != nil {
		return nil, err
	}
	if cfg.Models == nil {
		cfg.Models = []ModelRulesV2{}
	}
	return cfg, nil
}

// GetConditionalRatiosV2Copy 返回配置快照,供 controller GET 接口透出。
func GetConditionalRatiosV2Copy() *ConditionalRatiosV2Config {
	v2ConfigMu.RLock()
	defer v2ConfigMu.RUnlock()
	if v2Config == nil {
		return &ConditionalRatiosV2Config{Enabled: false, Models: []ModelRulesV2{}}
	}
	// shallow copy 足够,Rules 内部不可变
	cp := *v2Config
	return &cp
}

// matchModelPattern 判断 modelName 是否命中 pattern。
// 规则: 精确匹配,或 pattern 以 "*" 结尾时做前缀匹配 (去除尾 *)。
func matchModelPattern(modelName, pattern string) bool {
	if pattern == "" {
		return false
	}
	if strings.HasSuffix(pattern, "*") {
		prefix := strings.TrimSuffix(pattern, "*")
		return strings.HasPrefix(modelName, prefix)
	}
	return modelName == pattern
}

// matchRule 判断当前请求维度快照是否满足规则的所有条件 (AND 语义)。
// 条件值比较使用 deepEqual 语义 (bool/string/number),number 之间统一转 float64。
func matchRule(snapshot map[string]any, rule ConditionalRuleV2) bool {
	if len(rule.Conditions) == 0 {
		// 兜底规则: 无条件,任何请求都匹配 (作为该模型的 fallback 价)
		return true
	}
	for k, expect := range rule.Conditions {
		actual, ok := snapshot[k]
		if !ok {
			return false
		}
		if !equalCondValue(expect, actual) {
			return false
		}
	}
	return true
}

func equalCondValue(expect, actual any) bool {
	// bool / string 直接 ==
	switch e := expect.(type) {
	case bool:
		if a, ok := actual.(bool); ok {
			return a == e
		}
	case string:
		if a, ok := actual.(string); ok {
			return a == e
		}
	}
	// 数值统一转 float64 比对
	if ef, eok := toFloat(expect); eok {
		if af, aok := toFloat(actual); aok {
			return ef == af
		}
	}
	return false
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case int32:
		return float64(n), true
	}
	return 0, false
}

// selectBestRule 在多条匹配规则中选"条件最具体"的(条件键数量最多)。
// 数量相同则取第一条,稳定可预测。
func selectBestRule(rules []ConditionalRuleV2, snapshot map[string]any) (ConditionalRuleV2, bool) {
	var best ConditionalRuleV2
	bestSpec := -1
	matched := false
	for _, r := range rules {
		if !matchRule(snapshot, r) {
			continue
		}
		if len(r.Conditions) > bestSpec {
			best = r
			bestSpec = len(r.Conditions)
			matched = true
		}
	}
	return best, matched
}

// RMBPriceToRatio 把"元/百万 token"换算为 new-api 内部 ratio。
// 等价关系: 1 ratio = $0.002/1k = $2/M = USD2RMB*2 RMB/M。
func RMBPriceToRatio(priceRMBPerMillion float64) float64 {
	if USD2RMB <= 0 {
		return 0
	}
	return priceRMBPerMillion / (USD2RMB * 2)
}

// ApplyConditionalRatiosV2 由 BaseBilling.AdjustBillingOnSubmit 调用。
// 返回 OtherRatios map (key 任意,框架按 ∏ 乘进 quota);未命中或未启用时返回 nil。
//
// 工作流程:
//  1. 检查 v2 总开关
//  2. 找命中 modelName 的 ModelRulesV2
//  3. 提取请求维度快照 (调 common.ExtractDimensionValues)
//  4. 选最具体的匹配规则
//  5. 把规则价格换算为 ratio,计算相对模型 base ratio 的乘子返回
//
// 关键点: 我们计算的是"目标 ratio / 模型基准 ratio"作为乘子,因为框架已经
// 用 modelRatio 算了 baseQuota,这里只能用乘子修正,无法直接覆盖 modelRatio。
func ApplyConditionalRatiosV2(modelName string, taskBody []byte) map[string]float64 {
	v2ConfigMu.RLock()
	cfg := v2Config
	v2ConfigMu.RUnlock()
	if cfg == nil || !cfg.Enabled || len(cfg.Models) == 0 {
		return nil
	}

	// 1. 找模型规则集
	var modelRules *ModelRulesV2
	// 优先精确匹配,其次前缀通配
	for i := range cfg.Models {
		if cfg.Models[i].ModelPattern == modelName {
			modelRules = &cfg.Models[i]
			break
		}
	}
	if modelRules == nil {
		for i := range cfg.Models {
			if strings.HasSuffix(cfg.Models[i].ModelPattern, "*") &&
				matchModelPattern(modelName, cfg.Models[i].ModelPattern) {
				modelRules = &cfg.Models[i]
				break
			}
		}
	}
	if modelRules == nil || len(modelRules.Rules) == 0 {
		return nil
	}

	// 2. 提取维度快照
	snapshot := common.ExtractDimensionValues(modelName, taskBody)

	// 3. 选最具体的规则
	rule, ok := selectBestRule(modelRules.Rules, snapshot)
	if !ok {
		return nil
	}

	// 4. 计算目标 ratio 与基准 ratio 的比值作为乘子
	baseRatio, baseOK, _ := GetModelRatio(modelName)
	if !baseOK || baseRatio <= 0 {
		return nil
	}
	targetRatio := RMBPriceToRatio(rule.PriceRMBPerMillion)
	if targetRatio <= 0 {
		return nil
	}
	multiplier := targetRatio / baseRatio
	if multiplier <= 0 {
		return nil
	}
	return map[string]float64{"conditional_v2": multiplier}
}
