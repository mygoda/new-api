// 通用「模型条件分价」v2 维度注册表。
//
// 与 v1 的区别:
//   - v1 由 adapter 注册一组"已知 family + 已知条件键"(硬编码),admin 只能调倍率
//   - v2 由 adapter 注册"维度"(resolution / has_video_input / ...)及其提取器,
//     admin 在前端为任意模型自由组合维度 + 自定义价格,无需后端编译
//
// 拓扑:
//   - common 包仅承担"维度注册表",不感知价格/汇率/配置存储
//   - setting/ratio_setting 包负责存储 admin 配置与价格换算 (RMB/M -> internal ratio)
//   - task adapter (doubao / kling / ...) 在 init() 调 RegisterDimension 注册自己的维度
//   - 运行时 BaseBilling.AdjustBillingOnSubmit -> ratio_setting.ApplyConditionalRatiosV2
//     -> ExtractDimensionValues + 规则匹配 + 价格换算 + 写 OtherRatios

package common

import (
	"sort"
	"sync"
)

// DimensionType 描述维度取值类型,用于前端 UI 选择控件。
type DimensionType string

const (
	DimensionTypeString DimensionType = "string"
	DimensionTypeBool   DimensionType = "bool"
	DimensionTypeInt    DimensionType = "int"
)

// Dimension 描述一个可用于"条件分价"判断的维度。
type Dimension struct {
	Key         string        `json:"key"`              // 唯一 key,例如 "resolution"
	Label       string        `json:"label"`            // UI 显示名,例如 "输出分辨率"
	Description string        `json:"description"`      // 帮助文本
	Type        DimensionType `json:"type"`             // string / bool / int
	Options     []string      `json:"options,omitempty"` // string 类型时的候选值
	Modality    []string      `json:"modality,omitempty"` // 适用 modality,如 ["video"],空 = 所有
}

// DimensionExtractor 从请求体中提取某维度的值。
// 返回 (value, ok),ok=false 表示该维度在本请求中不可提取(规则若依赖该维度则视为不匹配)。
//
// 实现需要纯函数 / 无副作用,适合在请求关键路径中调用。
type DimensionExtractor func(modelName string, taskBody []byte) (any, bool)

var (
	dimensionRegistryMu sync.RWMutex
	dimensionRegistry   = map[string]registeredDimension{}
)

type registeredDimension struct {
	Dimension
	Extract DimensionExtractor
}

// RegisterDimension 由 task adapter 在 init() 调用。
// 同 key 重复注册会被覆盖(便于热更或单元测试 reset)。
func RegisterDimension(d Dimension, extract DimensionExtractor) {
	if d.Key == "" || extract == nil {
		return
	}
	dimensionRegistryMu.Lock()
	defer dimensionRegistryMu.Unlock()
	dimensionRegistry[d.Key] = registeredDimension{Dimension: d, Extract: extract}
}

// ListDimensions 返回所有已注册维度元数据(按 Key 排序),供前端 UI 渲染下拉/复选。
func ListDimensions() []Dimension {
	dimensionRegistryMu.RLock()
	defer dimensionRegistryMu.RUnlock()
	out := make([]Dimension, 0, len(dimensionRegistry))
	for _, r := range dimensionRegistry {
		out = append(out, r.Dimension)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

// ExtractDimensionValues 对所有已注册维度调用 extractor,返回当前请求的维度快照。
// 不可提取的维度从结果 map 里省略(规则若依赖会判定为不匹配)。
//
// 使用场景:ratio_setting 应用引擎拿到 map 后,逐条规则做 AND 匹配。
func ExtractDimensionValues(modelName string, taskBody []byte) map[string]any {
	dimensionRegistryMu.RLock()
	snap := make([]registeredDimension, 0, len(dimensionRegistry))
	for _, r := range dimensionRegistry {
		snap = append(snap, r)
	}
	dimensionRegistryMu.RUnlock()

	out := make(map[string]any, len(snap))
	for _, r := range snap {
		if v, ok := r.Extract(modelName, taskBody); ok {
			out[r.Key] = v
		}
	}
	return out
}
