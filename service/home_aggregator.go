package service

import (
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// HomeDashboard 是 GET /api/home/dashboard 的响应载荷。
// 整体走内存缓存 (homeDashboardTTL),减少首页打开时对 DB 的负载。
type HomeDashboard struct {
	Stats           HomeStats                       `json:"stats"`
	FeaturedModels  map[string][]HomeFeaturedModel  `json:"featured_models"`
	Testimonials    []HomeTestimonial               `json:"testimonials"`
	FAQ             []HomeFAQItem                   `json:"faq"`
	Footer          HomeFooter                      `json:"footer"`
}

type HomeStats struct {
	VendorsCount int    `json:"vendors_count"`
	ModelsOnline int    `json:"models_online"`
	SLAPct       string `json:"sla_pct"`
}

type HomeFeaturedModel struct {
	ModelName    string  `json:"model_name"`
	VendorName   string  `json:"vendor_name,omitempty"`
	Description  string  `json:"description,omitempty"`
	Tags         string  `json:"tags,omitempty"`
	Capabilities string  `json:"capabilities,omitempty"`
	HomePriority int     `json:"home_priority"`
	PricePer1K   float64 `json:"price_per_1k,omitempty"`
}

type HomeTestimonial struct {
	Quote  string `json:"quote"`
	Name   string `json:"name"`
	Title  string `json:"title"`
	Avatar string `json:"avatar"` // tailwind 渐变 class,如 "from-orange-400 to-pink-500"
}

type HomeFAQItem struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

type HomeFooter struct {
	Tagline   string             `json:"tagline"`
	Columns   []HomeFooterColumn `json:"columns"`
	Copyright string             `json:"copyright"`
}

type HomeFooterColumn struct {
	Title string           `json:"title"`
	Links []HomeFooterLink `json:"links"`
}

type HomeFooterLink struct {
	Text string `json:"text"`
	URL  string `json:"url"`
}

// HomeCapabilities 列出页面 Tab 顺序与对应的内部分类标识。
var HomeCapabilities = []string{"chat", "image", "video", "code", "audio", "embedding"}

const homeDashboardTTL = 5 * time.Minute
const homeFeaturedPerCap = 6

var (
	homeDashboardCache  *HomeDashboard
	homeDashboardMu     sync.RWMutex
	homeDashboardExpAt  time.Time
)

// GetHomeDashboard 返回带缓存的首页聚合数据。
func GetHomeDashboard() *HomeDashboard {
	homeDashboardMu.RLock()
	if homeDashboardCache != nil && time.Now().Before(homeDashboardExpAt) {
		out := homeDashboardCache
		homeDashboardMu.RUnlock()
		return out
	}
	homeDashboardMu.RUnlock()

	homeDashboardMu.Lock()
	defer homeDashboardMu.Unlock()
	if homeDashboardCache != nil && time.Now().Before(homeDashboardExpAt) {
		return homeDashboardCache
	}

	d := buildHomeDashboard()
	homeDashboardCache = d
	homeDashboardExpAt = time.Now().Add(homeDashboardTTL)
	return d
}

// InvalidateHomeDashboardCache 由 admin 改动相关 option 时调用,避免等 5 分钟。
func InvalidateHomeDashboardCache() {
	homeDashboardMu.Lock()
	homeDashboardCache = nil
	homeDashboardExpAt = time.Time{}
	homeDashboardMu.Unlock()
}

func buildHomeDashboard() *HomeDashboard {
	return &HomeDashboard{
		Stats:          buildHomeStats(),
		FeaturedModels: buildFeaturedModels(),
		Testimonials:   parseTestimonials(common.HomeTestimonials),
		FAQ:            parseFAQ(common.HomeFAQ),
		Footer:         parseFooter(common.HomeFooter),
	}
}

func buildHomeStats() HomeStats {
	stats := HomeStats{SLAPct: common.HomeStatsSLA}

	var vendorCount int64
	if err := model.DB.Model(&model.Vendor{}).Where("status = ?", 1).Count(&vendorCount).Error; err == nil {
		stats.VendorsCount = int(vendorCount)
	}

	var modelsCount int64
	if err := model.DB.Model(&model.Model{}).Where("status = ?", 1).Count(&modelsCount).Error; err == nil {
		stats.ModelsOnline = int(modelsCount)
	}
	return stats
}

func buildFeaturedModels() map[string][]HomeFeaturedModel {
	out := make(map[string][]HomeFeaturedModel, len(HomeCapabilities))

	// 一次性把所有可能上首页的模型拉出来,本地按规则分桶,
	// 避免对每个 capability 单独发 6 条小查询。
	var models []model.Model
	if err := model.DB.Model(&model.Model{}).
		Where("status = ?", 1).
		Order("home_priority DESC, id ASC").
		Limit(200).
		Find(&models).Error; err != nil {
		for _, c := range HomeCapabilities {
			out[c] = []HomeFeaturedModel{}
		}
		return out
	}

	// vendor_id -> name 字典,一次拿全
	var vendors []model.Vendor
	model.DB.Find(&vendors)
	vendorName := make(map[int]string, len(vendors))
	for _, v := range vendors {
		vendorName[v.Id] = v.Name
	}

	priceLookup := loadModelPriceLookup()

	for _, cap := range HomeCapabilities {
		bucket := make([]HomeFeaturedModel, 0, homeFeaturedPerCap)
		for _, m := range models {
			if !modelMatchesCapability(m, cap) {
				continue
			}
			fm := HomeFeaturedModel{
				ModelName:    m.ModelName,
				VendorName:   vendorName[m.VendorID],
				Description:  m.Description,
				Tags:         m.Tags,
				Capabilities: m.Capabilities,
				HomePriority: m.HomePriority,
				PricePer1K:   priceLookup(m.ModelName),
			}
			bucket = append(bucket, fm)
			if len(bucket) >= homeFeaturedPerCap {
				break
			}
		}
		out[cap] = bucket
	}
	return out
}

// modelMatchesCapability 决定一个模型是否归属某个 Tab。
//
// 设计考量:
//   - 先按 creation_target 显式判定 image/video/audio
//   - 再按 capabilities 字段(逗号分隔)匹配关键字
//   - chat 是兜底:既不属于 creation 也不属于 embedding 的就归 chat
//
// 这里不做"贪心匹配"——同一个模型只会出现在最匹配的那个 Tab 里。
func modelMatchesCapability(m model.Model, cap string) bool {
	caps := strings.ToLower(m.Capabilities)
	target := strings.ToLower(m.CreationTarget)
	name := strings.ToLower(m.ModelName)

	switch cap {
	case "image":
		return strings.Contains(target, "image") || strings.Contains(caps, "image")
	case "video":
		return strings.Contains(target, "video") || strings.Contains(caps, "video")
	case "audio":
		return strings.Contains(target, "audio") ||
			strings.Contains(caps, "audio") ||
			strings.Contains(caps, "tts") ||
			strings.Contains(caps, "asr")
	case "embedding":
		return strings.Contains(caps, "embedding") || strings.Contains(name, "embed")
	case "code":
		return strings.Contains(caps, "code") ||
			strings.Contains(name, "coder") ||
			strings.Contains(name, "codex")
	case "chat":
		// 兜底 chat:其它分类都不匹配的对话模型
		if strings.Contains(target, "image") || strings.Contains(target, "video") || strings.Contains(target, "audio") {
			return false
		}
		if strings.Contains(caps, "embedding") || strings.Contains(name, "embed") {
			return false
		}
		// 排除明确属于 image/video 的能力
		if strings.Contains(caps, "image") && !strings.Contains(caps, "chat") {
			return false
		}
		if strings.Contains(caps, "video") && !strings.Contains(caps, "chat") {
			return false
		}
		return true
	}
	return false
}

// loadModelPriceLookup 返回一个 model_name → 单价(元/1K tokens) 的查找闭包。
// 优先取 ModelPrice(固定价),否则用 ModelRatio × 0.002 反推估算。
// 如果都没配则返回 0(前端按价格未配置展示)。
func loadModelPriceLookup() func(string) float64 {
	prices := ratio_setting.GetModelPriceMap()
	return func(name string) float64 {
		if p, ok := prices[name]; ok && p > 0 {
			return p
		}
		if r, ok, _ := ratio_setting.GetModelRatio(name); ok && r > 0 {
			// model_ratio × 0.002 ≈ 千 tokens 美元价的折算基数
			return r * 0.002
		}
		return 0
	}
}

func parseTestimonials(raw string) []HomeTestimonial {
	if strings.TrimSpace(raw) == "" {
		return []HomeTestimonial{}
	}
	var out []HomeTestimonial
	if err := common.UnmarshalJsonStr(raw, &out); err != nil {
		return []HomeTestimonial{}
	}
	return out
}

func parseFAQ(raw string) []HomeFAQItem {
	if strings.TrimSpace(raw) == "" {
		return []HomeFAQItem{}
	}
	var out []HomeFAQItem
	if err := common.UnmarshalJsonStr(raw, &out); err != nil {
		return []HomeFAQItem{}
	}
	return out
}

func parseFooter(raw string) HomeFooter {
	out := HomeFooter{Columns: []HomeFooterColumn{}}
	if strings.TrimSpace(raw) == "" {
		return out
	}
	if err := common.UnmarshalJsonStr(raw, &out); err != nil {
		return HomeFooter{Columns: []HomeFooterColumn{}}
	}
	if out.Columns == nil {
		out.Columns = []HomeFooterColumn{}
	}
	return out
}
