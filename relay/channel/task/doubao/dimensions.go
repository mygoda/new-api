package doubao

// 文件用途: 给「条件分价 v2」注册 doubao (Seedance) 系列可用的维度。
//
// 维度由 admin 在前端「价格配置」UI 选用,任意 doubao 模型都可启用条件分价。
// 与已删除的 v1 (hardcoded family 注册) 的差异:
//   - v1: family + condition 全部硬编码,admin 只能调倍率
//   - v2: 这里只声明"可观测的维度",规则与价格全部 admin 在 UI 自由配置
//
// 拓展新维度只需在本文件 init() 内 RegisterDimension。
// 拓展到其它 channel (kling/vidu/...) 时在对应 package 写同名 register.go 文件即可。

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

func init() {
	// resolution: 输出视频分辨率 (Seedance / kling-like 模型常用)
	common.RegisterDimension(common.Dimension{
		Key:         "resolution",
		Label:       "输出分辨率",
		Description: "输出视频分辨率: 480p / 720p / 1080p。Seedance 2.0 按分辨率分价。",
		Type:        common.DimensionTypeString,
		Options:     []string{"480p", "720p", "1080p"},
		Modality:    []string{"video"},
	}, extractResolution)

	// has_video_input: 输入中是否包含 video_url 类型(Seedance 2.0 参考视频)
	common.RegisterDimension(common.Dimension{
		Key:         "has_video_input",
		Label:       "输入包含视频",
		Description: "请求 content 数组中是否含 type=video_url 项。Seedance 2.0 含视频输入降价。",
		Type:        common.DimensionTypeBool,
		Modality:    []string{"video"},
	}, extractHasVideoInput)

	// has_audio_input: 输入中是否包含 audio_url
	common.RegisterDimension(common.Dimension{
		Key:         "has_audio_input",
		Label:       "输入包含音频",
		Description: "请求 content 数组中是否含 type=audio_url 项。",
		Type:        common.DimensionTypeBool,
		Modality:    []string{"video"},
	}, extractHasAudioInput)

	// generate_audio: 是否生成同步音频(Seedance 1.5 pro / 2.0 系列独有,影响"有声/无声"分价)
	common.RegisterDimension(common.Dimension{
		Key:         "generate_audio",
		Label:       "生成原生音频",
		Description: "请求 generate_audio=true 时生成有声视频。Seedance 1.5 pro 有声/无声两档分价。",
		Type:        common.DimensionTypeBool,
		Modality:    []string{"video"},
	}, extractGenerateAudio)

	// draft: 是否启用样片模式(Seedance 1.5 pro 独有,折算系数 0.6/0.35)
	common.RegisterDimension(common.Dimension{
		Key:         "draft",
		Label:       "样片模式",
		Description: "draft=true 时生成低画质 Draft 视频用于快速验证,价格更低(Seedance 1.5 pro)。",
		Type:        common.DimensionTypeBool,
		Modality:    []string{"video"},
	}, extractDraft)

	// watermark: 是否带水印
	common.RegisterDimension(common.Dimension{
		Key:         "watermark",
		Label:       "添加水印",
		Description: "请求 watermark=true 时输出视频含 AI 生成水印。",
		Type:        common.DimensionTypeBool,
		Modality:    []string{"video"},
	}, extractWatermark)

	// aspect_ratio: 宽高比
	common.RegisterDimension(common.Dimension{
		Key:         "aspect_ratio",
		Label:       "输出宽高比",
		Description: "ratio 字段。常用 16:9 / 9:16 / 1:1 / adaptive。",
		Type:        common.DimensionTypeString,
		Options:     []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"},
		Modality:    []string{"video"},
	}, extractAspectRatio)
}

// extractResolution 读 body.resolution (顶层字符串)。
func extractResolution(_ string, body []byte) (any, bool) {
	if len(body) == 0 {
		return nil, false
	}
	type p struct {
		Resolution string `json:"resolution"`
	}
	var b p
	if err := common.Unmarshal(body, &b); err != nil {
		return nil, false
	}
	r := strings.TrimSpace(strings.ToLower(b.Resolution))
	if r == "" {
		return nil, false
	}
	return r, true
}

// extractHasVideoInput 检查 content 数组是否有 type=video_url 项。
func extractHasVideoInput(_ string, body []byte) (any, bool) {
	return hasContentTypeFlag(body, "video_url")
}

// extractHasAudioInput 检查 content 数组是否有 type=audio_url 项。
func extractHasAudioInput(_ string, body []byte) (any, bool) {
	return hasContentTypeFlag(body, "audio_url")
}

func hasContentTypeFlag(body []byte, wantType string) (any, bool) {
	if len(body) == 0 {
		return false, true
	}
	type item struct {
		Type string `json:"type"`
	}
	type p struct {
		Content []item `json:"content"`
	}
	var b p
	if err := common.Unmarshal(body, &b); err != nil {
		return false, true
	}
	for _, it := range b.Content {
		if it.Type == wantType {
			return true, true
		}
	}
	return false, true
}

// extractGenerateAudio 读 body.generate_audio,缺省值由 admin 配规则时把 missing 当 false。
// 注意: PDF 默认 Seedance 1.5 pro / 2.0 系列 generate_audio=true,但用户不传时也是默认 true,
// 这里直接读字段值,缺省返回 ok=false 让 admin 在规则里显式选 true/false 来匹配。
func extractGenerateAudio(_ string, body []byte) (any, bool) {
	return extractBoolField(body, "generate_audio")
}

func extractDraft(_ string, body []byte) (any, bool) {
	return extractBoolField(body, "draft")
}

func extractWatermark(_ string, body []byte) (any, bool) {
	return extractBoolField(body, "watermark")
}

func extractBoolField(body []byte, field string) (any, bool) {
	if len(body) == 0 {
		return nil, false
	}
	m := map[string]any{}
	if err := common.Unmarshal(body, &m); err != nil {
		return nil, false
	}
	v, exists := m[field]
	if !exists {
		return nil, false
	}
	if b, ok := v.(bool); ok {
		return b, true
	}
	return nil, false
}

func extractAspectRatio(_ string, body []byte) (any, bool) {
	if len(body) == 0 {
		return nil, false
	}
	type p struct {
		Ratio string `json:"ratio"`
	}
	var b p
	if err := common.Unmarshal(body, &b); err != nil {
		return nil, false
	}
	r := strings.TrimSpace(b.Ratio)
	if r == "" {
		return nil, false
	}
	return r, true
}
