package dto

// BillingV2 用户视角下的账单数据 DTO。
//
// 重要约束:这一组类型严格不暴露任何「渠道(channel)」相关字段——
// channel_id / channel_name / 上游 endpoint 都属于平台运营机密,
// 仅在 admin 接口的 BillingRecord(service.BillingRecord)中保留。
//
// 转换函数(BillingRecord -> BillingDetailUserDTO)不在此文件,
// 因为 dto 包不应反向 import service(避免循环依赖)。
// 转换在 controller/billing_v2.go 里完成,只复制白名单字段。

// BillingDetailUserDTO 是 /api/billing/v2/details 返回的单条记录。
// 用户视角:可以看到模型 / token / 消费 / 状态,看不到 channel。
type BillingDetailUserDTO struct {
	RequestId        string  `json:"request_id"`
	CreatedAt        string  `json:"created_at"`
	ModelName        string  `json:"model_name"`
	TokenName        string  `json:"token_name"`
	UserGroup        string  `json:"user_group"`
	PromptTokens     int     `json:"prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens"`
	TotalTokens      int     `json:"total_tokens"`
	CacheTokens      int     `json:"cache_tokens"`
	Quota            int     `json:"quota"`
	ModelRatio       float64 `json:"model_ratio"`
	GroupRatio       float64 `json:"group_ratio"`
	IsSuccess        bool    `json:"is_success"`
	UseTimeMs        int64   `json:"use_time_ms"`
}

// BillingDetailListResponse 是 /api/billing/v2/details 的整体响应。
type BillingDetailListResponse struct {
	Total int                    `json:"total"`
	Items []BillingDetailUserDTO `json:"items"`
}

// BillingOverview 是 /api/billing/v2/overview 的响应。
//
// 字段含义:
//   - CurrentQuota:    当前周期(默认本月)累计消费(quota 整数,等同于额度)
//   - PrevQuota:       上一周期同期消费(用于同比环比)
//   - EstimatedTotal:  当前周期预计总消费(线性外推:daily_rate × 周期天数)
//   - RequestCount:    当前周期累计调用次数
//   - PrevRequestCount: 上一周期同期调用次数
//   - Balance:         用户当前钱包余额(int quota,前端按 QuotaPerUnit 转人民币)
type BillingOverview struct {
	CurrentQuota     int `json:"current_quota"`
	PrevQuota        int `json:"prev_quota"`
	EstimatedTotal   int `json:"estimated_total"`
	RequestCount     int `json:"request_count"`
	PrevRequestCount int `json:"prev_request_count"`
	Balance          int `json:"balance"`
}

// BillingBreakdownItem 是按维度聚合的单条结果(模型 / token)。
// 不包含 channel 字段。"others" 由后端聚合(超过 top N 的归到此项)。
type BillingBreakdownItem struct {
	Key          string  `json:"key"`           // model_name / token_name
	Label        string  `json:"label"`         // 展示名,模型同 Key,Token 用 TokenName
	Quota        int     `json:"quota"`         // 总消费
	RequestCount int     `json:"request_count"` // 调用次数
	TotalTokens  int     `json:"total_tokens"`  // 总 tokens
	Percent      float64 `json:"percent"`       // 占比 0-100
}

// BillingBreakdownResponse 是 /api/billing/v2/breakdown 的响应。
type BillingBreakdownResponse struct {
	Dimension  string                 `json:"dimension"` // "model" | "token"
	TotalQuota int                    `json:"total_quota"`
	Items      []BillingBreakdownItem `json:"items"`
}

// BillingTimeseriesPoint 是时间序列上的一个点。
type BillingTimeseriesPoint struct {
	Date         string `json:"date"` // "2026-05-09" 或 "2026-05-09 14:00"
	Quota        int    `json:"quota"`
	RequestCount int    `json:"request_count"`
	TotalTokens  int    `json:"total_tokens"`
}

// BillingTimeseriesResponse 是 /api/billing/v2/timeseries 的响应。
type BillingTimeseriesResponse struct {
	Granularity string                   `json:"granularity"` // "day" | "hour"
	Points      []BillingTimeseriesPoint `json:"points"`
}

// BillingAnomalyItem 异常请求识别结果。
//
// Type:
//   - "high_cost":     单次消费超过本人 P99 × 2
//   - "long_context":  prompt_tokens 超过模型上下文 80%(P1)
//   - "failed":        失败请求仍计费(P1)
//
// P0 仅识别 high_cost。
type BillingAnomalyItem struct {
	RequestId    string `json:"request_id"`
	CreatedAt    string `json:"created_at"`
	ModelName    string `json:"model_name"`
	TokenName    string `json:"token_name"`
	PromptTokens int    `json:"prompt_tokens"`
	Quota        int    `json:"quota"`
	Type         string `json:"type"`
	Severity     string `json:"severity"`     // "high" | "medium" | "low"
	HintMessage  string `json:"hint_message"`
}

// BillingAnomalyResponse 是 /api/billing/v2/anomalies 的响应。
type BillingAnomalyResponse struct {
	Total int                  `json:"total"`
	Items []BillingAnomalyItem `json:"items"`
}
