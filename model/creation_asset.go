package model

import (
	"encoding/json"
	"time"
)

// CreationAsset 云端作品库表
//
// 用户在创作中心生成的图像/视频作品，可选择性上传到云端持久化。
// 前端 localStorage 作为 fallback；开启云端作品库后自动同步。
type CreationAsset struct {
	ID        int       `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID    int       `gorm:"index;not null" json:"user_id"`
	Modality  string    `gorm:"type:varchar(20);index;not null" json:"modality"` // image / video
	ModelName string    `gorm:"type:varchar(100);not null" json:"model_name"`
	Prompt    string    `gorm:"type:text" json:"prompt"`
	AssetURL  string    `gorm:"type:varchar(2048)" json:"asset_url"`
	Status    string    `gorm:"type:varchar(20);index;default:'success'" json:"status"` // success / failed / in_progress
	TaskID    string    `gorm:"type:varchar(100);index" json:"task_id,omitempty"`
	Params    string    `gorm:"type:text" json:"params"` // JSON 序列化的参数对象
	CreatedAt time.Time `gorm:"index" json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (CreationAsset) TableName() string {
	return "creation_assets"
}

// ParamsMap 反序列化 Params 字段
func (a *CreationAsset) ParamsMap() map[string]interface{} {
	if a.Params == "" {
		return nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(a.Params), &m); err != nil {
		return nil
	}
	return m
}

// SetParams 序列化 map 到 Params 字段
func (a *CreationAsset) SetParams(m map[string]interface{}) error {
	if m == nil {
		a.Params = ""
		return nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	a.Params = string(b)
	return nil
}
