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
		}
	}()

	latencyMs, errMsg, ok := heartbeatTester(hb.ChannelId, hb.Model)

	recovered, err := model.RecordHeartbeatResult(hb.Id, ok, latencyMs, errMsg, common.ChannelModelHeartbeatRecentResultsLimit)
	if err != nil {
		common.SysLog(fmt.Sprintf("heartbeat: record result failed id=%d: %s", hb.Id, err.Error()))
		return
	}
	if !recovered {
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
}
