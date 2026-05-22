package doubao

import (
	"encoding/json"
	"strings"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

func TestConvertToRequestPayload_Seedance2(t *testing.T) {
	a := &TaskAdaptor{}

	t.Run("文生视频 — 旧路径零变化", func(t *testing.T) {
		req := &relaycommon.TaskSubmitReq{
			Model:  "doubao-seedance-2-0-260128",
			Prompt: "小猫打哈欠",
		}
		body, err := a.convertToRequestPayload(req)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := json.Marshal(body)
		s := string(raw)
		if !strings.Contains(s, `"type":"text"`) || !strings.Contains(s, `"text":"小猫打哈欠"`) {
			t.Fatalf("missing text content: %s", s)
		}
		if strings.Contains(s, "image_url") || strings.Contains(s, "video_url") || strings.Contains(s, "audio_url") {
			t.Fatalf("unexpected media field: %s", s)
		}
	})

	t.Run("首尾帧 — image_roles 落地", func(t *testing.T) {
		req := &relaycommon.TaskSubmitReq{
			Model:      "doubao-seedance-2-0-260128",
			Prompt:     "猫跳起",
			Images:     []string{"https://a.png", "https://b.png"},
			ImageRoles: []string{"first_frame", "last_frame"},
		}
		body, _ := a.convertToRequestPayload(req)
		raw, _ := json.Marshal(body)
		s := string(raw)
		if !strings.Contains(s, `"role":"first_frame"`) || !strings.Contains(s, `"role":"last_frame"`) {
			t.Fatalf("role not propagated: %s", s)
		}
	})

	t.Run("参考视频 — video_url + reference_video", func(t *testing.T) {
		req := &relaycommon.TaskSubmitReq{
			Model:  "doubao-seedance-2-0-260128",
			Prompt: "延长这段",
			Videos: []string{"https://a.mp4"},
		}
		body, _ := a.convertToRequestPayload(req)
		raw, _ := json.Marshal(body)
		s := string(raw)
		if !strings.Contains(s, `"type":"video_url"`) {
			t.Fatalf("video_url type missing: %s", s)
		}
		if !strings.Contains(s, `"role":"reference_video"`) {
			t.Fatalf("reference_video role missing: %s", s)
		}
	})

	t.Run("参考音频 — audio_url + reference_audio", func(t *testing.T) {
		req := &relaycommon.TaskSubmitReq{
			Model:  "doubao-seedance-2-0-260128",
			Prompt: "x",
			Images: []string{"https://a.png"},
			Audios: []string{"https://a.wav"},
		}
		body, _ := a.convertToRequestPayload(req)
		raw, _ := json.Marshal(body)
		s := string(raw)
		if !strings.Contains(s, `"type":"audio_url"`) || !strings.Contains(s, `"role":"reference_audio"`) {
			t.Fatalf("audio not propagated: %s", s)
		}
	})

	t.Run("metadata 透传 tools / safety_identifier", func(t *testing.T) {
		req := &relaycommon.TaskSubmitReq{
			Model:  "doubao-seedance-2-0-260128",
			Prompt: "x",
			Metadata: map[string]interface{}{
				"tools":             []map[string]string{{"type": "web_search"}},
				"safety_identifier": "user-abc",
			},
		}
		body, _ := a.convertToRequestPayload(req)
		raw, _ := json.Marshal(body)
		s := string(raw)
		if !strings.Contains(s, `"tools":[{"type":"web_search"}]`) {
			t.Fatalf("tools missing: %s", s)
		}
		if !strings.Contains(s, `"safety_identifier":"user-abc"`) {
			t.Fatalf("safety_identifier missing: %s", s)
		}
	})

	t.Run("metadata 覆盖顶层 content (老契约)", func(t *testing.T) {
		req := &relaycommon.TaskSubmitReq{
			Model:  "doubao-seedance-2-0-260128",
			Prompt: "ignored",
			Metadata: map[string]interface{}{
				"content": []map[string]interface{}{
					{"type": "text", "text": "from-meta"},
				},
			},
		}
		body, _ := a.convertToRequestPayload(req)
		if len(body.Content) != 1 || body.Content[0].Text != "from-meta" {
			t.Fatalf("metadata content override not respected: %+v", body.Content)
		}
	})

	t.Run("v3 原生透传 — 模拟 DoubaoV3RequestConvert 中间件包裹后的形态", func(t *testing.T) {
		// 中间件会把客户端发到 /api/v3/contents/generations/tasks 的 v3 原生 body
		// 包成 {model, prompt:"", metadata: <原始 body>}，因此适配器看到的 req 是这样的：
		req := &relaycommon.TaskSubmitReq{
			Model:  "doubao-seedance-2-0-260128",
			Prompt: "",
			Metadata: map[string]interface{}{
				"model": "doubao-seedance-2-0-260128",
				"content": []map[string]interface{}{
					{"type": "text", "text": "v3 native body"},
					{
						"type":      "image_url",
						"image_url": map[string]string{"url": "asset://abc"},
						"role":      "reference_image",
					},
				},
				"ratio":          "16:9",
				"duration":       5,
				"camera_fixed":   true,
				"watermark":      false,
				"generate_audio": true,
				"seed":           42,
			},
		}
		body, err := a.convertToRequestPayload(req)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := json.Marshal(body)
		s := string(raw)
		// content 数组应该来自 metadata,而不是从 prompt 自动装配
		if !strings.Contains(s, `"text":"v3 native body"`) {
			t.Fatalf("v3 content not passthrough: %s", s)
		}
		if !strings.Contains(s, `"role":"reference_image"`) {
			t.Fatalf("v3 role not passthrough: %s", s)
		}
		// 顶层标量字段也应当从 metadata 一并落地
		if !strings.Contains(s, `"ratio":"16:9"`) || !strings.Contains(s, `"duration":5`) {
			t.Fatalf("v3 scalar fields not passthrough: %s", s)
		}
		if !strings.Contains(s, `"camera_fixed":true`) || !strings.Contains(s, `"generate_audio":true`) {
			t.Fatalf("v3 bool fields not passthrough: %s", s)
		}
		// 不应该有 prompt 触发的空 text 项
		if strings.Contains(s, `"text":""`) {
			t.Fatalf("empty prompt should NOT inject a text content item: %s", s)
		}
	})
}
