package service

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type BillingFilter struct {
	UserId    int
	UserIds   []int // for dealer: query multiple sub-user IDs
	TokenId   int
	TokenName string
	// TokenNames 多选(精确 IN);非空时优先于 TokenName 单值。
	TokenNames []string
	ModelName  string
	// ModelNames 多选(精确 IN);非空时优先于 ModelName(LIKE)。
	ModelNames []string
	ChannelId  int
	StartTime  string // "2006-01-02 15:04:05"
	EndTime    string
	// IncludeFailures 控制是否包含失败请求(is_success=false / LogTypeError)。
	// 零值 false = 仅成功记录,与历史默认行为一致(MySQL 回退一直只查 LogTypeConsume)。
	// 由控制器按 ?include_failures=true 显式开启。
	IncludeFailures bool
}

type BillingQueryResult struct {
	Total int             `json:"total"`
	Items []BillingRecord `json:"items"`
}

type BillingSummaryRow struct {
	Date             string `json:"date,omitempty"`
	UserId           int    `json:"user_id,omitempty"`
	TokenId          int    `json:"token_id,omitempty"`
	TokenName        string `json:"token_name,omitempty"`
	ModelName        string `json:"model_name,omitempty"`
	RequestCount     int    `json:"request_count"`
	TotalQuota       int    `json:"total_quota"`
	TotalPrompt      int    `json:"total_prompt_tokens"`
	TotalCompletion  int    `json:"total_completion_tokens"`
	TotalTokens      int    `json:"total_tokens"`
}

type BillingSummaryResult struct {
	Total int                 `json:"total"`
	Items []BillingSummaryRow `json:"items"`
}

const billingListColumns = "request_id, user_id, token_id, token_name, IFNULL(token_key, '') AS token_key, " +
	"user_group, using_group, model_name, channel_id, channel_name, " +
	"prompt_tokens, completion_tokens, total_tokens, cache_tokens, " +
	"IFNULL(cache_creation_tokens, 0) AS cache_creation_tokens, " +
	"quota, model_ratio, group_ratio, model_price, " +
	"is_success, use_time_ms, created_at"

func buildBillingWhere(filter BillingFilter) (string, []interface{}) {
	var conditions []string
	var args []interface{}

	if filter.UserId > 0 {
		conditions = append(conditions, "user_id = ?")
		args = append(args, filter.UserId)
	} else if len(filter.UserIds) > 0 {
		placeholders := make([]string, len(filter.UserIds))
		for i, id := range filter.UserIds {
			placeholders[i] = "?"
			args = append(args, id)
		}
		conditions = append(conditions, "user_id IN ("+strings.Join(placeholders, ",")+")")
	}
	if filter.TokenId > 0 {
		conditions = append(conditions, "token_id = ?")
		args = append(args, filter.TokenId)
	}
	// 多选优先,精确 IN;否则单值兜底(精确 =)。
	if len(filter.TokenNames) > 0 {
		placeholders := make([]string, len(filter.TokenNames))
		for i, n := range filter.TokenNames {
			placeholders[i] = "?"
			args = append(args, n)
		}
		conditions = append(conditions, "token_name IN ("+strings.Join(placeholders, ",")+")")
	} else if filter.TokenName != "" {
		conditions = append(conditions, "token_name = ?")
		args = append(args, filter.TokenName)
	}
	// 多选优先,精确 IN;否则单值兜底(LIKE 模糊)。
	if len(filter.ModelNames) > 0 {
		placeholders := make([]string, len(filter.ModelNames))
		for i, n := range filter.ModelNames {
			placeholders[i] = "?"
			args = append(args, n)
		}
		conditions = append(conditions, "model_name IN ("+strings.Join(placeholders, ",")+")")
	} else if filter.ModelName != "" {
		conditions = append(conditions, "model_name LIKE ?")
		args = append(args, "%"+filter.ModelName+"%")
	}
	if filter.ChannelId > 0 {
		conditions = append(conditions, "channel_id = ?")
		args = append(args, filter.ChannelId)
	}
	if filter.StartTime != "" {
		conditions = append(conditions, "created_at >= ?")
		args = append(args, filter.StartTime)
	}
	if filter.EndTime != "" {
		conditions = append(conditions, "created_at <= ?")
		args = append(args, filter.EndTime)
	}
	if !filter.IncludeFailures {
		conditions = append(conditions, "is_success = ?")
		args = append(args, true)
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}
	return whereClause, args
}

func QueryBillingRecords(filter BillingFilter, page, pageSize int) (*BillingQueryResult, error) {
	if !dorisAvailable() {
		return queryBillingRecordsMySQL(filter, page, pageSize)
	}
	db, err := getDorisDB()
	if err != nil {
		return nil, fmt.Errorf("doris connection: %w", err)
	}

	whereClause, args := buildBillingWhere(filter)
	table := fmt.Sprintf("`%s`.`%s`", common.DorisDatabase, billingTable)

	type countResult struct {
		total int
		err   error
	}
	countCh := make(chan countResult, 1)
	go func() {
		countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s %s", table, whereClause)
		var total int
		if err := db.QueryRow(countSQL, args...).Scan(&total); err != nil {
			countCh <- countResult{0, fmt.Errorf("billing count: %w", err)}
		} else {
			countCh <- countResult{total, nil}
		}
	}()

	offset := (page - 1) * pageSize
	dataSQL := fmt.Sprintf(
		"SELECT %s FROM %s %s ORDER BY created_at DESC LIMIT ? OFFSET ?",
		billingListColumns, table, whereClause)

	dataArgs := append(append([]interface{}{}, args...), pageSize, offset)
	rows, err := db.Query(dataSQL, dataArgs...)
	if err != nil {
		<-countCh
		return nil, fmt.Errorf("billing query: %w", err)
	}
	defer rows.Close()

	var items []BillingRecord
	for rows.Next() {
		var r BillingRecord
		if err := rows.Scan(
			&r.RequestId, &r.UserId, &r.TokenId, &r.TokenName, &r.TokenKey,
			&r.UserGroup, &r.UsingGroup, &r.ModelName, &r.ChannelId, &r.ChannelName,
			&r.PromptTokens, &r.CompletionTokens, &r.TotalTokens, &r.CacheTokens,
			&r.CacheCreationTokens,
			&r.Quota, &r.ModelRatio, &r.GroupRatio, &r.ModelPrice,
			&r.IsSuccess, &r.UseTimeMs, &r.CreatedAt,
		); err != nil {
			<-countCh
			return nil, fmt.Errorf("billing scan: %w", err)
		}
		items = append(items, r)
	}
	if err := rows.Err(); err != nil {
		<-countCh
		return nil, fmt.Errorf("billing rows: %w", err)
	}

	if items == nil {
		items = []BillingRecord{}
	}

	cr := <-countCh
	if cr.err != nil {
		return nil, cr.err
	}

	return &BillingQueryResult{
		Total: cr.total,
		Items: items,
	}, nil
}

// QueryBillingSummary aggregates billing records by the specified dimension.
// groupBy: "day" | "token" | "model"
func QueryBillingSummary(filter BillingFilter, groupBy string, page, pageSize int) (*BillingSummaryResult, error) {
	db, err := getDorisDB()
	if err != nil {
		return nil, fmt.Errorf("doris connection: %w", err)
	}

	whereClause, args := buildBillingWhere(filter)
	table := fmt.Sprintf("`%s`.`%s`", common.DorisDatabase, billingTable)

	var selectCols, groupClause, orderClause string
	switch groupBy {
	case "token":
		selectCols = "'' AS date, 0 AS user_id, token_id, token_name, '' AS model_name"
		groupClause = "GROUP BY token_id, token_name"
		orderClause = "ORDER BY total_quota DESC"
	case "model":
		selectCols = "'' AS date, 0 AS user_id, 0 AS token_id, '' AS token_name, model_name"
		groupClause = "GROUP BY model_name"
		orderClause = "ORDER BY total_quota DESC"
	default: // "day"
		selectCols = "DATE(created_at) AS date, 0 AS user_id, 0 AS token_id, '' AS token_name, '' AS model_name"
		groupClause = "GROUP BY DATE(created_at)"
		orderClause = "ORDER BY date DESC"
	}

	aggCols := ", COUNT(*) AS request_count, SUM(quota) AS total_quota, " +
		"SUM(prompt_tokens) AS total_prompt_tokens, SUM(completion_tokens) AS total_completion_tokens, " +
		"SUM(total_tokens) AS total_tokens"

	// Count distinct groups
	type countResult struct {
		total int
		err   error
	}
	countCh := make(chan countResult, 1)
	go func() {
		var countGroupCol string
		switch groupBy {
		case "token":
			countGroupCol = "DISTINCT token_id, token_name"
		case "model":
			countGroupCol = "DISTINCT model_name"
		default:
			countGroupCol = "DISTINCT DATE(created_at)"
		}
		countSQL := fmt.Sprintf("SELECT COUNT(%s) FROM %s %s", countGroupCol, table, whereClause)
		var total int
		if err := db.QueryRow(countSQL, args...).Scan(&total); err != nil {
			countCh <- countResult{0, fmt.Errorf("billing summary count: %w", err)}
		} else {
			countCh <- countResult{total, nil}
		}
	}()

	offset := (page - 1) * pageSize
	dataSQL := fmt.Sprintf(
		"SELECT %s%s FROM %s %s %s %s LIMIT ? OFFSET ?",
		selectCols, aggCols, table, whereClause, groupClause, orderClause)

	dataArgs := append(append([]interface{}{}, args...), pageSize, offset)
	rows, err := db.Query(dataSQL, dataArgs...)
	if err != nil {
		<-countCh
		return nil, fmt.Errorf("billing summary query: %w", err)
	}
	defer rows.Close()

	var items []BillingSummaryRow
	for rows.Next() {
		var r BillingSummaryRow
		if err := rows.Scan(
			&r.Date, &r.UserId, &r.TokenId, &r.TokenName, &r.ModelName,
			&r.RequestCount, &r.TotalQuota, &r.TotalPrompt, &r.TotalCompletion, &r.TotalTokens,
		); err != nil {
			<-countCh
			return nil, fmt.Errorf("billing summary scan: %w", err)
		}
		items = append(items, r)
	}
	if err := rows.Err(); err != nil {
		<-countCh
		return nil, fmt.Errorf("billing summary rows: %w", err)
	}

	if items == nil {
		items = []BillingSummaryRow{}
	}

	cr := <-countCh
	if cr.err != nil {
		return nil, cr.err
	}

	return &BillingSummaryResult{
		Total: cr.total,
		Items: items,
	}, nil
}
