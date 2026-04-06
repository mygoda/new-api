package service

import (
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	_ "github.com/go-sql-driver/mysql"
)

var (
	dorisDB     *sql.DB
	dorisDBOnce sync.Once
)

func getDorisDB() (*sql.DB, error) {
	var initErr error
	dorisDBOnce.Do(func() {
		endpoint := resolveDorisEndpoint()
		// interpolateParams=true: 客户端拼接参数，避免 Doris FE 对 COM_STMT_PREPARE 仅支持点查的限制
		// （否则 COUNT/分页等会报 errCode=2 Only support prepare SelectStmt point query now）
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=UTC&interpolateParams=true",
			common.DorisUser, common.DorisPassword,
			endpoint.host, endpoint.queryPort,
			common.DorisDatabase)
		db, err := sql.Open("mysql", dsn)
		if err != nil {
			initErr = err
			return
		}
		db.SetMaxOpenConns(20)
		db.SetMaxIdleConns(10)
		db.SetConnMaxLifetime(30 * time.Minute)
		dorisDB = db
	})
	if initErr != nil {
		return nil, initErr
	}
	return dorisDB, nil
}

type DorisLogFilter struct {
	RequestId string
	UserId    int
	TokenId   int
	TokenName string
	TokenKey  string
	ModelName string
	ChannelId int
	UserGroup string
	ClientIp  string
	IsSuccess *bool
	StartTime string // "2006-01-02 15:04:05"
	EndTime   string
}

type DorisLogQueryResult struct {
	Total int               `json:"total"`
	Items []DorisRequestLog `json:"items"`
}

// 列表查询使用的轻量列（不含 request_body 和 response_content 大字段）
const dorisListColumns = "request_id, user_id, token_id, token_name, IFNULL(token_key, '') AS token_key, " +
	"user_group, token_group, using_group, " +
	"model_name, upstream_model, channel_id, channel_type, channel_name, " +
	"is_stream, relay_mode, request_path, client_ip, " +
	"prompt_tokens, completion_tokens, total_tokens, cache_tokens, " +
	"quota, model_ratio, group_ratio, completion_ratio, model_price, " +
	"use_time_ms, is_success, retry_count, status_code, " +
	"IFNULL(error_type, '') AS error_type, IFNULL(error_message, '') AS error_message, " +
	"created_at"

// 详情查询使用的完整列（含大字段）
const dorisDetailColumns = "request_id, user_id, token_id, token_name, IFNULL(token_key, '') AS token_key, " +
	"user_group, token_group, using_group, " +
	"model_name, upstream_model, channel_id, channel_type, channel_name, " +
	"is_stream, relay_mode, request_path, client_ip, " +
	"IFNULL(request_body, '') AS request_body, IFNULL(response_content, '') AS response_content, " +
	"prompt_tokens, completion_tokens, total_tokens, cache_tokens, " +
	"quota, model_ratio, group_ratio, completion_ratio, model_price, " +
	"use_time_ms, is_success, retry_count, status_code, " +
	"IFNULL(error_type, '') AS error_type, IFNULL(error_message, '') AS error_message, " +
	"created_at"

func buildDorisWhere(filter DorisLogFilter) (string, []interface{}) {
	var conditions []string
	var args []interface{}

	if filter.RequestId != "" {
		conditions = append(conditions, "request_id = ?")
		args = append(args, filter.RequestId)
	}
	if filter.UserId > 0 {
		conditions = append(conditions, "user_id = ?")
		args = append(args, filter.UserId)
	}
	if filter.TokenId > 0 {
		conditions = append(conditions, "token_id = ?")
		args = append(args, filter.TokenId)
	}
	if filter.TokenName != "" {
		conditions = append(conditions, "token_name = ?")
		args = append(args, filter.TokenName)
	}
	if filter.TokenKey != "" {
		conditions = append(conditions, "token_key = ?")
		args = append(args, filter.TokenKey)
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
	if filter.ClientIp != "" {
		conditions = append(conditions, "client_ip = ?")
		args = append(args, filter.ClientIp)
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

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}
	return whereClause, args
}

func QueryDorisLogs(filter DorisLogFilter, page, pageSize int) (*DorisLogQueryResult, error) {
	db, err := getDorisDB()
	if err != nil {
		return nil, fmt.Errorf("doris connection: %w", err)
	}

	whereClause, args := buildDorisWhere(filter)
	table := fmt.Sprintf("`%s`.`%s`", common.DorisDatabase, common.DorisTable)

	// 并行执行 COUNT 和数据查询
	type countResult struct {
		total int
		err   error
	}
	countCh := make(chan countResult, 1)
	go func() {
		countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s %s", table, whereClause)
		var total int
		if err := db.QueryRow(countSQL, args...).Scan(&total); err != nil {
			countCh <- countResult{0, fmt.Errorf("doris count: %w", err)}
		} else {
			countCh <- countResult{total, nil}
		}
	}()

	// 列表查询：不加载大字段（request_body, response_content）
	offset := (page - 1) * pageSize
	dataSQL := fmt.Sprintf(
		"SELECT %s FROM %s %s ORDER BY created_at DESC LIMIT ? OFFSET ?",
		dorisListColumns, table, whereClause)

	dataArgs := append(append([]interface{}{}, args...), pageSize, offset)
	rows, err := db.Query(dataSQL, dataArgs...)
	if err != nil {
		<-countCh // drain goroutine
		return nil, fmt.Errorf("doris query: %w", err)
	}
	defer rows.Close()

	var items []DorisRequestLog
	for rows.Next() {
		var log DorisRequestLog
		if err := rows.Scan(
			&log.RequestId, &log.UserId, &log.TokenId, &log.TokenName, &log.TokenKey,
			&log.UserGroup, &log.TokenGroup, &log.UsingGroup,
			&log.ModelName, &log.UpstreamModel,
			&log.ChannelId, &log.ChannelType, &log.ChannelName,
			&log.IsStream, &log.RelayMode, &log.RequestPath, &log.ClientIp,
			&log.PromptTokens, &log.CompletionTokens, &log.TotalTokens, &log.CacheTokens,
			&log.Quota, &log.ModelRatio, &log.GroupRatio, &log.CompletionRatio, &log.ModelPrice,
			&log.UseTimeMs, &log.IsSuccess, &log.RetryCount, &log.StatusCode,
			&log.ErrorType, &log.ErrorMessage,
			&log.CreatedAt,
		); err != nil {
			<-countCh
			return nil, fmt.Errorf("doris scan: %w", err)
		}
		items = append(items, log)
	}
	if err := rows.Err(); err != nil {
		<-countCh
		return nil, fmt.Errorf("doris rows: %w", err)
	}

	if items == nil {
		items = []DorisRequestLog{}
	}

	cr := <-countCh
	if cr.err != nil {
		return nil, cr.err
	}

	return &DorisLogQueryResult{
		Total: cr.total,
		Items: items,
	}, nil
}

// QueryDorisLogDetail 根据 request_id 查询单条日志详情（含 request_body 和 response_content）
func QueryDorisLogDetail(requestId string) (*DorisRequestLog, error) {
	db, err := getDorisDB()
	if err != nil {
		return nil, fmt.Errorf("doris connection: %w", err)
	}

	table := fmt.Sprintf("`%s`.`%s`", common.DorisDatabase, common.DorisTable)
	dataSQL := fmt.Sprintf(
		"SELECT %s FROM %s WHERE request_id = ? LIMIT 1",
		dorisDetailColumns, table)

	var log DorisRequestLog
	if err := db.QueryRow(dataSQL, requestId).Scan(
		&log.RequestId, &log.UserId, &log.TokenId, &log.TokenName, &log.TokenKey,
		&log.UserGroup, &log.TokenGroup, &log.UsingGroup,
		&log.ModelName, &log.UpstreamModel,
		&log.ChannelId, &log.ChannelType, &log.ChannelName,
		&log.IsStream, &log.RelayMode, &log.RequestPath, &log.ClientIp,
		&log.RequestBody, &log.ResponseContent,
		&log.PromptTokens, &log.CompletionTokens, &log.TotalTokens, &log.CacheTokens,
		&log.Quota, &log.ModelRatio, &log.GroupRatio, &log.CompletionRatio, &log.ModelPrice,
		&log.UseTimeMs, &log.IsSuccess, &log.RetryCount, &log.StatusCode,
		&log.ErrorType, &log.ErrorMessage,
		&log.CreatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("doris detail: %w", err)
	}
	return &log, nil
}
