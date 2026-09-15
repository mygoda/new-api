package dto

// ProviderRouting 对应 OpenRouter 风格的请求体 `provider` 对象，在 new-api 里映射为「分组选择」。
// 仅用于分发阶段决定走哪些分组，不转发上游。
type ProviderRouting struct {
	Order          []string `json:"order,omitempty"`           // 优先顺序（分组名）
	Only           []string `json:"only,omitempty"`            // 硬白名单：候选全集限定为这些分组
	Ignore         []string `json:"ignore,omitempty"`          // 排除的分组
	Avoid          []string `json:"avoid,omitempty"`           // 排除的分组（ignore 的别名，取并集）
	AllowFallbacks *bool    `json:"allow_fallbacks,omitempty"` // 缺省 true；false=只用显式指定的分组
	Sort           string   `json:"sort,omitempty"`            // v1 解析但忽略（无 per-group 指标）
}
