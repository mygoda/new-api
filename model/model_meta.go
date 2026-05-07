package model

import (
	"database/sql/driver"
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// FlexString 兼容 JSON 数字和字符串两种格式的字符串类型。
// JSON 输入 "128K" 或 128000 均可正确解析为字符串。
// 同时兼容数据库 BIGINT → VARCHAR 迁移期间的列读取。
type FlexString string

func (f *FlexString) UnmarshalJSON(data []byte) error {
	s := string(data)
	if s == "null" {
		return nil
	}
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		s = s[1 : len(s)-1]
	}
	*f = FlexString(s)
	return nil
}

func (f FlexString) MarshalJSON() ([]byte, error) {
	return common.Marshal(string(f))
}

// Scan implements sql.Scanner for reading from DB (handles int64, string, []byte).
func (f *FlexString) Scan(value interface{}) error {
	if value == nil {
		*f = ""
		return nil
	}
	switch v := value.(type) {
	case string:
		*f = FlexString(v)
	case []byte:
		*f = FlexString(v)
	case int64:
		if v == 0 {
			*f = ""
		} else {
			*f = FlexString(strconv.FormatInt(v, 10))
		}
	default:
		*f = FlexString(fmt.Sprintf("%v", v))
	}
	return nil
}

// Value implements driver.Valuer for writing to DB.
func (f FlexString) Value() (driver.Value, error) {
	return string(f), nil
}

const (
	NameRuleExact = iota
	NameRulePrefix
	NameRuleContains
	NameRuleSuffix
)

type BoundChannel struct {
	Name string `json:"name"`
	Type int    `json:"type"`
}

type Model struct {
	Id           int            `json:"id"`
	ModelName    string         `json:"model_name" gorm:"size:128;not null;uniqueIndex:uk_model_name_delete_at,priority:1"`
	Description  string         `json:"description,omitempty" gorm:"type:text"`
	Icon         string         `json:"icon,omitempty" gorm:"type:varchar(128)"`
	Tags         string         `json:"tags,omitempty" gorm:"type:varchar(255)"`
	VendorID     int            `json:"vendor_id,omitempty" gorm:"index"`
	Endpoints    string         `json:"endpoints,omitempty" gorm:"type:text"`
	ContextLength FlexString      `json:"context_length" gorm:"type:varchar(32);default:''"`
	MaxOutputTokens FlexString    `json:"max_output_tokens" gorm:"type:varchar(32);default:''"`
	Capabilities    string        `json:"capabilities,omitempty" gorm:"type:varchar(255);default:''"`
	KnowledgeCutoff string        `json:"knowledge_cutoff,omitempty" gorm:"type:varchar(32);default:''"`
	LongDescription string        `json:"long_description,omitempty" gorm:"type:text"`
	// 创作中心可见性（显式覆盖 endpoints/capabilities/tags/name 自动检测）
	//   ""               -> auto，按 capabilities/endpoints/tags/name 自动判断
	//   "none"           -> 不在创作中心展示
	//   "image"/"video"  -> 仅在对应 tab 展示
	//   "image,video"    -> 两个 tab 都展示
	CreationTarget  string        `json:"creation_target" gorm:"type:varchar(64);default:''"`
	// 首页推荐优先级。0 = 不推荐(natural order),数字越大越靠前。
	// 用于 /api/home/dashboard 筛选「能力 Tabs」中每个 capability 的精选模型。
	HomePriority int            `json:"home_priority" gorm:"default:0;index"`
	// VideoInputRatio 输入含视频时的乘子。0 = 禁用(走基准价)。
	//   触发条件:OpenAI 兼容 messages[].content[].type == "video_url"
	//   或 task body 的 content 数组中包含 video_url 类型项
	// 例如 doubao-seed-2-0-pro 这类多模态聊天模型,输入含视频按 1.5× 计费,
	// admin 在「模型管理」编辑表单中配置即可,无需改代码。
	VideoInputRatio float64    `json:"video_input_ratio" gorm:"default:0"`
	Status       int            `json:"status" gorm:"default:1"`
	SyncOfficial int            `json:"sync_official" gorm:"default:1"`
	CreatedTime  int64          `json:"created_time" gorm:"bigint"`
	UpdatedTime  int64          `json:"updated_time" gorm:"bigint"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index;uniqueIndex:uk_model_name_delete_at,priority:2"`

	BoundChannels []BoundChannel `json:"bound_channels,omitempty" gorm:"-"`
	EnableGroups  []string       `json:"enable_groups,omitempty" gorm:"-"`
	QuotaTypes    []int          `json:"quota_types,omitempty" gorm:"-"`
	NameRule      int            `json:"name_rule" gorm:"default:0"`

	MatchedModels []string `json:"matched_models,omitempty" gorm:"-"`
	MatchedCount  int      `json:"matched_count,omitempty" gorm:"-"`
}

func (mi *Model) Insert() error {
	now := common.GetTimestamp()
	mi.CreatedTime = now
	mi.UpdatedTime = now

	// 保存原始值（因为 Create 后可能被 GORM 的 default 标签覆盖为 1）
	originalStatus := mi.Status
	originalSyncOfficial := mi.SyncOfficial

	// 先创建记录（GORM 会对零值字段应用默认值）
	if err := DB.Create(mi).Error; err != nil {
		return err
	}

	// 使用保存的原始值进行更新，确保零值能正确保存
	return DB.Model(&Model{}).Where("id = ?", mi.Id).Updates(map[string]interface{}{
		"status":        originalStatus,
		"sync_official": originalSyncOfficial,
	}).Error
}

func IsModelNameDuplicated(id int, name string) (bool, error) {
	if name == "" {
		return false, nil
	}
	var cnt int64
	err := DB.Model(&Model{}).Where("model_name = ? AND id <> ?", name, id).Count(&cnt).Error
	return cnt > 0, err
}

func (mi *Model) Update() error {
	mi.UpdatedTime = common.GetTimestamp()
	// 使用 Select 强制更新所有字段，包括零值
	return DB.Model(&Model{}).Where("id = ?", mi.Id).
		Select("model_name", "description", "icon", "tags", "vendor_id", "endpoints", "context_length", "max_output_tokens", "capabilities", "knowledge_cutoff", "long_description", "creation_target", "home_priority", "status", "sync_official", "name_rule", "updated_time").
		Updates(mi).Error
}

func (mi *Model) Delete() error {
	return DB.Delete(mi).Error
}

func GetVendorModelCounts() (map[int64]int64, error) {
	var stats []struct {
		VendorID int64
		Count    int64
	}
	if err := DB.Model(&Model{}).
		Select("vendor_id as vendor_id, count(*) as count").
		Group("vendor_id").
		Scan(&stats).Error; err != nil {
		return nil, err
	}
	m := make(map[int64]int64, len(stats))
	for _, s := range stats {
		m[s.VendorID] = s.Count
	}
	return m, nil
}

func GetAllModels(offset int, limit int) ([]*Model, error) {
	var models []*Model
	err := DB.Order("id DESC").Offset(offset).Limit(limit).Find(&models).Error
	return models, err
}

func GetBoundChannelsByModelsMap(modelNames []string) (map[string][]BoundChannel, error) {
	result := make(map[string][]BoundChannel)
	if len(modelNames) == 0 {
		return result, nil
	}
	type row struct {
		Model string
		Name  string
		Type  int
	}
	var rows []row
	err := DB.Table("channels").
		Select("abilities.model as model, channels.name as name, channels.type as type").
		Joins("JOIN abilities ON abilities.channel_id = channels.id").
		Where("abilities.model IN ? AND abilities.enabled = ?", modelNames, true).
		Distinct().
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		result[r.Model] = append(result[r.Model], BoundChannel{Name: r.Name, Type: r.Type})
	}
	return result, nil
}

func SearchModels(keyword string, vendor string, offset int, limit int) ([]*Model, int64, error) {
	var models []*Model
	db := DB.Model(&Model{})
	if keyword != "" {
		like := "%" + keyword + "%"
		db = db.Where("model_name LIKE ? OR description LIKE ? OR tags LIKE ?", like, like, like)
	}
	if vendor != "" {
		if vid, err := strconv.Atoi(vendor); err == nil {
			db = db.Where("models.vendor_id = ?", vid)
		} else {
			db = db.Joins("JOIN vendors ON vendors.id = models.vendor_id").Where("vendors.name LIKE ?", "%"+vendor+"%")
		}
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := db.Order("models.id DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, 0, err
	}
	return models, total, nil
}
