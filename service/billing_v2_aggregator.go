package service

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// 文件用途:为账单页面 v2 提供聚合查询能力。
//
// 复用 doris_billing_query.go 里的 BillingFilter + buildBillingWhere,
// 新增 4 个查询函数:
//   - BillingV2Overview      总消费 / 调用次数 / 同比
//   - BillingV2Breakdown     按 model | token 聚合(取 topN + others)
//   - BillingV2Timeseries    按 day | hour 聚合时间线
//   - BillingV2Anomalies     异常请求(P0:high_cost,即单次 quota > 用户 P99 × 2)
//
// 所有查询都基于 billing_records 表,user-facing,因此 channel_* 字段
// 仅在 query 内部出现于 WHERE,不会出现在返回结构。

// BillingV2OverviewMetrics 是 Overview 接口的核心数字。
type BillingV2OverviewMetrics struct {
	Quota        int
	RequestCount int
	TotalTokens  int
}

// QueryBillingV2Overview 查询给定时间窗口内的聚合指标。
// 上层(controller)负责调两次:本期、上一周期同期,做同比。
// Doris 未启用时自动回退到 MySQL 实现，详见 billing_v2_mysql.go。
func QueryBillingV2Overview(filter BillingFilter) (*BillingV2OverviewMetrics, error) {
	if !dorisAvailable() {
		return queryBillingV2OverviewMySQL(filter)
	}
	db, err := getDorisDB()
	if err != nil {
		return nil, fmt.Errorf("doris connection: %w", err)
	}
	whereClause, args := buildBillingWhere(filter)
	table := fmt.Sprintf("`%s`.`%s`", common.DorisDatabase, billingTable)

	sqlStr := fmt.Sprintf(
		"SELECT IFNULL(SUM(quota),0) AS q, COUNT(*) AS c, IFNULL(SUM(total_tokens),0) AS t FROM %s %s",
		table, whereClause)
	row := db.QueryRow(sqlStr, args...)
	var m BillingV2OverviewMetrics
	if err := row.Scan(&m.Quota, &m.RequestCount, &m.TotalTokens); err != nil {
		if err == sql.ErrNoRows {
			return &m, nil
		}
		return nil, fmt.Errorf("billing v2 overview: %w", err)
	}
	return &m, nil
}

// BillingV2BreakdownRow 单条聚合结果(模型或 Token)。
type BillingV2BreakdownRow struct {
	Key          string
	Quota        int
	RequestCount int
	TotalTokens  int
}

// QueryBillingV2Breakdown 按 dim(model | token)聚合,返回所有 group(由上层做 topN + others)。
// Doris 未启用时自动回退到 MySQL 实现。
func QueryBillingV2Breakdown(filter BillingFilter, dim string) ([]BillingV2BreakdownRow, int, error) {
	if !dorisAvailable() {
		return queryBillingV2BreakdownMySQL(filter, dim)
	}
	db, err := getDorisDB()
	if err != nil {
		return nil, 0, fmt.Errorf("doris connection: %w", err)
	}

	var keyExpr string
	switch dim {
	case "model":
		keyExpr = "model_name"
	case "token":
		// token_name 可能为空,fallback 到 "default"
		keyExpr = "IFNULL(NULLIF(token_name, ''), 'default')"
	default:
		return nil, 0, fmt.Errorf("unsupported dim: %s", dim)
	}

	whereClause, args := buildBillingWhere(filter)
	table := fmt.Sprintf("`%s`.`%s`", common.DorisDatabase, billingTable)
	sqlStr := fmt.Sprintf(
		"SELECT %s AS k, SUM(quota) AS q, COUNT(*) AS c, SUM(total_tokens) AS t "+
			"FROM %s %s GROUP BY k ORDER BY q DESC",
		keyExpr, table, whereClause)
	rows, err := db.Query(sqlStr, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("billing v2 breakdown query: %w", err)
	}
	defer rows.Close()

	var out []BillingV2BreakdownRow
	totalQuota := 0
	for rows.Next() {
		var r BillingV2BreakdownRow
		if err := rows.Scan(&r.Key, &r.Quota, &r.RequestCount, &r.TotalTokens); err != nil {
			return nil, 0, fmt.Errorf("billing v2 breakdown scan: %w", err)
		}
		out = append(out, r)
		totalQuota += r.Quota
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("billing v2 breakdown rows: %w", err)
	}
	return out, totalQuota, nil
}

// BillingV2TimeseriesRow 时间序列上的一个点。
type BillingV2TimeseriesRow struct {
	Bucket       string // YYYY-MM-DD 或 YYYY-MM-DD HH:00
	Quota        int
	RequestCount int
	TotalTokens  int
}

// QueryBillingV2Timeseries 按 granularity(day | hour)切片聚合。
// granularity=day 推荐用于 30 天范围,hour 用于 24-48 小时范围。
// Doris 未启用时自动回退到 MySQL 实现。
func QueryBillingV2Timeseries(filter BillingFilter, granularity string) ([]BillingV2TimeseriesRow, error) {
	if !dorisAvailable() {
		return queryBillingV2TimeseriesMySQL(filter, granularity)
	}
	db, err := getDorisDB()
	if err != nil {
		return nil, fmt.Errorf("doris connection: %w", err)
	}

	var bucketExpr string
	switch granularity {
	case "hour":
		bucketExpr = "DATE_FORMAT(created_at, '%Y-%m-%d %H:00')"
	default:
		bucketExpr = "DATE_FORMAT(created_at, '%Y-%m-%d')"
	}

	whereClause, args := buildBillingWhere(filter)
	table := fmt.Sprintf("`%s`.`%s`", common.DorisDatabase, billingTable)
	sqlStr := fmt.Sprintf(
		"SELECT %s AS bucket, SUM(quota) AS q, COUNT(*) AS c, SUM(total_tokens) AS t "+
			"FROM %s %s GROUP BY bucket ORDER BY bucket ASC",
		bucketExpr, table, whereClause)
	rows, err := db.Query(sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("billing v2 timeseries: %w", err)
	}
	defer rows.Close()

	var out []BillingV2TimeseriesRow
	for rows.Next() {
		var r BillingV2TimeseriesRow
		if err := rows.Scan(&r.Bucket, &r.Quota, &r.RequestCount, &r.TotalTokens); err != nil {
			return nil, fmt.Errorf("billing v2 timeseries scan: %w", err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("billing v2 timeseries rows: %w", err)
	}
	return out, nil
}

// BillingV2AnomalyRow 异常请求识别结果(P0:high_cost)。
//
// 算法:用 Doris 的 PERCENTILE 函数算出当前用户在窗口内的 P99 单次消费,
// 取「单次 quota > P99 × 2」的请求作为异常,按消费倒序返回 top N。
//
// limit 一般传 50。识别条件:single_quota > 2 × percentile(quota, 0.99)
type BillingV2AnomalyRow struct {
	RequestId    string
	CreatedAt    string
	ModelName    string
	TokenName    string
	PromptTokens int
	Quota        int
	P99x2        int // 当时的 P99 × 2 阈值,用于前端展示「相对均值多少倍」
}

// QueryBillingV2HighCostAnomalies 识别 high_cost 异常请求。
//
// 实现:先单独查 P99 × 2 的阈值,再 WHERE quota > 阈值 列出 top N。
// 如果窗口内总请求数 < 20,P99 不可信,直接返回空。
// Doris 未启用时回退到 MySQL 近似算法（avg × 10）。
func QueryBillingV2HighCostAnomalies(filter BillingFilter, limit int) ([]BillingV2AnomalyRow, int, error) {
	if !dorisAvailable() {
		return queryBillingV2HighCostAnomaliesMySQL(filter, limit)
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	db, err := getDorisDB()
	if err != nil {
		return nil, 0, fmt.Errorf("doris connection: %w", err)
	}
	whereClause, args := buildBillingWhere(filter)
	table := fmt.Sprintf("`%s`.`%s`", common.DorisDatabase, billingTable)

	// step 1: 查 P99 × 2 阈值 + 总请求数
	thresholdSQL := fmt.Sprintf(
		"SELECT COUNT(*) AS n, IFNULL(PERCENTILE(quota, 0.99), 0) AS p99 FROM %s %s",
		table, whereClause)
	var n int
	var p99 float64
	if err := db.QueryRow(thresholdSQL, args...).Scan(&n, &p99); err != nil {
		return nil, 0, fmt.Errorf("billing v2 anomaly threshold: %w", err)
	}
	if n < 20 || p99 <= 0 {
		return []BillingV2AnomalyRow{}, 0, nil
	}
	threshold := int(p99 * 2)

	// step 2: 列出 top N 异常
	listSQL := fmt.Sprintf(
		"SELECT request_id, created_at, model_name, IFNULL(NULLIF(token_name, ''), 'default') AS tn, "+
			"prompt_tokens, quota FROM %s %s AND quota > ? ORDER BY quota DESC LIMIT ?",
		table,
		// 把 WHERE 替换成 WHERE 1=1 AND ... 形式,确保后续 AND 不破坏语法
		strings.Replace(ensureLeadingWhere(whereClause), "WHERE", "WHERE 1=1 AND", 1))
	listArgs := append(append([]interface{}{}, args...), threshold, limit)
	rows, err := db.Query(listSQL, listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("billing v2 anomaly list: %w", err)
	}
	defer rows.Close()

	var out []BillingV2AnomalyRow
	for rows.Next() {
		r := BillingV2AnomalyRow{P99x2: threshold}
		if err := rows.Scan(&r.RequestId, &r.CreatedAt, &r.ModelName, &r.TokenName, &r.PromptTokens, &r.Quota); err != nil {
			return nil, 0, fmt.Errorf("billing v2 anomaly scan: %w", err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("billing v2 anomaly rows: %w", err)
	}
	// 总数(不限 limit)
	totalSQL := fmt.Sprintf(
		"SELECT COUNT(*) FROM %s %s AND quota > ?",
		table, strings.Replace(ensureLeadingWhere(whereClause), "WHERE", "WHERE 1=1 AND", 1))
	totalArgs := append(append([]interface{}{}, args...), threshold)
	var total int
	if err := db.QueryRow(totalSQL, totalArgs...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("billing v2 anomaly count: %w", err)
	}
	return out, total, nil
}

// ensureLeadingWhere 给空 whereClause 补一个 "WHERE 1=1",方便后续追加 AND 条件。
func ensureLeadingWhere(whereClause string) string {
	if strings.TrimSpace(whereClause) == "" {
		return "WHERE 1=1"
	}
	return whereClause
}
