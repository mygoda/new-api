package doubao

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// 文件用途:把 Seedance 的 3 个模型族 + 7 个条件分价规则注册到通用
// ConditionalRatio 框架。这是"如何接入条件分价"的范式参考——新加一个模型
// (例如 Kling、Vidu),在自己的 channel 包里照葫芦画瓢即可,无需改前端。
//
// 接入步骤:
//  1. 写一个 register.go,在 init() 调 common.RegisterConditionalRatioFamily,
//     声明 family key / 显示文案 / 条件列表 / 默认乘子。
//  2. Adaptor 实现 AdjustBillingOnSubmit:从 task body 解析条件参数后调
//     common.GetConditionalRatio(familyKey, condKey),把命中的乘子塞到返回 map。
//  3. (可选)Adaptor 实现 AdjustBillingOnComplete,如需要在终态用真实 token 重算。

func init() {
	common.RegisterConditionalRatioFamily(common.ConditionalRatioFamily{
		Key:      "seedance-1-5-pro",
		Label:    "Seedance 1.5 pro",
		BaseHint: "基准:有声 720p (16 元/M token)",
		MatchModel: func(name string) bool {
			return strings.Contains(strings.ToLower(name), "seedance-1-5-pro")
		},
		Conditions: []common.ConditionalRatioCondition{
			{
				Key:        "silent",
				Label:      "无声",
				Match:      "generate_audio = false",
				Hint:       "官方:8 元/M(基准 16 → 50%)",
				DefaultMul: 0.5,
			},
			{
				Key:        "draft_audio",
				Label:      "Draft 有声",
				Match:      "draft = true 且 generate_audio = true",
				Hint:       "官方折算系数 0.6",
				DefaultMul: 0.6,
			},
			{
				Key:        "draft_silent",
				Label:      "Draft 无声",
				Match:      "draft = true 且 generate_audio = false",
				Hint:       "官方:无声 0.5 × Draft 0.7",
				DefaultMul: 0.35,
			},
		},
	})

	common.RegisterConditionalRatioFamily(common.ConditionalRatioFamily{
		Key:      "seedance-2-0",
		Label:    "Seedance 2.0",
		BaseHint: "基准:720p 输入不含视频 (46 元/M token)",
		MatchModel: func(name string) bool {
			n := strings.ToLower(name)
			return strings.Contains(n, "seedance-2-0") && !strings.Contains(n, "seedance-2-0-fast")
		},
		Conditions: []common.ConditionalRatioCondition{
			{
				Key:        "1080p_no_video",
				Label:      "1080p (输入不含视频)",
				Match:      "resolution = 1080p 且 输入不含视频",
				Hint:       "官方:51 元/M(46 → 51,1.109×)",
				DefaultMul: 1.109,
			},
			{
				Key:        "720p_with_video",
				Label:      "输入含视频 (480p/720p)",
				Match:      "输入含视频 且 resolution ≠ 1080p",
				Hint:       "官方:28 元/M(46 → 28,0.609×)",
				DefaultMul: 0.609,
			},
			{
				Key:        "1080p_with_video",
				Label:      "输入含视频 (1080p)",
				Match:      "resolution = 1080p 且 输入含视频",
				Hint:       "官方:31 元/M(46 → 31,0.674×)",
				DefaultMul: 0.674,
			},
		},
	})

	common.RegisterConditionalRatioFamily(common.ConditionalRatioFamily{
		Key:      "seedance-2-0-fast",
		Label:    "Seedance 2.0 fast",
		BaseHint: "基准:720p 输入不含视频 (37 元/M token)",
		MatchModel: func(name string) bool {
			return strings.Contains(strings.ToLower(name), "seedance-2-0-fast")
		},
		Conditions: []common.ConditionalRatioCondition{
			{
				Key:        "with_video",
				Label:      "输入含视频",
				Match:      "输入含视频 (2.0 fast 不支持 1080p)",
				Hint:       "官方:22 元/M(37 → 22,0.595×)",
				DefaultMul: 0.595,
			},
		},
	})
}
