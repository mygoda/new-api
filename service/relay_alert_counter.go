package service

import (
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// relay5xxCounter tracks 5xx error timestamps per channel within a sliding window.
// When the count crosses common.FeishuAlertRelay5xxThreshold inside the window we
// emit one Feishu alert (further alerts get dropped by the alert-level dedup).
//
// Memory only: per-process, not synchronized across replicas. That's acceptable
// because each replica that observes a flood will independently send an alert,
// and the dedup layer collapses duplicates into one card per dedup window.
type relay5xxBuckets struct {
	mu          sync.Mutex
	channelHits map[int][]int64 // channel_id -> ts seconds
	channelName map[int]string
}

var relay5xx = relay5xxBuckets{
	channelHits: make(map[int][]int64),
	channelName: make(map[int]string),
}

// RecordRelay5xx ingests one 5xx event and fires an alert if the channel has
// crossed the configured threshold within the configured window.
func RecordRelay5xx(channelId int, channelName, modelName string, statusCode int, errMsg string) {
	if !common.FeishuAlertEnabled {
		return
	}
	threshold := common.FeishuAlertRelay5xxThreshold
	windowSec := int64(common.FeishuAlertRelay5xxWindowSeconds)
	if threshold <= 0 || windowSec <= 0 {
		return
	}

	now := time.Now().Unix()
	cutoff := now - windowSec

	relay5xx.mu.Lock()
	relay5xx.channelName[channelId] = channelName
	hits := relay5xx.channelHits[channelId]
	// 修剪过期 ts
	pruned := hits[:0]
	for _, ts := range hits {
		if ts >= cutoff {
			pruned = append(pruned, ts)
		}
	}
	pruned = append(pruned, now)
	relay5xx.channelHits[channelId] = pruned
	count := len(pruned)
	relay5xx.mu.Unlock()

	if count < threshold {
		return
	}

	// 命中阈值,告警(SendFeishuAlert 内部按 channelId+window 去重)
	subject := fmt.Sprintf("通道「%s」（#%d）%d 秒内连续 %d 次 5xx", channelName, channelId, windowSec, count)
	SendFeishuAlert(AlertEvent{
		Kind:  AlertKindRelay5xx,
		Level: AlertLevelWarning,
		Title: subject,
		Fields: []AlertField{
			{Label: "渠道", Value: fmt.Sprintf("#%d %s", channelId, channelName), Short: true},
			{Label: "模型", Value: modelName, Short: true},
			{Label: "窗口", Value: fmt.Sprintf("%ds 内 %d 次", windowSec, count), Short: true},
			{Label: "最近状态码", Value: fmt.Sprintf("%d", statusCode), Short: true},
			{Label: "最近错误", Value: errMsg, Short: false},
		},
		DedupKey: fmt.Sprintf("%d:%ds", channelId, windowSec),
	})
}
