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
func computeSeedanceMultipliers(c SeedanceConditions) map[string]float64 {
	out := map[string]float64{}
	name := strings.ToLower(c.Model)

	switch {
	case strings.Contains(name, "seedance-1-5-pro"):
		// 基础 = 有声 720p (16 RMB/M)
		if !c.GenerateAudio {
			out["audio"] = 8.0 / 16.0 // 0.5
		}
		if c.Draft {
			// Draft 折算系数:有声 0.6, 无声 0.7
			if c.GenerateAudio {
				out["draft"] = 0.6
			} else {
				out["draft"] = 0.7
			}
		}

	case strings.Contains(name, "seedance-2-0-fast"):
		// 基础 = 720p 输入不含视频 (37 RMB/M)
		if c.HasVideoInput {
			out["mode"] = 22.0 / 37.0 // 0.595
		}
		// 1080p 不支持,这里不设乘子(若用户传了 1080p,后端会上游报错)

	case strings.Contains(name, "seedance-2-0"):
		// 基础 = 720p 输入不含视频 (46 RMB/M)
		switch {
		case c.Resolution == "1080p" && c.HasVideoInput:
			out["mode"] = 31.0 / 46.0 // 0.674
		case c.Resolution == "1080p":
			out["mode"] = 51.0 / 46.0 // 1.109
		case c.HasVideoInput:
			out["mode"] = 28.0 / 46.0 // 0.609
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
