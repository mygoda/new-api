package service

import (
	"bytes"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

const billingTable = "billing_records"

// BillingRecord represents a lightweight billing row for Doris.
type BillingRecord struct {
	RequestId        string  `json:"request_id"`
	UserId           int     `json:"user_id"`
	TokenId          int     `json:"token_id"`
	TokenName        string  `json:"token_name"`
	TokenKey         string  `json:"token_key"`
	UserGroup        string  `json:"user_group"`
	UsingGroup       string  `json:"using_group"`
	ModelName        string  `json:"model_name"`
	ChannelId        int     `json:"channel_id"`
	ChannelName      string  `json:"channel_name"`
	PromptTokens     int     `json:"prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens"`
	TotalTokens      int     `json:"total_tokens"`
	CacheTokens      int     `json:"cache_tokens"`
	Quota            int     `json:"quota"`
	ModelRatio       float64 `json:"model_ratio"`
	GroupRatio       float64 `json:"group_ratio"`
	ModelPrice       float64 `json:"model_price"`
	IsSuccess        bool    `json:"is_success"`
	UseTimeMs        int64   `json:"use_time_ms"`
	CreatedAt        string  `json:"created_at"`
}

var (
	billingBuffer   []BillingRecord
	billingBufferMu sync.Mutex
	billingInitOnce sync.Once
	billingStopCh   chan struct{}
)

func InitBillingLogger() {
	if !common.DorisEnabled {
		return
	}
	billingInitOnce.Do(func() {
		endpoint := resolveDorisEndpoint()
		billingBuffer = make([]BillingRecord, 0, common.DorisFlushBatchSize*2)
		billingStopCh = make(chan struct{})
		common.SysLog(fmt.Sprintf("Billing logger initialized: %s:%d/%s.%s (flush every %ds or %d rows)",
			endpoint.host, endpoint.httpPort, common.DorisDatabase, billingTable,
			common.DorisFlushInterval, common.DorisFlushBatchSize))
		go billingFlushLoop()
	})
}

func billingFlushLoop() {
	ticker := time.NewTicker(time.Duration(common.DorisFlushInterval) * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			billingFlush()
		case <-billingStopCh:
			billingFlush()
			return
		}
	}
}

// RecordBillingLog enqueues a billing record for async batch write.
func RecordBillingLog(record BillingRecord) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		return
	}
	billingBufferMu.Lock()
	billingBuffer = append(billingBuffer, record)
	shouldFlush := len(billingBuffer) >= common.DorisFlushBatchSize
	billingBufferMu.Unlock()

	if shouldFlush {
		go billingFlush()
	}
}

func billingFlush() {
	billingBufferMu.Lock()
	if len(billingBuffer) == 0 {
		billingBufferMu.Unlock()
		return
	}
	batch := billingBuffer
	billingBuffer = make([]BillingRecord, 0, common.DorisFlushBatchSize*2)
	billingBufferMu.Unlock()

	data, err := marshalBillingJSON(batch)
	if err != nil {
		common.SysError("billing: failed to marshal batch: " + err.Error())
		return
	}

	if err := billingStreamLoad(data); err != nil {
		common.SysError("billing: stream load failed: " + err.Error())
		billingBufferMu.Lock()
		billingBuffer = append(batch, billingBuffer...)
		billingBufferMu.Unlock()
	}
}

func marshalBillingJSON(batch []BillingRecord) ([]byte, error) {
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

func billingStreamLoad(data []byte) error {
	if dorisHttpClient == nil {
		return fmt.Errorf("billing: doris http client not initialized")
	}
	endpoint := resolveDorisEndpoint()
	target := net.JoinHostPort(endpoint.host, strconv.Itoa(endpoint.httpPort))
	url := fmt.Sprintf("http://%s/api/%s/%s/_stream_load",
		target, common.DorisDatabase, billingTable)

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
		return fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("billing stream load status %d", resp.StatusCode)
	}

	return nil
}

// EmitBillingRecord builds a BillingRecord from relay context and enqueues it.
func EmitBillingRecord(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, usage *dto.Usage, quota int) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		return
	}
	if relayInfo == nil {
		return
	}

	record := BillingRecord{
		RequestId:  relayInfo.RequestId,
		UserId:     relayInfo.UserId,
		TokenId:    relayInfo.TokenId,
		TokenName:  ctx.GetString("token_name"),
		TokenKey:   relayInfo.TokenKey,
		UserGroup:  relayInfo.UserGroup,
		UsingGroup: relayInfo.UsingGroup,
		ModelName:  relayInfo.OriginModelName,
		Quota:      quota,
		IsSuccess:  true,
		CreatedAt:  time.Now().UTC().Format("2006-01-02 15:04:05"),
	}

	if relayInfo.ChannelMeta != nil {
		record.ChannelId = relayInfo.ChannelId
	}
	record.ChannelName = ctx.GetString("channel_name")

	if usage != nil {
		record.PromptTokens = usage.PromptTokens
		record.CompletionTokens = usage.CompletionTokens
		record.TotalTokens = usage.TotalTokens
		record.CacheTokens = usage.PromptTokensDetails.CachedTokens
	}

	record.ModelRatio = relayInfo.PriceData.ModelRatio
	record.GroupRatio = relayInfo.PriceData.GroupRatioInfo.GroupRatio
	record.ModelPrice = relayInfo.PriceData.ModelPrice
	record.UseTimeMs = time.Since(relayInfo.StartTime).Milliseconds()

	RecordBillingLog(record)
}

// EmitBillingRecordWithSummary builds a BillingRecord using summary info
// for audio/wss paths where dto.Usage is not directly available.
func EmitBillingRecordWithSummary(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, totalTokens int, promptTokens int, completionTokens int, quota int) {
	if !common.DorisEnabled || !setting.DorisLogEnabled {
		return
	}
	if relayInfo == nil {
		return
	}

	record := BillingRecord{
		RequestId:        relayInfo.RequestId,
		UserId:           relayInfo.UserId,
		TokenId:          relayInfo.TokenId,
		TokenName:        ctx.GetString("token_name"),
		TokenKey:         relayInfo.TokenKey,
		UserGroup:        relayInfo.UserGroup,
		UsingGroup:       relayInfo.UsingGroup,
		ModelName:        relayInfo.OriginModelName,
		ChannelName:      ctx.GetString("channel_name"),
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		TotalTokens:      totalTokens,
		Quota:            quota,
		IsSuccess:        true,
		CreatedAt:        time.Now().UTC().Format("2006-01-02 15:04:05"),
	}

	if relayInfo.ChannelMeta != nil {
		record.ChannelId = relayInfo.ChannelId
	}

	record.ModelRatio = relayInfo.PriceData.ModelRatio
	record.GroupRatio = relayInfo.PriceData.GroupRatioInfo.GroupRatio
	record.ModelPrice = relayInfo.PriceData.ModelPrice
	record.UseTimeMs = time.Since(relayInfo.StartTime).Milliseconds()

	RecordBillingLog(record)
}
