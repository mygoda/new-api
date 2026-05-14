package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

type AlertLevel string

const (
	AlertLevelCritical AlertLevel = "critical"
	AlertLevelWarning  AlertLevel = "warning"
	AlertLevelInfo     AlertLevel = "info"
)

type AlertField struct {
	Label string
	Value string
	Short bool
}

type AlertEvent struct {
	Kind     string
	Level    AlertLevel
	Title    string
	Fields   []AlertField
	DedupKey string
}

const (
	AlertKindChannelDisable      = "channel_disable"
	AlertKindChannelModelDisable = "channel_model_disable"
	AlertKindChannelRecover      = "channel_recover"
	AlertKindHeartbeatFailed     = "heartbeat_failed"
	AlertKindRelay5xx            = "relay_5xx"
	AlertKindPanic               = "panic"
	AlertKindTest                = "test"
)

func eventEnabled(kind string) bool {
	mask := strings.TrimSpace(common.FeishuAlertEventMask)
	if mask == "" {
		return true
	}
	for _, k := range strings.Split(mask, ",") {
		if strings.TrimSpace(k) == kind {
			return true
		}
	}
	return false
}

func levelEmoji(l AlertLevel) string {
	switch l {
	case AlertLevelCritical:
		return "🚨"
	case AlertLevelWarning:
		return "⚠️"
	case AlertLevelInfo:
		return "✅"
	}
	return "ℹ️"
}

func levelTemplate(l AlertLevel) string {
	switch l {
	case AlertLevelCritical:
		return "red"
	case AlertLevelWarning:
		return "orange"
	case AlertLevelInfo:
		return "green"
	}
	return "grey"
}

func levelLabel(l AlertLevel) string {
	switch l {
	case AlertLevelCritical:
		return "Critical"
	case AlertLevelWarning:
		return "Warning"
	case AlertLevelInfo:
		return "Info"
	}
	return "Unknown"
}

// SendFeishuAlert dispatches one alert event to all configured Feishu robots
// (webhook and/or app mode). All filtering (enabled flag, event mask, dedup)
// happens here once; callers can fire-and-forget. If both modes are configured
// the same alert is sent to both targets but counted as a single dedup event.
//
// 同时支持邮件通道:若 AlertEmailReceivers 非空,会通过 common.SendEmail 把
// 同一封告警发到配置的邮箱列表,与飞书共享同一份 dedup 计数。
func SendFeishuAlert(ev AlertEvent) {
	// 总开关:FeishuAlertEnabled 显式启用 OR 至少配置了邮件接收人
	// (配了邮件等同于运营意图启用,避免要 admin 在两处都开)。
	if !common.FeishuAlertEnabled && !alertEmailConfigured() {
		return
	}
	if !feishuWebhookConfigured() && !feishuAppConfigured() && !alertEmailConfigured() {
		return
	}
	if !eventEnabled(ev.Kind) {
		return
	}
	if !tryAlertDedup(ev.Kind, ev.DedupKey, common.FeishuAlertDedupSeconds) {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				common.SysLog(fmt.Sprintf("feishu alert: panic during send: %v", r))
			}
		}()
		dispatchFeishuAlert(ev)
	}()
}

// SendFeishuAlertSync is the synchronous variant used by the admin "test" endpoint
// so that the API response can surface the actual webhook reply. It bypasses dedup
// and the enabled flag — callers should validate at least one mode is configured.
func SendFeishuAlertSync(ev AlertEvent) error {
	if !feishuWebhookConfigured() && !feishuAppConfigured() && !alertEmailConfigured() {
		return fmt.Errorf("既未配置 webhook url,也未配置 app id/secret/receive_id,也未配置告警邮箱")
	}
	var firstErr error
	if feishuWebhookConfigured() {
		if err := sendFeishuViaWebhook(ev); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("webhook: %w", err)
		}
	}
	if feishuAppConfigured() {
		if err := sendFeishuViaApp(ev); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("app: %w", err)
		}
	}
	if alertEmailConfigured() {
		if err := sendAlertViaEmail(ev); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("email: %w", err)
		}
	}
	return firstErr
}

func dispatchFeishuAlert(ev AlertEvent) {
	if feishuWebhookConfigured() {
		if err := sendFeishuViaWebhook(ev); err != nil {
			common.SysLog(fmt.Sprintf("feishu webhook send failed kind=%s: %s", ev.Kind, err.Error()))
		}
	}
	if feishuAppConfigured() {
		if err := sendFeishuViaApp(ev); err != nil {
			common.SysLog(fmt.Sprintf("feishu app send failed kind=%s: %s", ev.Kind, err.Error()))
		}
	}
	if alertEmailConfigured() {
		if err := sendAlertViaEmail(ev); err != nil {
			common.SysLog(fmt.Sprintf("alert email send failed kind=%s: %s", ev.Kind, err.Error()))
		}
	}
}

func feishuWebhookConfigured() bool {
	return strings.TrimSpace(common.FeishuAlertWebhookUrl) != ""
}

func feishuAppConfigured() bool {
	return strings.TrimSpace(common.FeishuAlertAppId) != "" &&
		strings.TrimSpace(common.FeishuAlertAppSecret) != "" &&
		strings.TrimSpace(common.FeishuAlertReceiveId) != ""
}

// ---- Email mode ----

func alertEmailConfigured() bool {
	return strings.TrimSpace(common.AlertEmailReceivers) != ""
}

// parseAlertEmailReceivers 把"逗号/分号/换行"分隔的多邮箱字符串解析成 trim 后的切片。
func parseAlertEmailReceivers() []string {
	raw := common.AlertEmailReceivers
	if raw == "" {
		return nil
	}
	rep := strings.NewReplacer(";", ",", "\n", ",", "\r", ",", " ", ",")
	parts := strings.Split(rep.Replace(raw), ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func sendAlertViaEmail(ev AlertEvent) error {
	receivers := parseAlertEmailReceivers()
	if len(receivers) == 0 {
		return nil
	}
	subject := strings.TrimSpace(levelEmoji(ev.Level) + " " + ev.Title)
	body := buildAlertEmailHTML(ev)
	var firstErr error
	for _, r := range receivers {
		if err := common.SendEmail(subject, r, body); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// buildAlertEmailHTML 把 AlertEvent 渲染成简洁 HTML(SMTP 默认 Content-Type 已是 text/html)。
// 字段顺序保留 ev.Fields 原顺序,便于排查时定位。
func buildAlertEmailHTML(ev AlertEvent) string {
	var b strings.Builder
	b.WriteString(`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;line-height:1.55">`)
	b.WriteString(fmt.Sprintf(`<h2 style="margin:0 0 12px;font-size:16px">%s %s</h2>`, levelEmoji(ev.Level), htmlEscape(ev.Title)))
	if len(ev.Fields) > 0 {
		b.WriteString(`<table style="border-collapse:collapse;font-size:13px;width:100%;max-width:600px">`)
		for _, f := range ev.Fields {
			b.WriteString(fmt.Sprintf(
				`<tr><td style="padding:6px 12px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:28%%;vertical-align:top">%s</td>`+
					`<td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;word-break:break-all">%s</td></tr>`,
				htmlEscape(f.Label), htmlEscape(f.Value),
			))
		}
		b.WriteString(`</table>`)
	}
	b.WriteString(fmt.Sprintf(`<p style="margin-top:16px;font-size:11px;color:#9ca3af">kind: %s · 来源: new-api</p>`, htmlEscape(ev.Kind)))
	b.WriteString(`</div>`)
	return b.String()
}

func htmlEscape(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&#39;",
	)
	return r.Replace(s)
}

// ---- Webhook mode ----

func sendFeishuViaWebhook(ev AlertEvent) error {
	payload, err := buildFeishuWebhookPayload(ev)
	if err != nil {
		return err
	}
	body, err := common.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal feishu payload: %w", err)
	}
	url := common.FeishuAlertWebhookUrl

	if system_setting.EnableWorker() {
		workerReq := &WorkerRequest{
			URL:    url,
			Key:    system_setting.WorkerValidKey,
			Method: http.MethodPost,
			Headers: map[string]string{
				"Content-Type": "application/json; charset=utf-8",
				"User-Agent":   "NewAPI-Feishu-Alert/1.0",
			},
			Body: body,
		}
		resp, err := DoWorkerRequest(workerReq)
		if err != nil {
			return fmt.Errorf("worker request: %w", err)
		}
		defer resp.Body.Close()
		return checkFeishuResp(resp)
	}

	fetchSetting := system_setting.GetFetchSetting()
	if err := common.ValidateURLWithFetchSetting(url,
		fetchSetting.EnableSSRFProtection,
		fetchSetting.AllowPrivateIp,
		fetchSetting.DomainFilterMode,
		fetchSetting.IpFilterMode,
		fetchSetting.DomainList,
		fetchSetting.IpList,
		fetchSetting.AllowedPorts,
		fetchSetting.ApplyIPFilterForDomain,
	); err != nil {
		return fmt.Errorf("ssrf reject: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("User-Agent", "NewAPI-Feishu-Alert/1.0")

	resp, err := GetHttpClient().Do(req)
	if err != nil {
		return fmt.Errorf("http do: %w", err)
	}
	defer resp.Body.Close()
	return checkFeishuResp(resp)
}

// ---- App (ak/sk) mode ----

const (
	feishuAuthURL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
	feishuMsgURL  = "https://open.feishu.cn/open-apis/im/v1/messages"
)

var (
	tenantTokenMu      sync.Mutex
	tenantTokenCached  string
	tenantTokenAppId   string // 缓存的 token 对应的 app_id,app_id 变更时强制刷新
	tenantTokenExpires int64  // unix sec
)

func getTenantAccessToken() (string, error) {
	tenantTokenMu.Lock()
	defer tenantTokenMu.Unlock()
	now := time.Now().Unix()
	if tenantTokenCached != "" &&
		tenantTokenAppId == common.FeishuAlertAppId &&
		tenantTokenExpires-60 > now {
		return tenantTokenCached, nil
	}

	body, _ := common.Marshal(map[string]string{
		"app_id":     common.FeishuAlertAppId,
		"app_secret": common.FeishuAlertAppSecret,
	})
	req, err := http.NewRequest(http.MethodPost, feishuAuthURL, bytes.NewBuffer(body))
	if err != nil {
		return "", fmt.Errorf("new auth request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := GetHttpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("auth http do: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("auth read body: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("auth http %d: %s", resp.StatusCode, string(raw))
	}
	var r struct {
		Code              int    `json:"code"`
		Msg               string `json:"msg"`
		TenantAccessToken string `json:"tenant_access_token"`
		Expire            int64  `json:"expire"`
	}
	if err := common.Unmarshal(raw, &r); err != nil {
		return "", fmt.Errorf("auth decode: %w", err)
	}
	if r.Code != 0 || r.TenantAccessToken == "" {
		return "", fmt.Errorf("feishu auth code=%d msg=%s", r.Code, r.Msg)
	}
	tenantTokenCached = r.TenantAccessToken
	tenantTokenAppId = common.FeishuAlertAppId
	tenantTokenExpires = now + r.Expire
	return r.TenantAccessToken, nil
}

func sendFeishuViaApp(ev AlertEvent) error {
	token, err := getTenantAccessToken()
	if err != nil {
		return err
	}
	cardBody, err := buildFeishuCardBody(ev)
	if err != nil {
		return err
	}
	cardJSON, err := common.Marshal(cardBody)
	if err != nil {
		return fmt.Errorf("marshal card: %w", err)
	}
	payload := map[string]string{
		"receive_id": common.FeishuAlertReceiveId,
		"msg_type":   "interactive",
		// /im/v1/messages 要求 content 是 JSON-encoded 字符串,而非嵌套对象
		"content": string(cardJSON),
	}
	body, err := common.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal app payload: %w", err)
	}

	receiveType := strings.TrimSpace(common.FeishuAlertReceiveIdType)
	if receiveType == "" {
		receiveType = "chat_id"
	}
	url := fmt.Sprintf("%s?receive_id_type=%s", feishuMsgURL, receiveType)

	if system_setting.EnableWorker() {
		workerReq := &WorkerRequest{
			URL:    url,
			Key:    system_setting.WorkerValidKey,
			Method: http.MethodPost,
			Headers: map[string]string{
				"Authorization": "Bearer " + token,
				"Content-Type":  "application/json; charset=utf-8",
				"User-Agent":    "NewAPI-Feishu-Alert/1.0",
			},
			Body: body,
		}
		resp, err := DoWorkerRequest(workerReq)
		if err != nil {
			return fmt.Errorf("worker request: %w", err)
		}
		defer resp.Body.Close()
		return checkFeishuResp(resp)
	}

	fetchSetting := system_setting.GetFetchSetting()
	if err := common.ValidateURLWithFetchSetting(url,
		fetchSetting.EnableSSRFProtection,
		fetchSetting.AllowPrivateIp,
		fetchSetting.DomainFilterMode,
		fetchSetting.IpFilterMode,
		fetchSetting.DomainList,
		fetchSetting.IpList,
		fetchSetting.AllowedPorts,
		fetchSetting.ApplyIPFilterForDomain,
	); err != nil {
		return fmt.Errorf("ssrf reject: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("User-Agent", "NewAPI-Feishu-Alert/1.0")

	resp, err := GetHttpClient().Do(req)
	if err != nil {
		return fmt.Errorf("http do: %w", err)
	}
	defer resp.Body.Close()
	return checkFeishuResp(resp)
}

func checkFeishuResp(resp *http.Response) error {
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("feishu http %d: %s", resp.StatusCode, string(body))
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}
	// 飞书在 200 中也可能用 code != 0 表示业务错误
	type feishuResp struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
	}
	var r feishuResp
	if err := common.Unmarshal(body, &r); err == nil && r.Code != 0 {
		return fmt.Errorf("feishu code=%d msg=%s", r.Code, r.Msg)
	}
	return nil
}

// buildFeishuCardBody returns the {header, elements} card object shared by both
// webhook and app modes. Webhook wraps it in {msg_type, card}; app passes it
// stringified through /im/v1/messages content.
func buildFeishuCardBody(ev AlertEvent) (map[string]interface{}, error) {
	ts := time.Now().Unix()

	header := map[string]interface{}{
		"title": map[string]interface{}{
			"tag":     "plain_text",
			"content": fmt.Sprintf("%s [%s] %s", levelEmoji(ev.Level), levelLabel(ev.Level), ev.Title),
		},
		"template": levelTemplate(ev.Level),
	}

	elements := []interface{}{}

	if len(ev.Fields) > 0 {
		fields := make([]interface{}, 0, len(ev.Fields))
		for _, f := range ev.Fields {
			val := f.Value
			if val == "" {
				val = "-"
			}
			fields = append(fields, map[string]interface{}{
				"is_short": f.Short,
				"text": map[string]interface{}{
					"tag":     "lark_md",
					"content": fmt.Sprintf("**%s**\n%s", f.Label, val),
				},
			})
		}
		elements = append(elements, map[string]interface{}{
			"tag":    "div",
			"fields": fields,
		})
	}

	systemName := common.SystemName
	if systemName == "" {
		systemName = "new-api"
	}
	elements = append(elements, map[string]interface{}{
		"tag": "note",
		"elements": []interface{}{
			map[string]interface{}{
				"tag":     "plain_text",
				"content": fmt.Sprintf("%s · %s", time.Unix(ts, 0).Format("2006-01-02 15:04:05"), systemName),
			},
		},
	})

	return map[string]interface{}{
		"header":   header,
		"elements": elements,
	}, nil
}

// buildFeishuWebhookPayload wraps the card body for the custom-bot webhook endpoint.
// Adds optional timestamp+sign when FeishuAlertSignSecret is configured.
func buildFeishuWebhookPayload(ev AlertEvent) (map[string]interface{}, error) {
	card, err := buildFeishuCardBody(ev)
	if err != nil {
		return nil, err
	}
	payload := map[string]interface{}{
		"msg_type": "interactive",
		"card":     card,
	}
	if secret := strings.TrimSpace(common.FeishuAlertSignSecret); secret != "" {
		ts := time.Now().Unix()
		sign, err := genFeishuSign(secret, ts)
		if err != nil {
			return nil, err
		}
		payload["timestamp"] = fmt.Sprintf("%d", ts)
		payload["sign"] = sign
	}
	return payload, nil
}

// 飞书加签算法: HmacSha256(timestamp + "\n" + secret, "") base64 编码
func genFeishuSign(secret string, ts int64) (string, error) {
	str := fmt.Sprintf("%d\n%s", ts, secret)
	h := hmac.New(sha256.New, []byte(str))
	if _, err := h.Write([]byte("")); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(h.Sum(nil)), nil
}

// ---- Dedup ----
//
// Redis: SETNX key 1 EX <ttl> — 创建成功才允许发；已存在则吞掉
// 内存: sync.Map + 自身懒清理

type alertDedupEntry struct {
	expireAt int64
}

var (
	alertDedupMap     sync.Map
	alertDedupCleanup sync.Once
)

func tryAlertDedup(kind, dedupKey string, ttlSec int) bool {
	if ttlSec <= 0 {
		return true
	}
	rawKey := kind
	if dedupKey != "" {
		rawKey = kind + ":" + dedupKey
	}
	sum := sha1.Sum([]byte(rawKey))
	key := "alert_dedup:" + hex.EncodeToString(sum[:])

	if common.RedisEnabled {
		ok, err := common.RedisSetNX(key, "1", time.Duration(ttlSec)*time.Second)
		if err != nil {
			// Redis 故障不应静默丢告警 — 退化到允许发送
			common.SysLog(fmt.Sprintf("feishu alert dedup redis err, allow send: %s", err.Error()))
			return true
		}
		return ok
	}
	return memoryDedup(key, ttlSec)
}

func memoryDedup(key string, ttlSec int) bool {
	alertDedupCleanup.Do(func() {
		go func() {
			t := time.NewTicker(5 * time.Minute)
			defer t.Stop()
			for range t.C {
				now := time.Now().Unix()
				alertDedupMap.Range(func(k, v interface{}) bool {
					if e, ok := v.(alertDedupEntry); ok && e.expireAt < now {
						alertDedupMap.Delete(k)
					}
					return true
				})
			}
		}()
	})
	now := time.Now().Unix()
	if v, ok := alertDedupMap.Load(key); ok {
		if e, ok := v.(alertDedupEntry); ok && e.expireAt > now {
			return false
		}
	}
	alertDedupMap.Store(key, alertDedupEntry{expireAt: now + int64(ttlSec)})
	return true
}
