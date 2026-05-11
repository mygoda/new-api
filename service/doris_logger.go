package service

import (
	"bytes"
	"database/sql"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
)

// dorisRedirectPolicy handles Doris FE → BE 307 redirects for Stream Load.
//
// Doris FE picks a BE and returns a 307 redirect to it (typically port 8040).
// In containerized deployments the redirect URL often uses the BE's internal
// address (e.g. 127.0.0.1:8040) which is unreachable from outside the Doris
// container. This policy rewrites the redirect host to the original FE host
// while keeping the BE port, so the request reaches the same container via
// the Docker service name.
func dorisRedirectPolicy(req *http.Request, via []*http.Request) error {
	if len(via) == 0 {
		return nil
	}
	if len(via) >= 5 {
		return fmt.Errorf("doris: too many redirects")
	}
	orig := via[0]

	// Rewrite host when FE redirected to a different (often internal) host
	origHost := orig.URL.Hostname()
	if req.URL.Hostname() != origHost {
		port := req.URL.Port()
		if port != "" {
			req.URL.Host = net.JoinHostPort(origHost, port)
		} else {
			req.URL.Host = origHost
		}
	}

	// Go strips Authorization on cross-host redirects; re-apply it
	if auth := orig.Header.Get("Authorization"); auth != "" {
		req.Header.Set("Authorization", auth)
	}
	return nil
}

// DorisRequestLog represents a detailed API request log row for Doris.
type DorisRequestLog struct {
	RequestId             string  `json:"request_id"`
	UserId                int     `json:"user_id"`
	TokenId               int     `json:"token_id"`
	TokenName             string  `json:"token_name"`
	TokenKey              string  `json:"token_key"`
	UserGroup             string  `json:"user_group"`
	TokenGroup            string  `json:"token_group"`
	UsingGroup            string  `json:"using_group"`
	ModelName             string  `json:"model_name"`
	UpstreamModel         string  `json:"upstream_model"`
	ChannelId             int     `json:"channel_id"`
	ChannelType           int     `json:"channel_type"`
	ChannelName           string  `json:"channel_name"`
	IsStream              bool    `json:"is_stream"`
	RelayMode             int     `json:"relay_mode"`
	RequestPath           string  `json:"request_path"`
	ClientIp              string  `json:"client_ip"`
	RequestBody           string  `json:"request_body"`
	ResponseContent       string  `json:"response_content"`
	PromptTokens          int     `json:"prompt_tokens"`
	CompletionTokens      int     `json:"completion_tokens"`
	TotalTokens           int     `json:"total_tokens"`
	CacheTokens           int     `json:"cache_tokens"`
	CacheCreationTokens   int     `json:"cache_creation_tokens"`
	CacheCreationTokens5m int     `json:"cache_creation_tokens_5m"`
	CacheCreationTokens1h int     `json:"cache_creation_tokens_1h"`
	Quota                 int     `json:"quota"`
	ModelRatio            float64 `json:"model_ratio"`
	GroupRatio            float64 `json:"group_ratio"`
	CompletionRatio       float64 `json:"completion_ratio"`
	ModelPrice            float64 `json:"model_price"`
	TierIndex             int     `json:"tier_index"`
	TierThreshold         int     `json:"tier_threshold"`
	TierTotal             int     `json:"tier_total"`
	UseTimeMs             int64   `json:"use_time_ms"`
	IsSuccess             bool    `json:"is_success"`
	RetryCount            int     `json:"retry_count"`
	StatusCode            int     `json:"status_code"`
	ErrorType             string  `json:"error_type,omitempty"`
	ErrorMessage          string  `json:"error_message,omitempty"`
	CreatedAt             string  `json:"created_at"`
}

var (
	dorisBuffer     []DorisRequestLog
	dorisBufferMu   sync.Mutex
	dorisInitOnce   sync.Once
	dorisStopCh     chan struct{}
	dorisHttpClient *http.Client
)

// ensureDorisTable creates a Doris table if it does not already exist.
// Called once at startup for each table the application depends on.
func ensureDorisTable(tableName, ddl string) {
	endpoint := resolveDorisEndpoint()
	if endpoint.host == "" {
		return
	}
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=UTC&interpolateParams=true",
		common.DorisUser, common.DorisPassword,
		endpoint.host, endpoint.queryPort,
		common.DorisDatabase)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		common.SysError(fmt.Sprintf("doris: ensure table %s: open: %s", tableName, err))
		return
	}
	defer db.Close()

	// Create database first
	_, err = db.Exec(fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s`", common.DorisDatabase))
	if err != nil {
		common.SysError(fmt.Sprintf("doris: ensure database %s: %s", common.DorisDatabase, err))
	}

	_, err = db.Exec(ddl)
	if err != nil {
		common.SysError(fmt.Sprintf("doris: ensure table %s: %s", tableName, err))
	} else {
		common.SysLog(fmt.Sprintf("doris: table %s.%s ensured", common.DorisDatabase, tableName))
	}
}

// ensureDorisInvertedIndexes creates inverted indexes on high-cardinality filter columns
// (user_id / token_id). Idempotent: checks information_schema.statistics first, and
// ALTER failures are logged but do not block startup. Requires Doris >= 2.0.
// Note: for existing data partitions, run `BUILD INDEX <idx> ON <table>` on the Doris FE
// after first deploy to backfill the index.
func ensureDorisInvertedIndexes() {
	endpoint := resolveDorisEndpoint()
	if endpoint.host == "" {
		return
	}
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=UTC&interpolateParams=true",
		common.DorisUser, common.DorisPassword,
		endpoint.host, endpoint.queryPort,
		common.DorisDatabase)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		common.SysError(fmt.Sprintf("doris: ensure inverted indexes: open: %s", err))
		return
	}
	defer db.Close()

	checks := []struct {
		table string
		idx   string
		col   string
	}{
		{"billing_records", "idx_billing_user_id", "user_id"},
		{"billing_records", "idx_billing_token_id", "token_id"},
		{"request_logs", "idx_logs_user_id", "user_id"},
		{"request_logs", "idx_logs_token_id", "token_id"},
	}
	for _, c := range checks {
		var exists int
		row := db.QueryRow(
			`SELECT COUNT(*) FROM information_schema.statistics
			 WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
			common.DorisDatabase, c.table, c.idx,
		)
		if err := row.Scan(&exists); err != nil {
			common.SysLog(fmt.Sprintf("doris: check inverted index %s.%s skipped: %s", c.table, c.idx, err))
			continue
		}
		if exists > 0 {
			continue
		}
		stmt := fmt.Sprintf("ALTER TABLE `%s`.`%s` ADD INDEX `%s` (`%s`) USING INVERTED",
			common.DorisDatabase, c.table, c.idx, c.col)
		if _, err := db.Exec(stmt); err != nil {
			// Doris 的 information_schema.statistics 视图在部分版本里不列 inverted index，
			// 会走到这里但实际索引已存在。把 "already exist" 当作幂等成功，静默跳过。
			if strings.Contains(err.Error(), "already exist") {
				continue
			}
			common.SysLog(fmt.Sprintf("doris: add inverted index %s on %s failed (requires Doris 2.0+): %s", c.idx, c.table, err))
			continue
		}
		common.SysLog(fmt.Sprintf("doris: inverted index %s on %s.%s created", c.idx, common.DorisDatabase, c.table))
	}
}

// ensureDorisRequestLogsColumns retrofits older deployments with columns added later.
// Idempotent: checks information_schema.columns first, errors on ADD COLUMN are logged
// but do not block startup.
func ensureDorisRequestLogsColumns() {
	endpoint := resolveDorisEndpoint()
	if endpoint.host == "" {
		return
	}
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=UTC&interpolateParams=true",
		common.DorisUser, common.DorisPassword,
		endpoint.host, endpoint.queryPort,
		common.DorisDatabase)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		common.SysError(fmt.Sprintf("doris: ensure request_logs columns: open: %s", err))
		return
	}
	defer db.Close()

	requestLogsColumns := []dorisColumnSpec{
		{"cache_creation_tokens", `INT DEFAULT "0" COMMENT '缓存写入Token总数(创建)'`},
		{"cache_creation_tokens_5m", `INT DEFAULT "0" COMMENT 'Claude 5m TTL 缓存写入Token'`},
		{"cache_creation_tokens_1h", `INT DEFAULT "0" COMMENT 'Claude 1h TTL 缓存写入Token'`},
		{"tier_index", `INT DEFAULT "0" COMMENT '阶梯计费命中档位(0-based)'`},
		{"tier_threshold", `INT DEFAULT "0" COMMENT '阶梯计费命中档位的 prompt_tokens 阈值'`},
		{"tier_total", `INT DEFAULT "0" COMMENT '阶梯计费总档位数(0表示未启用)'`},
	}
	billingRecordsColumns := []dorisColumnSpec{
		{"tier_index", `INT DEFAULT "0" COMMENT '阶梯计费命中档位(0-based)'`},
		{"tier_threshold", `INT DEFAULT "0" COMMENT '阶梯计费命中档位的 prompt_tokens 阈值'`},
		{"tier_total", `INT DEFAULT "0" COMMENT '阶梯计费总档位数(0表示未启用)'`},
		{"cache_creation_tokens", `INT DEFAULT "0" COMMENT '缓存写入Token总数(创建)'`},
	}
	addMissingDorisColumns(db, "request_logs", requestLogsColumns)
	addMissingDorisColumns(db, "billing_records", billingRecordsColumns)
}

type dorisColumnSpec struct {
	name string
	def  string
}

func addMissingDorisColumns(db *sql.DB, tableName string, columns []dorisColumnSpec) {
	for _, col := range columns {
		var exists int
		row := db.QueryRow(
			`SELECT COUNT(*) FROM information_schema.columns
			 WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
			common.DorisDatabase, tableName, col.name,
		)
		if err := row.Scan(&exists); err != nil {
			common.SysLog(fmt.Sprintf("doris: check column %s.%s skipped: %s", tableName, col.name, err))
			continue
		}
		if exists > 0 {
			continue
		}
		// Doris 2.1 默认启用 Nereids planner，但 Nereids 不支持 ALTER TABLE ADD COLUMN
		// 语法（会报 'mismatched input COLUMN' 或 'missing CONSTRAINT'）。在同一连接里
		// 先 SET enable_nereids_planner=false 走 legacy planner，加列才生效。
		if _, err := db.Exec("SET enable_nereids_planner=false"); err != nil {
			common.SysLog(fmt.Sprintf("doris: SET enable_nereids_planner=false skipped: %s", err))
		}
		stmt := fmt.Sprintf("ALTER TABLE `%s`.`%s` ADD COLUMN `%s` %s",
			common.DorisDatabase, tableName, col.name, col.def)
		if _, err := db.Exec(stmt); err != nil {
			common.SysLog(fmt.Sprintf("doris: add column %s.%s failed: %s", tableName, col.name, err))
			continue
		}
		common.SysLog(fmt.Sprintf("doris: column %s.%s added", tableName, col.name))
	}
}

const requestLogsDDL = `CREATE TABLE IF NOT EXISTS %s.request_logs (
    created_at          DATETIME        NOT NULL COMMENT '请求时间 (UTC)',
    request_id          VARCHAR(128)    NOT NULL COMMENT '请求ID',
    user_id             INT             NOT NULL COMMENT '用户ID',
    token_id            INT             NOT NULL COMMENT '令牌ID',
    token_name          VARCHAR(256)    DEFAULT '' COMMENT '令牌名称',
    token_key           VARCHAR(512)    DEFAULT '' COMMENT 'API密钥',
    user_group          VARCHAR(128)    DEFAULT '' COMMENT '用户所在分组',
    token_group         VARCHAR(128)    DEFAULT '' COMMENT '令牌分组',
    using_group         VARCHAR(128)    DEFAULT '' COMMENT '实际使用的分组',
    model_name          VARCHAR(256)    DEFAULT '' COMMENT '请求模型名称',
    upstream_model      VARCHAR(256)    DEFAULT '' COMMENT '上游实际模型名称',
    channel_id          INT             DEFAULT 0  COMMENT '渠道ID',
    channel_type        INT             DEFAULT 0  COMMENT '渠道类型',
    channel_name        VARCHAR(256)    DEFAULT '' COMMENT '渠道名称',
    is_stream           TINYINT         DEFAULT 0 COMMENT '是否流式请求',
    relay_mode          INT             DEFAULT 0  COMMENT '中继模式',
    request_path        VARCHAR(512)    DEFAULT '' COMMENT '请求路径',
    client_ip           VARCHAR(64)     DEFAULT '' COMMENT '客户端IP',
    request_body        STRING          DEFAULT '' COMMENT '请求体',
    response_content    STRING          DEFAULT '' COMMENT '响应内容',
    prompt_tokens       INT             DEFAULT 0  COMMENT '输入Token数',
    completion_tokens   INT             DEFAULT 0  COMMENT '输出Token数',
    total_tokens        INT             DEFAULT 0  COMMENT '总Token数',
    cache_tokens        INT             DEFAULT 0  COMMENT '缓存读取Token数(命中)',
    cache_creation_tokens    INT        DEFAULT 0  COMMENT '缓存写入Token总数(创建)',
    cache_creation_tokens_5m INT        DEFAULT 0  COMMENT 'Claude 5m TTL 缓存写入Token',
    cache_creation_tokens_1h INT        DEFAULT 0  COMMENT 'Claude 1h TTL 缓存写入Token',
    quota               INT             DEFAULT 0  COMMENT '消耗额度',
    model_ratio         DOUBLE          DEFAULT 0  COMMENT '模型倍率',
    group_ratio         DOUBLE          DEFAULT 0  COMMENT '分组倍率',
    completion_ratio    DOUBLE          DEFAULT 0  COMMENT '补全倍率',
    model_price         DOUBLE          DEFAULT 0  COMMENT '模型价格',
    tier_index          INT             DEFAULT 0  COMMENT '阶梯计费命中档位(0-based)',
    tier_threshold      INT             DEFAULT 0  COMMENT '阶梯计费命中档位的 prompt_tokens 阈值',
    tier_total          INT             DEFAULT 0  COMMENT '阶梯计费总档位数(0表示未启用)',
    use_time_ms         BIGINT          DEFAULT 0  COMMENT '请求耗时(毫秒)',
    is_success          TINYINT         DEFAULT 1 COMMENT '是否成功',
    retry_count         INT             DEFAULT 0  COMMENT '重试次数',
    status_code         INT             DEFAULT 0  COMMENT 'HTTP状态码',
    error_type          VARCHAR(128)    DEFAULT '' COMMENT '错误类型',
    error_message       VARCHAR(1024)   DEFAULT '' COMMENT '错误消息'
) ENGINE = OLAP
DUPLICATE KEY(created_at, request_id)
PARTITION BY RANGE(created_at) ()
DISTRIBUTED BY HASH(request_id) BUCKETS AUTO
PROPERTIES (
    'replication_allocation' = 'tag.location.default: 1',
    'dynamic_partition.enable' = 'true',
    'dynamic_partition.time_unit' = 'DAY',
    'dynamic_partition.start' = '-30',
    'dynamic_partition.end' = '3',
    'dynamic_partition.prefix' = 'p',
    'dynamic_partition.create_history_partition' = 'true'
)`

const billingRecordsDDL = `CREATE TABLE IF NOT EXISTS %s.billing_records (
    created_at          DATETIME        NOT NULL COMMENT '计费时间 (UTC)',
    request_id          VARCHAR(128)    NOT NULL COMMENT '请求ID',
    user_id             INT             NOT NULL COMMENT '用户ID',
    token_id            INT             NOT NULL COMMENT '令牌ID',
    token_name          VARCHAR(256)    DEFAULT '' COMMENT '令牌名称',
    token_key           VARCHAR(512)    DEFAULT '' COMMENT 'API密钥',
    user_group          VARCHAR(128)    DEFAULT '' COMMENT '用户分组',
    using_group         VARCHAR(128)    DEFAULT '' COMMENT '实际使用分组',
    model_name          VARCHAR(256)    DEFAULT '' COMMENT '请求模型',
    channel_id          INT             DEFAULT 0  COMMENT '渠道ID',
    channel_name        VARCHAR(256)    DEFAULT '' COMMENT '渠道名称',
    prompt_tokens       INT             DEFAULT 0  COMMENT '输入Token',
    completion_tokens   INT             DEFAULT 0  COMMENT '输出Token',
    total_tokens        INT             DEFAULT 0  COMMENT '总Token',
    cache_tokens        INT             DEFAULT 0  COMMENT '缓存Token',
    cache_creation_tokens INT           DEFAULT 0  COMMENT '缓存写入Token(创建)',
    quota               INT             DEFAULT 0  COMMENT '消耗额度',
    model_ratio         DOUBLE          DEFAULT 0  COMMENT '模型倍率',
    group_ratio         DOUBLE          DEFAULT 0  COMMENT '分组倍率',
    model_price         DOUBLE          DEFAULT 0  COMMENT '模型价格',
    tier_index          INT             DEFAULT 0  COMMENT '阶梯计费命中档位(0-based)',
    tier_threshold      INT             DEFAULT 0  COMMENT '阶梯计费命中档位的 prompt_tokens 阈值',
    tier_total          INT             DEFAULT 0  COMMENT '阶梯计费总档位数(0表示未启用)',
    is_success          TINYINT         DEFAULT 1  COMMENT '是否成功',
    use_time_ms         BIGINT          DEFAULT 0  COMMENT '耗时(ms)'
) ENGINE = OLAP
DUPLICATE KEY(created_at, request_id)
PARTITION BY RANGE(created_at) ()
DISTRIBUTED BY HASH(request_id) BUCKETS AUTO
PROPERTIES (
    'replication_allocation' = 'tag.location.default: 1',
    'dynamic_partition.enable' = 'true',
    'dynamic_partition.time_unit' = 'DAY',
    'dynamic_partition.start' = '-90',
    'dynamic_partition.end' = '3',
    'dynamic_partition.prefix' = 'p',
    'dynamic_partition.create_history_partition' = 'true'
)`

func InitDorisLogger() {
	if !common.DorisEnabled {
		return
	}
	dorisInitOnce.Do(func() {
		endpoint := resolveDorisEndpoint()
		dorisBuffer = make([]DorisRequestLog, 0, common.DorisFlushBatchSize*2)
		dorisStopCh = make(chan struct{})
		dorisHttpClient = &http.Client{
			Timeout:       30 * time.Second,
			CheckRedirect: dorisRedirectPolicy,
		}

		ensureDorisTable("request_logs", fmt.Sprintf(requestLogsDDL, common.DorisDatabase))
		ensureDorisTable("billing_records", fmt.Sprintf(billingRecordsDDL, common.DorisDatabase))
		ensureDorisRequestLogsColumns()
		ensureDorisInvertedIndexes()

		common.SysLog(fmt.Sprintf("Doris logger initialized: %s:%d/%s.%s (flush every %ds or %d rows)",
			endpoint.host, endpoint.httpPort, common.DorisDatabase, common.DorisTable,
			common.DorisFlushInterval, common.DorisFlushBatchSize))
		go dorisFlushLoop()
	})
}

func dorisFlushLoop() {
	ticker := time.NewTicker(time.Duration(common.DorisFlushInterval) * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			dorisFlush()
		case <-dorisStopCh:
			dorisFlush()
			return
		}
	}
}

// RecordDorisLog enqueues a log entry for async batch write to Doris.
// Non-blocking: returns immediately. Drops silently if Doris is not enabled.
func RecordDorisLog(log DorisRequestLog) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		return
	}
	dorisBufferMu.Lock()
	dorisBuffer = append(dorisBuffer, log)
	shouldFlush := len(dorisBuffer) >= common.DorisFlushBatchSize
	dorisBufferMu.Unlock()

	if shouldFlush {
		go dorisFlush()
	}
}

func dorisFlush() {
	dorisBufferMu.Lock()
	if len(dorisBuffer) == 0 {
		dorisBufferMu.Unlock()
		return
	}
	batch := dorisBuffer
	dorisBuffer = make([]DorisRequestLog, 0, common.DorisFlushBatchSize*2)
	dorisBufferMu.Unlock()

	data, err := marshalDorisJSON(batch)
	if err != nil {
		common.SysError("doris: failed to marshal batch: " + err.Error())
		return
	}

	if err := dorisStreamLoad(data); err != nil {
		common.SysError("doris: stream load failed: " + err.Error())
		dorisBufferMu.Lock()
		dorisBuffer = append(batch, dorisBuffer...)
		dorisBufferMu.Unlock()
	}
}

func marshalDorisJSON(batch []DorisRequestLog) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('[')
	for i, row := range batch {
		if i > 0 {
			buf.WriteByte(',')
		}
		rowBytes, err := common.Marshal(row)
		if err != nil {
			return nil, err
		}
		buf.Write(rowBytes)
	}
	buf.WriteByte(']')
	return buf.Bytes(), nil
}

func dorisStreamLoad(data []byte) error {
	endpoint := resolveDorisEndpoint()
	target := net.JoinHostPort(endpoint.host, strconv.Itoa(endpoint.httpPort))
	url := fmt.Sprintf("http://%s/api/%s/%s/_stream_load",
		target, common.DorisDatabase, common.DorisTable)

	req, err := http.NewRequest(http.MethodPut, url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.SetBasicAuth(common.DorisUser, common.DorisPassword)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("format", "json")
	req.Header.Set("strip_outer_array", "true")
	req.Header.Set("Expect", "100-continue")

	resp, err := dorisHttpClient.Do(req)
	if err != nil {
		err = fmt.Errorf("http request: %w", err)
		if strings.Contains(err.Error(), "connection refused") {
			err = fmt.Errorf("%w | Stream Load 必须访问 Doris FE 的 HTTP 端口（默认 8030，环境变量 DORIS_PORT）；9030 为 MySQL 查询端口；8040 多为 BE 端口不可用。若在 Docker 内跑 new-api，DORIS_HOST 勿用 127.0.0.1 指向宿主机，应使用 compose 服务名或 host 网关", err)
		}
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
