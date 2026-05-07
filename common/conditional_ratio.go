package common

import (
	"sort"
	"strings"
	"sync"
)

// 通用「模型条件分价」框架。
//
// 各 task adapter 在 init() 时通过 RegisterConditionalRatioFamily 注册自己的 family
// 元数据(family key / 显示名 / 条件列表 / 默认乘子);admin 在「价格配置」UI 上
// 看到所有已注册族 + 默认乘子,可逐项启用 / 调整 multiplier。adapter 在
// AdjustBillingOnSubmit 中提取条件参数后调 GetConditionalRatio(family, key) 拿乘子,
// 框架按 baseQuota × ∏OtherRatios × groupRatio 自动重算预扣 / 终态结算。
//
// 数据流:
//   - 后端注册表(进程内 map): adapter init() -> RegisterConditionalRatioFamily
//   - admin 配置(JSON 字符串,DB 存): ConditionalRatios option,Set/Get 通过本文件
//   - 默认值: ConditionalRatioDefaultJSON 从注册表自动生成,新 family 加入即时可见
//
// 新增族的范式:写一个 register.go 文件 init() 调本文件 Register,Adaptor.AdjustBillingOnSubmit
// 提取参数后调 GetConditionalRatio。**前端零改动**。

// ConditionalRatioCondition 描述一条「条件 -> 乘子」规则。
type ConditionalRatioCondition struct {
	Key        string  `json:"key"`        // 条件名,例如 "1080p_with_video"
	Label      string  `json:"label"`      // UI 显示名
	Match      string  `json:"match"`      // 匹配条件描述(给 admin 看的人话)
	Hint       string  `json:"hint"`       // 来源备注(例如「官方 31 元/M」)
	DefaultMul float64 `json:"defaultMul"` // 默认乘子(基准价的相对系数)
}

// ConditionalRatioFamily 一个条件分价「族」:对应一组在条件上有变化的同源模型。
type ConditionalRatioFamily struct {
	Key        string                      `json:"key"`      // family 唯一 key,例如 "seedance-2-0"
	Label      string                      `json:"label"`    // UI 标题
	BaseHint   string                      `json:"baseHint"` // 基准价说明文案
	Conditions []ConditionalRatioCondition `json:"conditions"`
	// MatchModel 用于让 adapter 在没有明确 family key 时通过 modelName 反查 family;
	// 可选;不影响 admin UI 与 GetConditionalRatio 路径。
	MatchModel func(modelName string) bool `json:"-"`
}

// 注册表(进程内,启动时填充)。
var (
	conditionalFamilyMu sync.RWMutex
	conditionalFamilies = map[string]ConditionalRatioFamily{}
)

// RegisterConditionalRatioFamily 由各 adapter 在 init() 中调用。
// 重复 key 会被覆盖(后注册者赢,便于单元测试 reset)。
func RegisterConditionalRatioFamily(f ConditionalRatioFamily) {
	if f.Key == "" {
		return
	}
	conditionalFamilyMu.Lock()
	defer conditionalFamilyMu.Unlock()
	conditionalFamilies[f.Key] = f
}

// ListConditionalRatioFamilies 返回所有已注册 family 的拷贝(按 Key 排序)。
// 用于 controller 把元数据吐给前端 UI 渲染。
func ListConditionalRatioFamilies() []ConditionalRatioFamily {
	conditionalFamilyMu.RLock()
	defer conditionalFamilyMu.RUnlock()
	out := make([]ConditionalRatioFamily, 0, len(conditionalFamilies))
	for _, f := range conditionalFamilies {
		out = append(out, f)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

// FindConditionalRatioFamilyByModel 通过 modelName 反查 family(供 adapter 复用)。
func FindConditionalRatioFamilyByModel(modelName string) (ConditionalRatioFamily, bool) {
	conditionalFamilyMu.RLock()
	defer conditionalFamilyMu.RUnlock()
	for _, f := range conditionalFamilies {
		if f.MatchModel != nil && f.MatchModel(modelName) {
			return f, true
		}
	}
	return ConditionalRatioFamily{}, false
}

// ────────────────────────────────────────────────────────────────────────────
// 配置 store
// ────────────────────────────────────────────────────────────────────────────

type conditionalRatioEntry struct {
	Enabled    bool    `json:"enabled"`
	Multiplier float64 `json:"multiplier"`
}

type conditionalRatioState struct {
	Enabled bool                                        `json:"enabled"`
	Models  map[string]map[string]conditionalRatioEntry `json:"models"`
}

var (
	condStateMu sync.RWMutex
	condState   *conditionalRatioState
)

// ConditionalRatioDefaultJSON 由注册表生成默认 JSON,admin 第一次访问 UI 即可
// 看到全部已注册族的默认乘子。
func ConditionalRatioDefaultJSON() string {
	state := conditionalRatioState{
		Enabled: true,
		Models:  map[string]map[string]conditionalRatioEntry{},
	}
	for _, f := range ListConditionalRatioFamilies() {
		conds := map[string]conditionalRatioEntry{}
		for _, c := range f.Conditions {
			conds[c.Key] = conditionalRatioEntry{Enabled: true, Multiplier: c.DefaultMul}
		}
		state.Models[f.Key] = conds
	}
	b, err := Marshal(state)
	if err != nil {
		return `{"enabled":true,"models":{}}`
	}
	return string(b)
}

// SetConditionalRatios 由 model.option 在 InitOptionMap / updateOptionMap 调用。
// 解析出错或为空时回退到注册表默认值。
func SetConditionalRatios(jsonStr string) {
	state := parseConditionalRatioJSON(jsonStr)
	condStateMu.Lock()
	condState = state
	condStateMu.Unlock()
	ConditionalRatios = jsonStr
}

// parseConditionalRatioJSON 解析 admin 写入的 JSON;若解析失败 / 为空 / 注册表
// 中存在 admin 没配过的新 family,自动 backfill 默认值,保证服务可用。
func parseConditionalRatioJSON(jsonStr string) *conditionalRatioState {
	src := strings.TrimSpace(jsonStr)
	state := conditionalRatioState{
		Enabled: true,
		Models:  map[string]map[string]conditionalRatioEntry{},
	}
	if src != "" {
		if err := Unmarshal([]byte(src), &state); err != nil {
			// 解析失败 -> 回退到注册表默认
			_ = Unmarshal([]byte(ConditionalRatioDefaultJSON()), &state)
		}
	}
	if state.Models == nil {
		state.Models = map[string]map[string]conditionalRatioEntry{}
	}
	// backfill: 注册表里有但 admin 配置中没有的 family / condition,补默认值
	for _, f := range ListConditionalRatioFamilies() {
		if _, ok := state.Models[f.Key]; !ok {
			state.Models[f.Key] = map[string]conditionalRatioEntry{}
		}
		for _, c := range f.Conditions {
			if _, ok := state.Models[f.Key][c.Key]; !ok {
				state.Models[f.Key][c.Key] = conditionalRatioEntry{
					Enabled:    true,
					Multiplier: c.DefaultMul,
				}
			}
		}
	}
	return &state
}

// ConditionalRatioEnabled 返回总开关。false 时所有 family 不应用乘子。
func ConditionalRatioEnabled() bool {
	condStateMu.RLock()
	defer condStateMu.RUnlock()
	if condState == nil {
		return true
	}
	return condState.Enabled
}

// GetConditionalRatio 返回 (family, condKey) 的乘子与是否启用。
// 未启用 / 未配置 / multiplier <= 0 时返回 ok=false,adapter 应跳过该乘子。
func GetConditionalRatio(familyKey, condKey string) (float64, bool) {
	condStateMu.RLock()
	state := condState
	condStateMu.RUnlock()
	if state == nil {
		state = parseConditionalRatioJSON("")
	}
	if !state.Enabled {
		return 0, false
	}
	conds, ok := state.Models[familyKey]
	if !ok {
		return 0, false
	}
	c, ok := conds[condKey]
	if !ok || !c.Enabled || c.Multiplier <= 0 {
		return 0, false
	}
	return c.Multiplier, true
}
