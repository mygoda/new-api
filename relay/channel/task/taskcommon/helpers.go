package taskcommon

import (
	"encoding/base64"
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// UnmarshalMetadata converts a map[string]any metadata to a typed struct via JSON round-trip.
// This replaces the repeated pattern: json.Marshal(metadata) → json.Unmarshal(bytes, &target).
func UnmarshalMetadata(metadata map[string]any, target any) error {
	if metadata == nil {
		return nil
	}
	metaBytes, err := common.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("marshal metadata failed: %w", err)
	}
	if err := common.Unmarshal(metaBytes, target); err != nil {
		return fmt.Errorf("unmarshal metadata failed: %w", err)
	}
	return nil
}

// DefaultString returns val if non-empty, otherwise fallback.
func DefaultString(val, fallback string) string {
	if val == "" {
		return fallback
	}
	return val
}

// DefaultInt returns val if non-zero, otherwise fallback.
func DefaultInt(val, fallback int) int {
	if val == 0 {
		return fallback
	}
	return val
}

// EncodeLocalTaskID encodes an upstream operation name to a URL-safe base64 string.
// Used by Gemini/Vertex to store upstream names as task IDs.
func EncodeLocalTaskID(name string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(name))
}

// DecodeLocalTaskID decodes a base64-encoded upstream operation name.
func DecodeLocalTaskID(id string) (string, error) {
	b, err := base64.RawURLEncoding.DecodeString(id)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// BuildProxyURL constructs the video proxy URL using the public task ID.
// e.g., "https://your-server.com/v1/videos/task_xxxx/content"
func BuildProxyURL(taskID string) string {
	return fmt.Sprintf("%s/v1/videos/%s/content", system_setting.ServerAddress, taskID)
}

// Status-to-progress mapping constants for polling updates.
const (
	ProgressSubmitted  = "10%"
	ProgressQueued     = "20%"
	ProgressInProgress = "30%"
	ProgressComplete   = "100%"
)

// ---------------------------------------------------------------------------
// BaseBilling — embeddable no-op implementations for TaskAdaptor billing methods.
// Adaptors that do not need custom billing can embed this struct directly.
// ---------------------------------------------------------------------------

type BaseBilling struct{}

// EstimateBilling returns nil (no extra ratios; use base model price).
func (BaseBilling) EstimateBilling(_ *gin.Context, _ *relaycommon.RelayInfo) map[string]float64 {
	return nil
}

// AdjustBillingOnSubmit 默认实现:接入「条件分价 v2」。
//
// 自动让所有继承 BaseBilling 的 task adaptor (doubao / kling / sora / vidu / ...)
// 都支持 admin 在「价格配置」中按维度自助配置规则,无需 adaptor 重写本方法。
//
// 数据源:优先 info.UpstreamRequestBody (BuildRequestBody 时落下的上游请求字节),
// 缺省时退化到 taskBody (实际是 DoResponse 的响应体,通常无法用于"请求侧"维度)。
//
// 同时把命中规则元数据写入 info.PriceData.OtherInfo,供日志可读化展示
// (条件、规则 label、目标价格、基准 ratio 等)。
//
// 若某 adaptor 需要在 v2 之上叠加自定义乘子(例如 token-based 计费的 channel-specific
// 修正),可以重写此方法并自行合并 v2 结果。
func (BaseBilling) AdjustBillingOnSubmit(info *relaycommon.RelayInfo, taskBody []byte) map[string]float64 {
	src := info.UpstreamRequestBody
	if len(src) == 0 {
		src = taskBody
	}
	ratios, match := ratio_setting.ApplyConditionalRatiosV2WithMatch(info.OriginModelName, src)
	if match != nil {
		// 命中规则的具体定价(目标价、乘子)
		info.PriceData.AddOtherInfo("条件分价", formatConditionalV2Match(match))
		if match.RuleLabel != "" {
			info.PriceData.AddOtherInfo("命中规则", match.RuleLabel)
		}
		// 基础单价 vs 命中后单价,便于一眼对比
		basePriceRMB := match.BaseRatio * 2 * ratio_setting.USD2RMB
		info.PriceData.AddOtherInfo(
			"计费基准",
			fmt.Sprintf("%.2f 元/百万token (倍率 %.4f)", basePriceRMB, match.BaseRatio),
		)
		// 完整的请求维度快照(480p / 720p / 是否含视频 / 是否有声...) ——
		// 让日志能体现"这次请求长什么样",方便运营核对计费来源
		if dims := formatDimensionSnapshot(match.Snapshot); dims != "" {
			info.PriceData.AddOtherInfo("请求维度", dims)
		}
	}
	return ratios
}

// formatConditionalV2Match 把命中规则压缩为中文人话。
// 例: "输入包含视频=是 → 22.00 元/百万token (乘子 0.5945)"
func formatConditionalV2Match(m *ratio_setting.ConditionalRatioV2Match) string {
	if m == nil {
		return ""
	}
	condStr := formatConditionMap(m.Conditions)
	if condStr == "" {
		condStr = "默认档(无条件)"
	}
	return fmt.Sprintf("%s → %.2f 元/百万token (乘子 %.4f)",
		condStr, m.PriceRMBPerMillion, m.Multiplier)
}

// formatDimensionSnapshot 把请求维度快照渲染成中文一句话。
// 例: "输出分辨率=720p, 输入包含视频=是, 生成原生音频=否, 添加水印=否"
func formatDimensionSnapshot(snapshot map[string]any) string {
	return formatConditionMap(snapshot)
}

// formatConditionMap 通用:把 {dim_key: value} map 转中文段落,
// dim_key 走 common.ListDimensions() 翻译为 label,布尔值翻译为 是/否。
func formatConditionMap(m map[string]any) string {
	if len(m) == 0 {
		return ""
	}
	dimLabels := map[string]string{}
	for _, d := range common.ListDimensions() {
		if d.Label != "" {
			dimLabels[d.Key] = d.Label
		}
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		label := dimLabels[k]
		if label == "" {
			label = k
		}
		out = append(out, fmt.Sprintf("%s=%s", label, condValueToChinese(m[k])))
	}
	return strings.Join(out, ", ")
}

// condValueToChinese 把条件值转成中文展示串(布尔翻译,其它直出)。
func condValueToChinese(v any) string {
	switch x := v.(type) {
	case bool:
		if x {
			return "是"
		}
		return "否"
	case string:
		return x
	default:
		return fmt.Sprintf("%v", v)
	}
}

// AdjustBillingOnComplete returns 0 (keep pre-charged amount).
func (BaseBilling) AdjustBillingOnComplete(_ *model.Task, _ *relaycommon.TaskInfo) int {
	return 0
}
