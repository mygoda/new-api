package service

import (
	"database/sql"
	"fmt"
	"strings"
	"sync"

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
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=UTC",
			common.DorisUser, common.DorisPassword,
			common.DorisHost, common.DorisQueryPort,
			common.DorisDatabase)
		db, err := sql.Open("mysql", dsn)
		if err != nil {
			initErr = err
			return
		}
		db.SetMaxOpenConns(5)
		db.SetMaxIdleConns(2)
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
	Total int                `json:"total"`
	Items []DorisRequestLog `json:"items"`
}

func QueryDorisLogs(filter DorisLogFilter, page, pageSize int) (*DorisLogQueryResult, error) {
	db, err := getDorisDB()
	if err != nil {
		return nil, fmt.Errorf("doris connection: %w", err)
	}

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
		conditions = append(conditions, "is_success = ?")
		args = append(args, *filter.IsSuccess)
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

	table := fmt.Sprintf("`%s`.`%s`", common.DorisDatabase, common.DorisTable)

	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s %s", table, whereClause)
	var total int
	if err := db.QueryRow(countSQL, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("doris count: %w", err)
	}

	offset := (page - 1) * pageSize
	dataSQL := fmt.Sprintf(
		"SELECT request_id, user_id, token_id, token_name, IFNULL(token_key, '') AS token_key, "+
			"user_group, token_group, using_group, "+
			"model_name, upstream_model, channel_id, channel_type, channel_name, "+
			"is_stream, relay_mode, request_path, client_ip, "+
			"IFNULL(request_body, '') AS request_body, IFNULL(response_content, '') AS response_content, "+
			"prompt_tokens, completion_tokens, total_tokens, cache_tokens, "+
			"quota, model_ratio, group_ratio, completion_ratio, model_price, "+
			"use_time_ms, is_success, retry_count, status_code, "+
			"IFNULL(error_type, '') AS error_type, IFNULL(error_message, '') AS error_message, "+
			"created_at "+
			"FROM %s %s ORDER BY created_at DESC LIMIT ? OFFSET ?",
		table, whereClause)

	dataArgs := append(args, pageSize, offset)
	rows, err := db.Query(dataSQL, dataArgs...)
	if err != nil {
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
			&log.RequestBody, &log.ResponseContent,
			&log.PromptTokens, &log.CompletionTokens, &log.TotalTokens, &log.CacheTokens,
			&log.Quota, &log.ModelRatio, &log.GroupRatio, &log.CompletionRatio, &log.ModelPrice,
			&log.UseTimeMs, &log.IsSuccess, &log.RetryCount, &log.StatusCode,
			&log.ErrorType, &log.ErrorMessage,
			&log.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("doris scan: %w", err)
		}
		items = append(items, log)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("doris rows: %w", err)
	}

	if items == nil {
		items = []DorisRequestLog{}
	}

	return &DorisLogQueryResult{
		Total: total,
		Items: items,
	}, nil
}
