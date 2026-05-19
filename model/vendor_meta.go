package model

import (
	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// Vendor 用于存储供应商信息，供模型引用
// Name 唯一，用于在模型中关联
// Icon 采用 @lobehub/icons 的图标名，前端可直接渲染
// Status 预留字段，1 表示启用
// 本表同样遵循 3NF 设计范式

type Vendor struct {
	Id          int            `json:"id"`
	Name        string         `json:"name" gorm:"size:128;not null;uniqueIndex:uk_vendor_name_delete_at,priority:1"`
	Description string         `json:"description,omitempty" gorm:"type:text"`
	Icon        string         `json:"icon,omitempty" gorm:"type:varchar(128)"`
	Status      int            `json:"status" gorm:"default:1"`
	// Discount 仅用于模型广场「展示」折扣价（不影响计费）。
	// 语义：0 = 不打折，按原价展示；0<x<1 = 折扣倍率（如 0.7 表示 7 折）。
	// >=1 也按 0 处理（不打折）。
	Discount    float64        `json:"discount" gorm:"type:double;default:0"`
	CreatedTime int64          `json:"created_time" gorm:"bigint"`
	UpdatedTime int64          `json:"updated_time" gorm:"bigint"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index;uniqueIndex:uk_vendor_name_delete_at,priority:2"`
}

// Insert 创建新的供应商记录
func (v *Vendor) Insert() error {
	now := common.GetTimestamp()
	v.CreatedTime = now
	v.UpdatedTime = now
	return DB.Create(v).Error
}

// IsVendorNameDuplicated 检查供应商名称是否重复（排除自身 ID）
func IsVendorNameDuplicated(id int, name string) (bool, error) {
	if name == "" {
		return false, nil
	}
	var cnt int64
	err := DB.Model(&Vendor{}).Where("name = ? AND id <> ?", name, id).Count(&cnt).Error
	return cnt > 0, err
}

// Update 更新供应商记录
func (v *Vendor) Update() error {
	v.UpdatedTime = common.GetTimestamp()
	return DB.Save(v).Error
}

// Delete 软删除供应商
func (v *Vendor) Delete() error {
	return DB.Delete(v).Error
}

// GetVendorByID 根据 ID 获取供应商
func GetVendorByID(id int) (*Vendor, error) {
	var v Vendor
	err := DB.First(&v, id).Error
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// GetAllVendors 获取全部供应商（分页）
func GetAllVendors(offset int, limit int) ([]*Vendor, error) {
	var vendors []*Vendor
	err := DB.Offset(offset).Limit(limit).Find(&vendors).Error
	return vendors, err
}

// SearchVendors 按关键字搜索供应商
func SearchVendors(keyword string, offset int, limit int) ([]*Vendor, int64, error) {
	db := DB.Model(&Vendor{})
	if keyword != "" {
		like := "%" + keyword + "%"
		db = db.Where("name LIKE ? OR description LIKE ?", like, like)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var vendors []*Vendor
	if err := db.Offset(offset).Limit(limit).Order("id DESC").Find(&vendors).Error; err != nil {
		return nil, 0, err
	}
	return vendors, total, nil
}

// defaultVendorDiscounts 模型广场展示用的内置默认折扣（仅 UI 展示，不影响计费）。
// 仅当对应供应商的 discount=0（即「未配置过」）时才会在启动时填入；管理员手动改过的值不会被覆盖。
var defaultVendorDiscounts = map[string]float64{
	"OpenAI":    0.7,  // GPT 7 折
	"Anthropic": 0.85, // Claude 85 折
	"Google":    0.8,  // Gemini 8 折
}

// SeedDefaultVendorDiscounts 启动时调用一次，幂等。
// 仅对 discount=0 的目标供应商写入默认折扣；管理员后续置 0 也会再被填回 —— 这是「显式禁用」与「未配置」共用 0 的代价，权衡下取后者更友好。
// 想要永久关闭某供应商的展示折扣，请把 discount 设为 1。
func SeedDefaultVendorDiscounts() {
	for name, d := range defaultVendorDiscounts {
		_ = DB.Model(&Vendor{}).
			Where("name = ? AND (discount IS NULL OR discount = 0)", name).
			Update("discount", d).Error
	}
}
