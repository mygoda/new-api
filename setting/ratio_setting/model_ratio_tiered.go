package ratio_setting

import (
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
)

// ModelRatioTier 表示一个阶梯档位配置。
// 语义：当本次请求的 prompt_tokens >= Threshold 时该档生效；
// 若多个档位都满足，选取 Threshold 最大（即档位下标最靠后）的那个。
// 首档 Threshold 约定为 0（任意请求都会命中，作为基础档）。
type ModelRatioTier struct {
	Threshold        int     `json:"threshold"`
	ModelRatio       float64 `json:"model_ratio"`
	CompletionRatio  float64 `json:"completion_ratio"`
	CacheRatio       float64 `json:"cache_ratio,omitempty"`
	CreateCacheRatio float64 `json:"create_cache_ratio,omitempty"`
}

var modelRatioTieredMap = types.NewRWMap[string, []ModelRatioTier]()

// InitModelRatioTieredDefaults 供 InitRatioSettings 调用；当前默认空，不主动
// 给任何模型注入阶梯配置，保持现有模型行为不变，升级零破坏。
func InitModelRatioTieredDefaults() {
	// intentionally empty: tiered pricing is opt-in via admin config.
}

func ModelRatioTiered2JSONString() string {
	return modelRatioTieredMap.MarshalJSONString()
}

func UpdateModelRatioTieredByJSONString(jsonStr string) error {
	if strings.TrimSpace(jsonStr) == "" {
		modelRatioTieredMap.Clear()
		InvalidateExposedDataCache()
		return nil
	}
	if err := types.LoadFromJsonStringWithCallback(modelRatioTieredMap, jsonStr, InvalidateExposedDataCache); err != nil {
		return err
	}
	// 保证每个模型的 tiers 按 threshold 升序，方便下游选档。
	for name, tiers := range modelRatioTieredMap.ReadAll() {
		if len(tiers) == 0 {
			continue
		}
		sorted := append([]ModelRatioTier(nil), tiers...)
		sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Threshold < sorted[j].Threshold })
		modelRatioTieredMap.Set(name, sorted)
	}
	return nil
}

// ValidateModelRatioTieredJSON 校验阶梯计费配置合法性：
//   - 每个模型至少 1 档
//   - 首档 threshold 必须为 0
//   - threshold 必须严格递增
//   - model_ratio 与 completion_ratio 必须 > 0（否则等于没配置，直接误用）
func ValidateModelRatioTieredJSON(jsonStr string) error {
	if strings.TrimSpace(jsonStr) == "" {
		return nil
	}
	parsed := map[string][]ModelRatioTier{}
	if err := common.UnmarshalJsonStr(jsonStr, &parsed); err != nil {
		return err
	}
	for name, tiers := range parsed {
		if len(tiers) == 0 {
			return fmt.Errorf("模型 %s 阶梯配置为空", name)
		}
		if tiers[0].Threshold != 0 {
			return fmt.Errorf("模型 %s 首档 threshold 必须为 0，当前为 %d", name, tiers[0].Threshold)
		}
		for i, t := range tiers {
			if t.ModelRatio <= 0 || t.CompletionRatio <= 0 {
				return fmt.Errorf("模型 %s 第 %d 档 model_ratio/completion_ratio 必须大于 0", name, i)
			}
			if t.CacheRatio < 0 || t.CreateCacheRatio < 0 {
				return fmt.Errorf("模型 %s 第 %d 档 cache_ratio/create_cache_ratio 不能为负值", name, i)
			}
			if i > 0 && t.Threshold <= tiers[i-1].Threshold {
				return fmt.Errorf("模型 %s 阶梯 threshold 必须严格递增（第 %d 档 %d <= 第 %d 档 %d）",
					name, i, t.Threshold, i-1, tiers[i-1].Threshold)
			}
		}
	}
	return nil
}

// GetModelRatioTiers 返回模型阶梯配置。命中时 ratio 字段已按 ModelCurrency
// 归一化到 USD，与 GetModelRatio 行为一致。
func GetModelRatioTiers(name string) ([]ModelRatioTier, bool) {
	name = FormatMatchingModelName(name)

	tiers, ok := modelRatioTieredMap.Get(name)
	if !ok {
		if strings.HasSuffix(name, CompactModelSuffix) {
			if wildcard, ok2 := modelRatioTieredMap.Get(CompactWildcardModelKey); ok2 {
				return copyAndConvertTiers(name, wildcard), true
			}
		}
		return nil, false
	}
	return copyAndConvertTiers(name, tiers), true
}

func copyAndConvertTiers(modelName string, tiers []ModelRatioTier) []ModelRatioTier {
	if len(tiers) == 0 {
		return nil
	}
	out := make([]ModelRatioTier, len(tiers))
	for i, t := range tiers {
		out[i] = ModelRatioTier{
			Threshold:        t.Threshold,
			ModelRatio:       ConvertModelValueToUSD(modelName, t.ModelRatio),
			CompletionRatio:  t.CompletionRatio,
			CacheRatio:       t.CacheRatio,
			CreateCacheRatio: t.CreateCacheRatio,
		}
	}
	return out
}

// SelectTierByPromptTokens 在已升序排序的 tiers 中选档。
// 规则：prompt_tokens >= tier[i].Threshold 时第 i 档生效；多档同时满足取下标最大者。
// 首档 Threshold=0，任何 prompt_tokens（含 0）都满足，相当于默认档。
// tiers 为空时返回 (-1, 零值)，由调用方兜底。
func SelectTierByPromptTokens(tiers []ModelRatioTier, promptTokens int) (int, ModelRatioTier) {
	if len(tiers) == 0 {
		return -1, ModelRatioTier{}
	}
	selected := 0
	for i := range tiers {
		if promptTokens >= tiers[i].Threshold {
			selected = i
		}
	}
	return selected, tiers[selected]
}

// GetModelRatioTieredCopy 返回所有模型阶梯配置的快照（已 USD 归一化），
// 用于 /api/pricing 等下游展示。
func GetModelRatioTieredCopy() map[string][]ModelRatioTier {
	raw := modelRatioTieredMap.ReadAll()
	out := make(map[string][]ModelRatioTier, len(raw))
	for name, tiers := range raw {
		out[name] = copyAndConvertTiers(name, tiers)
	}
	return out
}
