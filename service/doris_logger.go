package service

import (
	"bytes"
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
	RequestId        string  `json:"request_id"`
	UserId           int     `json:"user_id"`
	TokenId          int     `json:"token_id"`
	TokenName        string  `json:"token_name"`
	TokenKey         string  `json:"token_key"`
	UserGroup        string  `json:"user_group"`
	TokenGroup       string  `json:"token_group"`
	UsingGroup       string  `json:"using_group"`
	ModelName        string  `json:"model_name"`
	UpstreamModel    string  `json:"upstream_model"`
	ChannelId        int     `json:"channel_id"`
	ChannelType      int     `json:"channel_type"`
	ChannelName      string  `json:"channel_name"`
	IsStream         bool    `json:"is_stream"`
	RelayMode        int     `json:"relay_mode"`
	RequestPath      string  `json:"request_path"`
	ClientIp         string  `json:"client_ip"`
	RequestBody      string  `json:"request_body"`
	ResponseContent  string  `json:"response_content"`
	PromptTokens     int     `json:"prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens"`
	TotalTokens      int     `json:"total_tokens"`
	CacheTokens      int     `json:"cache_tokens"`
	Quota            int     `json:"quota"`
	ModelRatio       float64 `json:"model_ratio"`
	GroupRatio       float64 `json:"group_ratio"`
	CompletionRatio  float64 `json:"completion_ratio"`
	ModelPrice       float64 `json:"model_price"`
	UseTimeMs        int64   `json:"use_time_ms"`
	IsSuccess        bool    `json:"is_success"`
	RetryCount       int     `json:"retry_count"`
	StatusCode       int     `json:"status_code"`
	ErrorType        string  `json:"error_type,omitempty"`
	ErrorMessage     string  `json:"error_message,omitempty"`
	CreatedAt        string  `json:"created_at"`
}

var (
	dorisBuffer     []DorisRequestLog
	dorisBufferMu   sync.Mutex
	dorisInitOnce   sync.Once
	dorisStopCh     chan struct{}
	dorisHttpClient *http.Client
)

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
