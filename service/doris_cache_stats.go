package service

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// DorisCacheStatsFilter filters the aggregation (reuses most fields from DorisLogFilter).
// GroupBy controls the grouping dimension: "user" (default), "model", "day", "token", "channel".
type DorisCacheStatsFilter struct {
	UserId    int
	TokenId   int
	ModelName string
	ChannelId int
	UserGroup string
	IsSuccess *bool
	StartTime string
	EndTime   string
	GroupBy   string
}

// DorisCacheStatsRow is one aggregated row. Only the dimensions relevant to the GroupBy
// are populated; others are zero/empty. TotalInputTokens and CacheHitRate are derived.
type DorisCacheStatsRow struct {
	UserId                int     `json:"user_id,omitempty"`
	ModelName             string  `json:"model_name,omitempty"`
	Date                  string  `json:"date,omitempty"`
	TokenId               int     `json:"token_id,omitempty"`
	TokenName             string  `json:"token_name,omitempty"`
	ChannelId             int     `json:"channel_id,omitempty"`
	ChannelName           string  `json:"channel_name,omitempty"`
	RequestCount          int64   `json:"request_count"`
	PromptTokens          int64   `json:"prompt_tokens"`
	CacheTokens           int64   `json:"cache_tokens"`
	CacheCreationTokens   int64   `json:"cache_creation_tokens"`
	CacheCreationTokens5m int64   `json:"cache_creation_tokens_5m"`
	CacheCreationTokens1h int64   `json:"cache_creation_tokens_1h"`
	TotalInputTokens      int64   `json:"total_input_tokens"`
	CacheHitRate          float64 `json:"cache_hit_rate"`
}

type DorisCacheStatsResult struct {
	Total int                  `json:"total"`
	Items []DorisCacheStatsRow `json:"items"`
}

// validCacheStatsGroupBy returns the canonical group_by, defaulting to "user".
func validCacheStatsGroupBy(g string) string {
	switch g {
	case "model", "day", "token", "channel", "user":
		return g
	}
	return "user"
}

func buildCacheStatsWhere(filter DorisCacheStatsFilter) (string, []interface{}) {
	var conditions []string
	var args []interface{}

	if filter.UserId > 0 {
		conditions = append(conditions, "user_id = ?")
		args = append(args, filter.UserId)
	}
	if filter.TokenId > 0 {
		conditions = append(conditions, "token_id = ?")
		args = append(args, filter.TokenId)
	}
	if filter.ModelName != "" {
		conditions = append(conditions, "model_name LIKE ?")
		args = append(args, "%"+filter.ModelName+"%")
	}
	if filter.ChannelId > 0 {
		conditions = append(conditions, "channel_id = ?")
		args = append(args, filter.ChannelId)
	}
	if filter.UserGroup != "" {
		conditions = append(conditions, "using_group = ?")
		args = append(args, filter.UserGroup)
	}
	if filter.IsSuccess != nil {
		v := 0
		if *filter.IsSuccess {
			v = 1
		}
		conditions = append(conditions, "is_success = ?")
		args = append(args, v)
	}
	if filter.StartTime != "" {
		conditions = append(conditions, "created_at >= ?")
		args = append(args, filter.StartTime)
	}
	if filter.EndTime != "" {
		conditions = append(conditions, "created_at <= ?")
		args = append(args, filter.EndTime)
	}

	if len(conditions) == 0 {
		return "", args
	}
	return "WHERE " + strings.Join(conditions, " AND "), args
}

// QueryDorisCacheStats aggregates cache-related token usage grouped by the chosen dimension.
// Returns rows sorted by cache_tokens DESC (the usual "top cache users" ordering).
func QueryDorisCacheStats(filter DorisCacheStatsFilter, page, pageSize int) (*DorisCacheStatsResult, error) {
	db, err := getDorisDB()
	if err != nil {
		return nil, fmt.Errorf("doris connection: %w", err)
	}

	groupBy := validCacheStatsGroupBy(filter.GroupBy)
	whereClause, args := buildCacheStatsWhere(filter)
	table := fmt.Sprintf("`%s`.`%s`", common.DorisDatabase, common.DorisTable)

	var selectDims, groupClause, countDistinct string
	switch groupBy {
	case "model":
		selectDims = "0 AS user_id, model_name, '' AS date, 0 AS token_id, '' AS token_name, 0 AS channel_id, '' AS channel_name"
		groupClause = "GROUP BY model_name"
		countDistinct = "DISTINCT model_name"
	case "day":
		selectDims = "0 AS user_id, '' AS model_name, DATE(created_at) AS date, 0 AS token_id, '' AS token_name, 0 AS channel_id, '' AS channel_name"
		groupClause = "GROUP BY DATE(created_at)"
		countDistinct = "DISTINCT DATE(created_at)"
	case "token":
		selectDims = "0 AS user_id, '' AS model_name, '' AS date, token_id, token_name, 0 AS channel_id, '' AS channel_name"
		groupClause = "GROUP BY token_id, token_name"
		countDistinct = "DISTINCT token_id, token_name"
	case "channel":
		selectDims = "0 AS user_id, '' AS model_name, '' AS date, 0 AS token_id, '' AS token_name, channel_id, channel_name"
		groupClause = "GROUP BY channel_id, channel_name"
		countDistinct = "DISTINCT channel_id, channel_name"
	default: // "user"
		selectDims = "user_id, '' AS model_name, '' AS date, 0 AS token_id, '' AS token_name, 0 AS channel_id, '' AS channel_name"
		groupClause = "GROUP BY user_id"
		countDistinct = "DISTINCT user_id"
	}

	aggCols := ", COUNT(*) AS request_count, " +
		"SUM(prompt_tokens) AS prompt_tokens, " +
		"SUM(cache_tokens) AS cache_tokens, " +
		"SUM(IFNULL(cache_creation_tokens, 0)) AS cache_creation_tokens, " +
		"SUM(IFNULL(cache_creation_tokens_5m, 0)) AS cache_creation_tokens_5m, " +
		"SUM(IFNULL(cache_creation_tokens_1h, 0)) AS cache_creation_tokens_1h"

	// COUNT(distinct groups) for pagination total
	type countResult struct {
		total int
		err   error
	}
	countCh := make(chan countResult, 1)
	go func() {
		countSQL := fmt.Sprintf("SELECT COUNT(%s) FROM %s %s", countDistinct, table, whereClause)
		var total int
		if err := db.QueryRow(countSQL, args...).Scan(&total); err != nil {
			countCh <- countResult{0, fmt.Errorf("doris cache stats count: %w", err)}
		} else {
			countCh <- countResult{total, nil}
		}
	}()

	offset := (page - 1) * pageSize
	dataSQL := fmt.Sprintf(
		"SELECT %s%s FROM %s %s %s ORDER BY cache_tokens DESC LIMIT ? OFFSET ?",
		selectDims, aggCols, table, whereClause, groupClause)

	dataArgs := append(append([]interface{}{}, args...), pageSize, offset)
	rows, err := db.Query(dataSQL, dataArgs...)
	if err != nil {
		<-countCh
		return nil, fmt.Errorf("doris cache stats query: %w", err)
	}
	defer rows.Close()

	var items []DorisCacheStatsRow
	for rows.Next() {
		var row DorisCacheStatsRow
		if err := rows.Scan(
			&row.UserId, &row.ModelName, &row.Date,
			&row.TokenId, &row.TokenName,
			&row.ChannelId, &row.ChannelName,
			&row.RequestCount,
			&row.PromptTokens, &row.CacheTokens,
			&row.CacheCreationTokens, &row.CacheCreationTokens5m, &row.CacheCreationTokens1h,
		); err != nil {
			<-countCh
			return nil, fmt.Errorf("doris cache stats scan: %w", err)
		}
		row.TotalInputTokens = row.PromptTokens + row.CacheTokens + row.CacheCreationTokens
		if row.TotalInputTokens > 0 {
			row.CacheHitRate = float64(row.CacheTokens) / float64(row.TotalInputTokens)
		}
		items = append(items, row)
	}
	if err := rows.Err(); err != nil {
		<-countCh
		return nil, fmt.Errorf("doris cache stats rows: %w", err)
	}
	if items == nil {
		items = []DorisCacheStatsRow{}
	}

	cr := <-countCh
	if cr.err != nil {
		return nil, cr.err
	}
	return &DorisCacheStatsResult{Total: cr.total, Items: items}, nil
}
