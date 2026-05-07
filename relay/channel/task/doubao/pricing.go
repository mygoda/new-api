package doubao

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// 文件用途:Seedance 系列视频模型的「条件分价」实现。
//
// 火山方舟官方按 token 计费,但单价随条件变化:
//   - Seedance 1.5 pro:  有声 16 vs 无声 8 RMB/M;Draft 折算 0.6(声)/ 0.7(静)
//   - Seedance 2.0:      720p 输入不含视频 46 / 1080p 51 / 输入含视频 28 / 31
//   - Seedance 2.0 fast: 720p 不含 37 / 含视频 22(不支持 1080p)
//
// 设计:
//   - default ModelRatio (model_ratio.go) 配的是「主流场景」基准价
//     (1.5 pro 有声 720p / 2.0 系列 720p 输入不含视频)。
//   - AdjustBillingOnSubmit 在提交时根据请求参数返回 OtherRatios 乘子,
//     框架按 baseQuota × ∏ratios 重算预扣;BillingContext 自动持久化。
//   - AdjustBillingOnComplete 在任务终态用真实 token × ratio × ∏OtherRatios
//     × groupRatio 重算实际扣费,差额由框架补扣 / 退还。

// SeedanceConditions 描述影响 Seedance 单价的所有维度。
type SeedanceConditions struct {
	Model         string
	GenerateAudio bool   // 1.5 pro 默认 true,2.0 系列默认 true
	Draft         bool   // 仅 1.5 pro 支持
	Resolution    string // "480p" / "720p" / "1080p"
	HasVideoInput bool   // content 数组中含 video_url
}

// computeSeedanceMultipliers 返回相对「主流基准」的 OtherRatios 乘子映射。
// 命中条件时返回乘子;不命中保持空 map(基础价)。
//
// 各条件的 multiplier 数值与启用状态从 admin 后台 ConditionalRatios option
// 读取(对应 family 在 seedance_register.go 注册);允许 admin 在「价格配置」UI
// 勾选/编辑;option 缺失或某条规则缺失时回退到注册的默认乘子。
func computeSeedanceMultipliers(c SeedanceConditions) map[string]float64 {
	out := map[string]float64{}
	if !common.ConditionalRatioEnabled() {
		return out
	}
	name := strings.ToLower(c.Model)

	switch {
	case strings.Contains(name, "seedance-1-5-pro"):
		// 基础 = 有声 720p (16 RMB/M)
		// 优先命中"组合规则"(draft + silent),没启用再降级到单条
		if c.Draft && !c.GenerateAudio {
			if r, ok := common.GetConditionalRatio("seedance-1-5-pro", "draft_silent"); ok {
				out["mode"] = r
				return out
			}
			// 组合未启用:看子条件
		}
		if c.Draft && c.GenerateAudio {
			if r, ok := common.GetConditionalRatio("seedance-1-5-pro", "draft_audio"); ok {
				out["mode"] = r
				return out
			}
		}
		// 单条件
		if !c.GenerateAudio {
			if r, ok := common.GetConditionalRatio("seedance-1-5-pro", "silent"); ok {
				out["audio"] = r
			}
		}

	case strings.Contains(name, "seedance-2-0-fast"):
		// 基础 = 720p 输入不含视频 (37 RMB/M)
		if c.HasVideoInput {
			if r, ok := common.GetConditionalRatio("seedance-2-0-fast", "with_video"); ok {
				out["mode"] = r
			}
		}

	case strings.Contains(name, "seedance-2-0"):
		// 基础 = 720p 输入不含视频 (46 RMB/M)
		key := ""
		switch {
		case c.Resolution == "1080p" && c.HasVideoInput:
			key = "1080p_with_video"
		case c.Resolution == "1080p":
			key = "1080p_no_video"
		case c.HasVideoInput:
			key = "720p_with_video"
		}
		if key != "" {
			if r, ok := common.GetConditionalRatio("seedance-2-0", key); ok {
				out["mode"] = r
			}
		}
	}

	return out
}

// boolValueOr 解析 *dto.BoolValue,nil 时返回默认值。
func boolValueOr(b *dto.BoolValue, def bool) bool {
	if b == nil {
		return def
	}
	return bool(*b)
}

// hasVideoInput 检查 content 数组是否包含 video_url 类型的项。
func hasVideoInput(items []ContentItem) bool {
	for _, it := range items {
		if it.Type == "video_url" {
			return true
		}
	}
	return false
}

// computeSeedanceFromTaskBody 解析上游请求体并返回乘子。
// taskData 为 BuildRequestBody 输出的 JSON,即 requestPayload 的序列化形式。
func computeSeedanceFromTaskBody(originModelName string, taskData []byte) map[string]float64 {
	if !strings.Contains(strings.ToLower(originModelName), "seedance") {
		return nil
	}
	var body requestPayload
	if err := common.Unmarshal(taskData, &body); err != nil {
		return nil
	}
	cond := SeedanceConditions{
		Model: originModelName,
		// 1.5 pro / 2.0 系列默认开启音频;其它型号当 generate_audio 不存在时按 false
		GenerateAudio: boolValueOr(body.GenerateAudio, defaultGenerateAudio(originModelName)),
		Draft:         boolValueOr(body.Draft, false),
		Resolution:    body.Resolution,
		HasVideoInput: hasVideoInput(body.Content),
	}
	return computeSeedanceMultipliers(cond)
}

func defaultGenerateAudio(model string) bool {
	m := strings.ToLower(model)
	return strings.Contains(m, "seedance-1-5-pro") ||
		strings.Contains(m, "seedance-2-0")
}

// settleSeedanceQuota 由 AdjustBillingOnComplete 调用,基于真实 totalTokens
// 重新计算实际应扣 quota,并把 BillingContext 中保存的 OtherRatios 一并应用。
// 返回 0 表示走框架默认 token 重算逻辑(此时不会应用 OtherRatios,仅在
// 模型非 Seedance / ratio 未配置时返回 0)。
func settleSeedanceQuota(task *model.Task, taskInfo *relaycommon.TaskInfo) int {
	if task == nil || taskInfo == nil || taskInfo.TotalTokens <= 0 {
		return 0
	}
	modelName := task.Properties.OriginModelName
	if modelName == "" {
		modelName = task.Properties.UpstreamModelName
	}
	if modelName == "" {
		return 0
	}
	if !strings.Contains(strings.ToLower(modelName), "seedance") {
		return 0
	}

	modelRatio, ok, _ := ratio_setting.GetModelRatio(modelName)
	if !ok || modelRatio <= 0 {
		return 0
	}

	multiplier := 1.0
	if task.PrivateData.BillingContext != nil {
		for _, r := range task.PrivateData.BillingContext.OtherRatios {
			if r > 0 {
				multiplier *= r
			}
		}
	}

	group := task.Group
	if group == "" {
		if u, err := model.GetUserById(task.UserId, false); err == nil {
			group = u.Group
		}
	}
	if group == "" {
		return 0
	}
	finalGroupRatio := ratio_setting.GetGroupRatio(group)
	if userGroupRatio, hasUGR := ratio_setting.GetGroupGroupRatio(group, group); hasUGR {
		finalGroupRatio = userGroupRatio
	}

	q := float64(taskInfo.TotalTokens) * modelRatio * multiplier * finalGroupRatio
	if q < 1 {
		// 防止四舍五入到 0 导致框架误以为没结算
		q = 1
	}
	return int(q)
}
