package common

import (
	"strings"
	"sync"
)

// 文件用途:Seedance 视频「条件分价」配置的解析与查询。
//
// admin 在「价格配置」UI 可视化勾选 + 编辑乘子,前端拼成 JSON 存入
// SeedanceConditionalRatios option,这里负责:
//   - 解析 JSON 字符串成内存结构(带读写锁)
//   - 给 backend pricing 提供 SeedanceConditionalRatio(family, key) 查询
//   - SetSeedanceConditionalRatios(jsonStr) 由 model.option 在 admin 保存时调用
//
// 默认值在 SeedanceConditionalDefaults 里硬编码,UI 显示「重置默认」时用。

type seedanceCondition struct {
	Enabled    bool    `json:"enabled"`
	Multiplier float64 `json:"multiplier"`
}

type seedanceConditionalConfig struct {
	Enabled bool                                    `json:"enabled"`
	Models  map[string]map[string]seedanceCondition `json:"models"`
}

var (
	seedanceCondMu     sync.RWMutex
	seedanceCondParsed *seedanceConditionalConfig
)

// SeedanceConditionalDefaultJSON 返回默认配置 JSON,数值与火山方舟 PDF 单价一致。
// 用作 admin 首次访问时的 placeholder,以及「重置默认」按钮的来源。
func SeedanceConditionalDefaultJSON() string {
	return `{
  "enabled": true,
  "models": {
    "seedance-1-5-pro": {
      "silent":       {"enabled": true, "multiplier": 0.5},
      "draft_audio":  {"enabled": true, "multiplier": 0.6},
      "draft_silent": {"enabled": true, "multiplier": 0.35}
    },
    "seedance-2-0": {
      "1080p_no_video":   {"enabled": true, "multiplier": 1.109},
      "720p_with_video":  {"enabled": true, "multiplier": 0.609},
      "1080p_with_video": {"enabled": true, "multiplier": 0.674}
    },
    "seedance-2-0-fast": {
      "with_video": {"enabled": true, "multiplier": 0.595}
    }
  }
}`
}

// SetSeedanceConditionalRatios 由 model.option 在 InitOptionMap / updateOptionMap 时调用。
func SetSeedanceConditionalRatios(jsonStr string) {
	cfg := parseSeedanceConditionalJSON(jsonStr)
	seedanceCondMu.Lock()
	seedanceCondParsed = cfg
	seedanceCondMu.Unlock()
	SeedanceConditionalRatios = jsonStr
}

func parseSeedanceConditionalJSON(jsonStr string) *seedanceConditionalConfig {
	src := strings.TrimSpace(jsonStr)
	if src == "" {
		src = SeedanceConditionalDefaultJSON()
	}
	cfg := seedanceConditionalConfig{}
	if err := Unmarshal([]byte(src), &cfg); err != nil {
		// JSON 损坏时回退到内置默认,保证服务可用
		_ = Unmarshal([]byte(SeedanceConditionalDefaultJSON()), &cfg)
	}
	return &cfg
}

// SeedanceConditionalEnabled 返回总开关状态。false 时 backend 不再应用条件乘子。
func SeedanceConditionalEnabled() bool {
	seedanceCondMu.RLock()
	defer seedanceCondMu.RUnlock()
	if seedanceCondParsed == nil {
		// 启动早期未初始化时按默认 true 处理
		return true
	}
	return seedanceCondParsed.Enabled
}

// SeedanceConditionalRatio 返回 (family, key) 对应的 multiplier 与是否启用。
//   family: "seedance-1-5-pro" / "seedance-2-0" / "seedance-2-0-fast"
//   key   : 模型内的条件名,例如 "silent" / "draft_audio" / "1080p_with_video"
//
// 返回 ok=false 表示该条件没配置或被 admin 禁用,backend 应跳过此乘子。
func SeedanceConditionalRatio(family, key string) (float64, bool) {
	seedanceCondMu.RLock()
	cfg := seedanceCondParsed
	seedanceCondMu.RUnlock()
	if cfg == nil {
		// 服务启动早期 fallback 到 PDF 默认
		cfg = parseSeedanceConditionalJSON("")
	}
	if !cfg.Enabled {
		return 0, false
	}
	conds, ok := cfg.Models[family]
	if !ok {
		return 0, false
	}
	c, ok := conds[key]
	if !ok || !c.Enabled || c.Multiplier <= 0 {
		return 0, false
	}
	return c.Multiplier, true
}
