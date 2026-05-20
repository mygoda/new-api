package service

import (
	"fmt"
	"sort"
	"time"

	"gorm.io/gorm"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
)

// 文件用途：账单 v2 在 Doris 未启用时的 MySQL/PostgreSQL/SQLite 回退实现。
//
// 启用条件由 dorisAvailable() 控制：
//   common.DorisEnabled && setting.DorisLogEnabled  → 走 Doris（原实现）
//   否则                                              → 走本文件的 MySQL 回退
//
// 数据源：model.LOG_DB 的 logs 表，过滤 type=LogTypeConsume(2) 即成功消费记录。
//
// 字段差异（logs 表 vs Doris billing_records）：
//   - cache_tokens / model_ratio / group_ratio / model_price / cache_creation_tokens
//     logs 表本身没有这些列，但 RecordConsumeLog 在写入时把它们塞到 Other JSON。
//   - is_success：logs 表 type=2 即代表成功，等价 true。
//   - use_time_ms：logs.use_time 单位是秒，乘 1000 得到毫秒。
//
// 跨数据库兼容（CLAUDE.md Rule 2）：
//   - 全部使用 GORM 链式 API。
//   - created_at 是 int64，所有 DB 数值比较通吃。
//   - SUM/COUNT/AVG 用 COALESCE（MySQL/PG/SQLite 通用），避免 IFNULL 不兼容 PG。
//   - 时间分桶在 Go 层做，避免 DATE_FORMAT/to_char/strftime 三家差异。

// dorisAvailable 是 service 层入口分流：true → Doris 查询；false → MySQL 回退。
func dorisAvailable() bool {
	return common.DorisEnabled && setting.DorisLogEnabled
}

// parseBillingTime 把 BillingFilter 里的 "2006-01-02 15:04:05" 字符串转为 Unix timestamp。
// 空串或解析失败返回 0，表示「不限」。
func parseBillingTime(s string) int64 {
	if s == "" {
		return 0
	}
	if t, err := time.ParseInLocation("2006-01-02 15:04:05", s, time.Local); err == nil {
		return t.Unix()
	}
	return 0
}

// formatBillingTime 把 Unix timestamp 转回 Doris 风格的字符串，对齐前端展示。
func formatBillingTime(ts int64) string {
	if ts <= 0 {
		return ""
	}
	return time.Unix(ts, 0).Format("2006-01-02 15:04:05")
}

// applyBillingFilter 把 BillingFilter 翻译成 logs 表的 WHERE 链。
// 默认仅 type=LogTypeConsume(成功消费);若 f.IncludeFailures=true,扩展为
// IN (LogTypeConsume, LogTypeError),让账单明细可以展示失败请求。
func applyBillingFilter(tx *gorm.DB, f BillingFilter) *gorm.DB {
	if f.IncludeFailures {
		tx = tx.Where("type IN (?)", []int{model.LogTypeConsume, model.LogTypeError})
	} else {
		tx = tx.Where("type = ?", model.LogTypeConsume)
	}
	if f.UserId > 0 {
		tx = tx.Where("user_id = ?", f.UserId)
	} else if len(f.UserIds) > 0 {
		tx = tx.Where("user_id IN (?)", f.UserIds)
	}
	if f.TokenId > 0 {
		tx = tx.Where("token_id = ?", f.TokenId)
	}
	if len(f.TokenNames) > 0 {
		tx = tx.Where("token_name IN (?)", f.TokenNames)
	} else if f.TokenName != "" {
		tx = tx.Where("token_name = ?", f.TokenName)
	}
	if len(f.ModelNames) > 0 {
		tx = tx.Where("model_name IN (?)", f.ModelNames)
	} else if f.ModelName != "" {
		tx = tx.Where("model_name LIKE ?", "%"+f.ModelName+"%")
	}
	if f.ChannelId > 0 {
		tx = tx.Where("channel_id = ?", f.ChannelId)
	}
	if start := parseBillingTime(f.StartTime); start > 0 {
		tx = tx.Where("created_at >= ?", start)
	}
	if end := parseBillingTime(f.EndTime); end > 0 {
		tx = tx.Where("created_at <= ?", end)
	}
	return tx
}

// queryBillingV2OverviewMySQL —— 见 QueryBillingV2Overview 注释。
func queryBillingV2OverviewMySQL(f BillingFilter) (*BillingV2OverviewMetrics, error) {
	var row struct {
		Quota        int64
		RequestCount int64
		TotalTokens  int64
	}
	if err := applyBillingFilter(model.LOG_DB.Table("logs"), f).
		Select("COALESCE(SUM(quota),0) AS quota, COUNT(*) AS request_count, " +
			"COALESCE(SUM(prompt_tokens+completion_tokens),0) AS total_tokens").
		Scan(&row).Error; err != nil {
		return nil, fmt.Errorf("billing v2 overview (mysql): %w", err)
	}
	return &BillingV2OverviewMetrics{
		Quota:        int(row.Quota),
		RequestCount: int(row.RequestCount),
		TotalTokens:  int(row.TotalTokens),
	}, nil
}

// queryBillingV2BreakdownMySQL —— 见 QueryBillingV2Breakdown 注释。
func queryBillingV2BreakdownMySQL(f BillingFilter, dim string) ([]BillingV2BreakdownRow, int, error) {
	var keyCol string
	switch dim {
	case "model":
		keyCol = "model_name"
	case "token":
		keyCol = "token_name"
	default:
		return nil, 0, fmt.Errorf("unsupported dim: %s", dim)
	}

	var rows []struct {
		K string
		Q int64
		C int64
		T int64
	}
	if err := applyBillingFilter(model.LOG_DB.Table("logs"), f).
		Select(keyCol + " AS k, COALESCE(SUM(quota),0) AS q, COUNT(*) AS c, " +
			"COALESCE(SUM(prompt_tokens+completion_tokens),0) AS t").
		Group(keyCol).
		Order("q DESC").
		Scan(&rows).Error; err != nil {
		return nil, 0, fmt.Errorf("billing v2 breakdown (mysql): %w", err)
	}

	out := make([]BillingV2BreakdownRow, 0, len(rows))
	totalQuota := 0
	for _, r := range rows {
		key := r.K
		if dim == "token" && key == "" {
			key = "default"
		}
		out = append(out, BillingV2BreakdownRow{
			Key:          key,
			Quota:        int(r.Q),
			RequestCount: int(r.C),
			TotalTokens:  int(r.T),
		})
		totalQuota += int(r.Q)
	}
	return out, totalQuota, nil
}

// queryBillingV2TimeseriesMySQL —— 拉数据后在 Go 层分桶，避免 DB 时间函数差异。
func queryBillingV2TimeseriesMySQL(f BillingFilter, granularity string) ([]BillingV2TimeseriesRow, error) {
	var raws []struct {
		CreatedAt        int64
		Quota            int
		PromptTokens     int
		CompletionTokens int
	}
	if err := applyBillingFilter(model.LOG_DB.Table("logs"), f).
		Select("created_at, quota, prompt_tokens, completion_tokens").
		Scan(&raws).Error; err != nil {
		return nil, fmt.Errorf("billing v2 timeseries (mysql): %w", err)
	}

	layout := "2006-01-02"
	if granularity == "hour" {
		layout = "2006-01-02 15:00"
	}

	buckets := map[string]*BillingV2TimeseriesRow{}
	for _, r := range raws {
		key := time.Unix(r.CreatedAt, 0).Format(layout)
		b, ok := buckets[key]
		if !ok {
			b = &BillingV2TimeseriesRow{Bucket: key}
			buckets[key] = b
		}
		b.Quota += r.Quota
		b.RequestCount++
		b.TotalTokens += r.PromptTokens + r.CompletionTokens
	}
	out := make([]BillingV2TimeseriesRow, 0, len(buckets))
	for _, b := range buckets {
		out = append(out, *b)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Bucket < out[j].Bucket })
	return out, nil
}

// queryBillingV2HighCostAnomaliesMySQL 用 quota > avg×10 的近似算法识别异常。
// 与 Doris 的 P99×2 不同，精度较低；样本不足（<20）时返回空。
func queryBillingV2HighCostAnomaliesMySQL(f BillingFilter, limit int) ([]BillingV2AnomalyRow, int, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	var stats struct {
		Avg float64
		Cnt int64
	}
	if err := applyBillingFilter(model.LOG_DB.Table("logs"), f).
		Select("COALESCE(AVG(quota),0) AS avg, COUNT(*) AS cnt").
		Scan(&stats).Error; err != nil {
		return nil, 0, fmt.Errorf("billing v2 anomaly stats (mysql): %w", err)
	}
	if stats.Cnt < 20 || stats.Avg <= 0 {
		return []BillingV2AnomalyRow{}, 0, nil
	}
	threshold := int(stats.Avg * 10)

	var raws []struct {
		RequestId    string
		CreatedAt    int64
		ModelName    string
		TokenName    string
		PromptTokens int
		Quota        int
	}
	if err := applyBillingFilter(model.LOG_DB.Table("logs"), f).
		Where("quota > ?", threshold).
		Order("quota DESC").
		Limit(limit).
		Select("request_id, created_at, model_name, token_name, prompt_tokens, quota").
		Scan(&raws).Error; err != nil {
		return nil, 0, fmt.Errorf("billing v2 anomaly list (mysql): %w", err)
	}

	out := make([]BillingV2AnomalyRow, 0, len(raws))
	for _, r := range raws {
		tn := r.TokenName
		if tn == "" {
			tn = "default"
		}
		out = append(out, BillingV2AnomalyRow{
			RequestId:    r.RequestId,
			CreatedAt:    formatBillingTime(r.CreatedAt),
			ModelName:    r.ModelName,
			TokenName:    tn,
			PromptTokens: r.PromptTokens,
			Quota:        r.Quota,
			P99x2:        threshold,
		})
	}

	var total int64
	if err := applyBillingFilter(model.LOG_DB.Table("logs"), f).
		Where("quota > ?", threshold).
		Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("billing v2 anomaly count (mysql): %w", err)
	}
	return out, int(total), nil
}

// queryBillingRecordsMySQL 用于 v2 details 分页查询，解析 Other JSON 补齐 Doris 才有的字段。
func queryBillingRecordsMySQL(f BillingFilter, page, pageSize int) (*BillingQueryResult, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 500 {
		pageSize = 50
	}

	var total int64
	if err := applyBillingFilter(model.LOG_DB.Table("logs"), f).
		Count(&total).Error; err != nil {
		return nil, fmt.Errorf("billing records count (mysql): %w", err)
	}

	var logs []model.Log
	if err := applyBillingFilter(model.LOG_DB.Model(&model.Log{}), f).
		Order("created_at DESC, id DESC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&logs).Error; err != nil {
		return nil, fmt.Errorf("billing records query (mysql): %w", err)
	}

	items := make([]BillingRecord, 0, len(logs))
	for _, l := range logs {
		var (
			cacheTokens         int
			cacheCreationTokens int
			modelRatio          float64
			groupRatio          float64
			modelPrice          float64
		)
		if l.Other != "" {
			var other map[string]any
			if err := common.UnmarshalJsonStr(l.Other, &other); err == nil {
				cacheTokens = intFromAny(other["cache_tokens"])
				cacheCreationTokens = intFromAny(other["cache_creation_tokens"])
				modelRatio = floatFromAny(other["model_ratio"])
				groupRatio = floatFromAny(other["group_ratio"])
				modelPrice = floatFromAny(other["model_price"])
			}
		}
		items = append(items, BillingRecord{
			RequestId:           l.RequestId,
			UserId:              l.UserId,
			TokenId:             l.TokenId,
			TokenName:           l.TokenName,
			TokenKey:            "",
			UserGroup:           l.Group,
			UsingGroup:          l.Group,
			ModelName:           l.ModelName,
			ChannelId:           l.ChannelId,
			ChannelName:         l.ChannelName,
			PromptTokens:        l.PromptTokens,
			CompletionTokens:    l.CompletionTokens,
			TotalTokens:         l.PromptTokens + l.CompletionTokens + cacheTokens,
			CacheTokens:         cacheTokens,
			CacheCreationTokens: cacheCreationTokens,
			Quota:               l.Quota,
			ModelRatio:          modelRatio,
			GroupRatio:          groupRatio,
			ModelPrice:          modelPrice,
			IsSuccess:           l.Type == model.LogTypeConsume,
			UseTimeMs:           int64(l.UseTime) * 1000,
			CreatedAt:           formatBillingTime(l.CreatedAt),
		})
	}
	return &BillingQueryResult{
		Total: int(total),
		Items: items,
	}, nil
}

// intFromAny / floatFromAny —— 从 map[string]any 安全取数值字段。
// encoding/json 默认把数字解为 float64，单独覆盖 int / int64 防御性兜底。
func intFromAny(v any) int {
	switch x := v.(type) {
	case nil:
		return 0
	case float64:
		return int(x)
	case int:
		return x
	case int64:
		return int(x)
	}
	return 0
}

func floatFromAny(v any) float64 {
	switch x := v.(type) {
	case nil:
		return 0
	case float64:
		return x
	case int:
		return float64(x)
	case int64:
		return float64(x)
	}
	return 0
}
