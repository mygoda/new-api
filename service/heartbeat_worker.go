package service

import (
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

// HeartbeatTester runs a single test on (channel, model) and returns latency, optional error message,
// and a success flag. controllers register the implementation via RegisterHeartbeatTester at startup
// to avoid a controller→service import cycle.
type HeartbeatTester func(channelId int, modelName string) (latencyMs int64, errMsg string, ok bool)

var (
	heartbeatTester     HeartbeatTester
	heartbeatTesterOnce sync.Once
	heartbeatWorkerOnce sync.Once
)

func RegisterHeartbeatTester(t HeartbeatTester) {
	heartbeatTesterOnce.Do(func() {
		heartbeatTester = t
	})
}

func StartHeartbeatWorker() {
	if !common.IsMasterNode {
		return
	}
	heartbeatWorkerOnce.Do(func() {
		go heartbeatLoop()
	})
}

func heartbeatLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		runDueHeartbeats()
	}
}

func runDueHeartbeats() {
	if heartbeatTester == nil {
		return
	}
	now := common.GetTimestamp()
	due, err := model.FindDueHeartbeats(now, 50)
	if err != nil {
		common.SysLog(fmt.Sprintf("heartbeat: find due failed: %s", err.Error()))
		return
	}
	if len(due) == 0 {
		return
	}
	for _, hb := range due {
		hb := hb
		gopool.Go(func() {
			runOneHeartbeat(hb)
		})
	}
}

func runOneHeartbeat(hb model.ChannelModelHeartbeat) {
	defer func() {
		if r := recover(); r != nil {
			common.SysLog(fmt.Sprintf("heartbeat: panic in run id=%d: %v", hb.Id, r))
			SendFeishuAlert(AlertEvent{
				Kind:  AlertKindPanic,
				Level: AlertLevelCritical,
				Title: "心跳 worker panic",
				Fields: []AlertField{
					{Label: "心跳任务", Value: fmt.Sprintf("#%d", hb.Id), Short: true},
					{Label: "渠道", Value: fmt.Sprintf("#%d %s", hb.ChannelId, hb.ChannelName), Short: true},
					{Label: "模型", Value: hb.Model, Short: true},
					{Label: "Error", Value: fmt.Sprintf("%v", r), Short: false},
				},
				DedupKey: fmt.Sprintf("worker:%d", hb.Id),
			})
		}
	}()

	latencyMs, errMsg, ok := heartbeatTester(hb.ChannelId, hb.Model)

	outcome, err := model.RecordHeartbeatResult(
		hb.Id, ok, latencyMs, errMsg,
		common.ChannelModelHeartbeatRecentResultsLimit,
		common.FeishuAlertHeartbeatFailureLimit,
	)
	if err != nil {
		common.SysLog(fmt.Sprintf("heartbeat: record result failed id=%d: %s", hb.Id, err.Error()))
		return
	}

	if outcome.FailedTerminated {
		common.SysLog(fmt.Sprintf("heartbeat: id=%d channel=%d model=%s 连续 %d 次失败，已终止心跳", hb.Id, hb.ChannelId, hb.Model, outcome.ConsecutiveFails))
		subject := fmt.Sprintf("通道「%s」（#%d）模型「%s」心跳长期未恢复", hb.ChannelName, hb.ChannelId, hb.Model)
		content := fmt.Sprintf("心跳任务 #%d 连续 %d 次失败，已终止自动探测。最近错误：%s", hb.Id, outcome.ConsecutiveFails, errMsg)
		NotifyRootUser(fmt.Sprintf("channel_model_hb_terminated_%d_%s", hb.ChannelId, hb.Model), subject, content)
		SendFeishuAlert(AlertEvent{
			Kind:  AlertKindHeartbeatFailed,
			Level: AlertLevelWarning,
			Title: subject,
			Fields: []AlertField{
				{Label: "渠道", Value: fmt.Sprintf("#%d %s", hb.ChannelId, hb.ChannelName), Short: true},
				{Label: "模型", Value: hb.Model, Short: true},
				{Label: "连续失败", Value: fmt.Sprintf("%d 次", outcome.ConsecutiveFails), Short: true},
				{Label: "最近错误", Value: errMsg, Short: false},
			},
			DedupKey: fmt.Sprintf("hb_terminated:%d", hb.Id),
		})
		return
	}

	if !outcome.Recovered {
		return
	}

	rows, err := model.UpdateAbilityEnabledByChannelModel(hb.ChannelId, hb.Model, true)
	if err != nil {
		common.SysLog(fmt.Sprintf("heartbeat: re-enable ability failed id=%d: %s", hb.Id, err.Error()))
		return
	}
	model.InitChannelCache()

	subject := fmt.Sprintf("通道「%s」（#%d）模型「%s」已自动恢复", hb.ChannelName, hb.ChannelId, hb.Model)
	content := fmt.Sprintf("通道「%s」（#%d）模型「%s」连续 %d 次心跳成功，已自动恢复 %d 条 ability。",
		hb.ChannelName, hb.ChannelId, hb.Model, hb.SuccessThreshold, rows)
	NotifyRootUser(fmt.Sprintf("channel_model_recovered_%d_%s", hb.ChannelId, hb.Model), subject, content)
	SendFeishuAlert(AlertEvent{
		Kind:  AlertKindChannelRecover,
		Level: AlertLevelInfo,
		Title: subject,
		Fields: []AlertField{
			{Label: "渠道", Value: fmt.Sprintf("#%d %s", hb.ChannelId, hb.ChannelName), Short: true},
			{Label: "模型", Value: hb.Model, Short: true},
			{Label: "心跳", Value: fmt.Sprintf("连续 %d 次成功", hb.SuccessThreshold), Short: false},
		},
		DedupKey: fmt.Sprintf("recover:%d:%s", hb.ChannelId, hb.Model),
	})
}
