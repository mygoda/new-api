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
}
