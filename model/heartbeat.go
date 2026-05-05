package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	HeartbeatStatusRunning          = 1
	HeartbeatStatusPaused           = 2
	HeartbeatStatusRecovered        = 3
	HeartbeatStatusFailedTerminated = 4
)

type ChannelModelHeartbeat struct {
	Id               int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	ChannelId        int    `json:"channel_id" gorm:"not null;uniqueIndex:uniq_channel_model,priority:1;index"`
	Model            string `json:"model" gorm:"type:varchar(255);not null;uniqueIndex:uniq_channel_model,priority:2"`
	ChannelName      string `json:"channel_name" gorm:"type:varchar(255)"`
	Status           int    `json:"status" gorm:"not null;default:1;index"`
	SuccessThreshold int    `json:"success_threshold" gorm:"not null;default:3"`
	IntervalSeconds  int    `json:"interval_seconds" gorm:"not null;default:60"`
	SuccessCount         int    `json:"success_count" gorm:"not null;default:0"`
	ConsecutiveFailures  int    `json:"consecutive_failures" gorm:"not null;default:0"`
	TotalAttempts        int    `json:"total_attempts" gorm:"not null;default:0"`
	LastTestAt       int64  `json:"last_test_at" gorm:"bigint;default:0"`
	NextTestAt       int64  `json:"next_test_at" gorm:"bigint;default:0;index"`
	LastError        string `json:"last_error" gorm:"type:text"`
	DisableReason    string `json:"disable_reason" gorm:"type:text"`
	RecentResults    string `json:"recent_results" gorm:"type:text"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt        int64  `json:"updated_at" gorm:"bigint"`
}

type HeartbeatResult struct {
	Ts        int64  `json:"ts"`
	Success   bool   `json:"success"`
	LatencyMs int64  `json:"latency_ms"`
	Error     string `json:"error,omitempty"`
}

func (ChannelModelHeartbeat) TableName() string {
	return "channel_model_heartbeats"
}

// UpsertHeartbeat creates a heartbeat task for (channel, model), or resets an existing one back to running.
// successThreshold and intervalSeconds default to 0 means use existing value or fall back to caller-provided defaults.
func UpsertHeartbeat(channelId int, modelName, channelName, reason string, defaultThreshold, defaultInterval int) (*ChannelModelHeartbeat, error) {
	now := common.GetTimestamp()
	hb := ChannelModelHeartbeat{}
	err := DB.Where("channel_id = ? AND model = ?", channelId, modelName).First(&hb).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		hb = ChannelModelHeartbeat{
			ChannelId:        channelId,
			Model:            modelName,
			ChannelName:      channelName,
			Status:           HeartbeatStatusRunning,
			SuccessThreshold: defaultThreshold,
			IntervalSeconds:  defaultInterval,
			SuccessCount:     0,
			NextTestAt:       now + int64(defaultInterval),
			DisableReason:    truncate(reason, 2000),
			CreatedAt:        now,
			UpdatedAt:        now,
		}
		return &hb, DB.Create(&hb).Error
	}
	updates := map[string]interface{}{
		"status":               HeartbeatStatusRunning,
		"success_count":        0,
		"consecutive_failures": 0,
		"channel_name":         channelName,
		"disable_reason":       truncate(reason, 2000),
		"next_test_at":         now + int64(hb.IntervalSeconds),
		"updated_at":           now,
	}
	if err := DB.Model(&hb).Updates(updates).Error; err != nil {
		return nil, err
	}
	return GetHeartbeatById(hb.Id)
}

func GetHeartbeatById(id int64) (*ChannelModelHeartbeat, error) {
	hb := &ChannelModelHeartbeat{}
	if err := DB.First(hb, id).Error; err != nil {
		return nil, err
	}
	return hb, nil
}

func FindDueHeartbeats(now int64, limit int) ([]ChannelModelHeartbeat, error) {
	var items []ChannelModelHeartbeat
	err := DB.Where("status = ? AND next_test_at <= ?", HeartbeatStatusRunning, now).
		Order("next_test_at ASC").
		Limit(limit).
		Find(&items).Error
	return items, err
}

type HeartbeatListFilter struct {
	Status    int
	ChannelId int
	Model     string
	Keyword   string
	Page      int
	PageSize  int
}

func ListHeartbeats(f HeartbeatListFilter) ([]ChannelModelHeartbeat, int64, error) {
	var items []ChannelModelHeartbeat
	var total int64

	query := DB.Model(&ChannelModelHeartbeat{})
	if f.Status > 0 {
		query = query.Where("status = ?", f.Status)
	}
	if f.ChannelId > 0 {
		query = query.Where("channel_id = ?", f.ChannelId)
	}
	if f.Model != "" {
		query = query.Where("model = ?", f.Model)
	}
	if f.Keyword != "" {
		like := "%" + f.Keyword + "%"
		query = query.Where("(model LIKE ? OR channel_name LIKE ?)", like, like)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 100 {
		f.PageSize = 20
	}
	err := query.Order("id DESC").
		Offset((f.Page - 1) * f.PageSize).
		Limit(f.PageSize).
		Find(&items).Error
	return items, total, err
}

func PauseHeartbeat(id int64) error {
	return setHeartbeatStatus(id, HeartbeatStatusPaused)
}

func ResumeHeartbeat(id int64) error {
	now := common.GetTimestamp()
	return DB.Model(&ChannelModelHeartbeat{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":               HeartbeatStatusRunning,
		"consecutive_failures": 0,
		"next_test_at":         now,
		"updated_at":           now,
	}).Error
}

func TriggerHeartbeat(id int64) error {
	now := common.GetTimestamp()
	return DB.Model(&ChannelModelHeartbeat{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":       HeartbeatStatusRunning,
		"next_test_at": now,
		"updated_at":   now,
	}).Error
}

func setHeartbeatStatus(id int64, status int) error {
	return DB.Model(&ChannelModelHeartbeat{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":     status,
		"updated_at": common.GetTimestamp(),
	}).Error
}

func UpdateHeartbeatConfig(id int64, successThreshold, intervalSeconds *int) error {
	updates := map[string]interface{}{"updated_at": common.GetTimestamp()}
	if successThreshold != nil {
		if *successThreshold <= 0 {
			return errors.New("success_threshold must be > 0")
		}
		updates["success_threshold"] = *successThreshold
	}
	if intervalSeconds != nil {
		if *intervalSeconds <= 0 {
			return errors.New("interval_seconds must be > 0")
		}
		updates["interval_seconds"] = *intervalSeconds
	}
	if len(updates) == 1 {
		return nil
	}
	return DB.Model(&ChannelModelHeartbeat{}).Where("id = ?", id).Updates(updates).Error
}

func DeleteHeartbeat(id int64) error {
	return DB.Delete(&ChannelModelHeartbeat{}, id).Error
}

// HeartbeatRecordOutcome describes what happened in RecordHeartbeatResult so callers
// can react (typically: send recovery / failure alerts).
type HeartbeatRecordOutcome struct {
	Recovered          bool // success_count just crossed threshold → ability re-enabled
	FailedTerminated   bool // consecutive_failures crossed limit → worker stops polling
	ConsecutiveFails   int  // current consecutive failure count after this update
}

// RecordHeartbeatResult appends a single test result, updates counters and schedules
// the next run. failureLimit > 0 caps consecutive failures: when reached, the task is
// flipped to failed_terminated so the worker stops polling. Pass 0 to disable the cap.
func RecordHeartbeatResult(id int64, success bool, latencyMs int64, errMsg string, recentLimit int, failureLimit int) (HeartbeatRecordOutcome, error) {
	out := HeartbeatRecordOutcome{}
	hb, err := GetHeartbeatById(id)
	if err != nil {
		return out, err
	}
	now := common.GetTimestamp()

	results := decodeRecentResults(hb.RecentResults)
	results = append(results, HeartbeatResult{
		Ts:        now,
		Success:   success,
		LatencyMs: latencyMs,
		Error:     truncate(errMsg, 500),
	})
	if recentLimit > 0 && len(results) > recentLimit {
		results = results[len(results)-recentLimit:]
	}
	encoded, _ := common.Marshal(results)

	updates := map[string]interface{}{
		"total_attempts": hb.TotalAttempts + 1,
		"last_test_at":   now,
		"recent_results": string(encoded),
		"updated_at":     now,
	}
	if success {
		newCount := hb.SuccessCount + 1
		updates["success_count"] = newCount
		updates["consecutive_failures"] = 0
		updates["last_error"] = ""
		if newCount >= hb.SuccessThreshold {
			updates["status"] = HeartbeatStatusRecovered
			out.Recovered = true
		} else {
			updates["next_test_at"] = now + int64(hb.IntervalSeconds)
		}
	} else {
		newFails := hb.ConsecutiveFailures + 1
		updates["success_count"] = 0
		updates["consecutive_failures"] = newFails
		updates["last_error"] = truncate(errMsg, 2000)
		out.ConsecutiveFails = newFails
		if failureLimit > 0 && newFails >= failureLimit {
			updates["status"] = HeartbeatStatusFailedTerminated
			out.FailedTerminated = true
		} else {
			updates["next_test_at"] = now + int64(hb.IntervalSeconds)
		}
	}
	if err := DB.Model(&ChannelModelHeartbeat{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return out, err
	}
	return out, nil
}

func decodeRecentResults(s string) []HeartbeatResult {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	var out []HeartbeatResult
	if err := common.UnmarshalJsonStr(s, &out); err != nil {
		return nil
	}
	return out
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
