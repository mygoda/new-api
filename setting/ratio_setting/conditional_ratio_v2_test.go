package ratio_setting

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func approxEq(a, b float64) bool {
	if a == b {
		return true
	}
	diff := math.Abs(a - b)
	return diff < 1e-9 || diff/math.Abs(b) < 1e-9
}

// 注册若干测试用维度,跑完后保留(进程内注册表会被其它测试 / 真实业务覆盖)。
func registerTestDimensions(t *testing.T) {
	t.Helper()
	common.RegisterDimension(common.Dimension{
		Key: "resolution", Label: "分辨率", Type: common.DimensionTypeString,
	}, func(_ string, body []byte) (any, bool) {
		var b struct {
			Resolution string `json:"resolution"`
		}
		_ = common.Unmarshal(body, &b)
		if b.Resolution == "" {
			return nil, false
		}
		return b.Resolution, true
	})
	common.RegisterDimension(common.Dimension{
		Key: "has_video_input", Label: "含视频", Type: common.DimensionTypeBool,
	}, func(_ string, body []byte) (any, bool) {
		var b struct {
			Content []struct {
				Type string `json:"type"`
			} `json:"content"`
		}
		_ = common.Unmarshal(body, &b)
		for _, it := range b.Content {
			if it.Type == "video_url" {
				return true, true
			}
		}
		return false, true
	})
}

// 设置一个 ModelRatio 用于换算锚点。返回 cleanup。
func setBaseRatio(t *testing.T, model string, ratio float64) func() {
	t.Helper()
	prev, hadPrev, _ := GetModelRatio(model)
	modelRatioMap.Set(model, ratio)
	return func() {
		if hadPrev {
			modelRatioMap.Set(model, prev)
		}
		// Note: 没有 Delete API,测试用模型名以 "test-model-" 前缀避免污染
	}
}

func TestRMBPriceToRatio(t *testing.T) {
	// 1 ratio = $2 / M = USD2RMB * 2 RMB / M
	// 当 USD2RMB=7.3, 1 ratio = 14.6 RMB/M
	// 46 RMB/M -> 46/14.6 = 3.1507...
	got := RMBPriceToRatio(46)
	want := 46.0 / (USD2RMB * 2)
	if got != want {
		t.Fatalf("RMBPriceToRatio(46): got %v, want %v", got, want)
	}
}

func TestApplyConditionalRatiosV2_Disabled(t *testing.T) {
	registerTestDimensions(t)
	cleanup := setBaseRatio(t, "test-model-A", 3.0)
	defer cleanup()

	// 禁用 -> 返回 nil
	cfgJSON := `{"enabled":false,"models":[{"model_pattern":"test-model-A","rules":[{"conditions":{"resolution":"1080p"},"price_rmb_per_million":50}]}]}`
	if err := UpdateConditionalRatiosV2ByJSONString(cfgJSON); err != nil {
		t.Fatal(err)
	}
	got := ApplyConditionalRatiosV2("test-model-A", []byte(`{"resolution":"1080p"}`))
	if got != nil {
		t.Fatalf("disabled config should return nil, got %v", got)
	}
}

func TestApplyConditionalRatiosV2_ExactMatch(t *testing.T) {
	registerTestDimensions(t)
	cleanup := setBaseRatio(t, "test-model-B", 3.0)
	defer cleanup()

	// 启用 + 单维度匹配
	cfgJSON := `{
        "enabled": true,
        "models": [{
            "model_pattern": "test-model-B",
            "rules": [
                {"conditions": {"resolution":"720p"}, "price_rmb_per_million": 30},
                {"conditions": {"resolution":"1080p"}, "price_rmb_per_million": 60}
            ]
        }]
    }`
	if err := UpdateConditionalRatiosV2ByJSONString(cfgJSON); err != nil {
		t.Fatal(err)
	}
	out := ApplyConditionalRatiosV2("test-model-B", []byte(`{"resolution":"1080p"}`))
	if out == nil {
		t.Fatal("expected non-nil multiplier")
	}
	// target ratio = 60 / (7.3*2) = 4.1095..., base = 3.0 -> mul ≈ 1.3698
	want := (60.0 / (USD2RMB * 2)) / 3.0
	if !approxEq(out["conditional_v2"], want) {
		t.Fatalf("got multiplier %v, want %v", out["conditional_v2"], want)
	}
}

func TestApplyConditionalRatiosV2_MultiCondAndPriority(t *testing.T) {
	registerTestDimensions(t)
	cleanup := setBaseRatio(t, "test-model-C", 3.0)
	defer cleanup()

	// 二维: resolution + has_video_input
	cfgJSON := `{
        "enabled": true,
        "models": [{
            "model_pattern": "test-model-C",
            "rules": [
                {"conditions": {"resolution":"720p"}, "price_rmb_per_million": 46},
                {"conditions": {"resolution":"720p","has_video_input":true}, "price_rmb_per_million": 28},
                {"conditions": {"resolution":"1080p"}, "price_rmb_per_million": 51},
                {"conditions": {"resolution":"1080p","has_video_input":true}, "price_rmb_per_million": 31}
            ]
        }]
    }`
	if err := UpdateConditionalRatiosV2ByJSONString(cfgJSON); err != nil {
		t.Fatal(err)
	}

	// 720p + 含视频 -> 应命中 28 那条(条件最具体)
	body := []byte(`{"resolution":"720p","content":[{"type":"text"},{"type":"video_url"}]}`)
	out := ApplyConditionalRatiosV2("test-model-C", body)
	if out == nil {
		t.Fatal("expected multiplier")
	}
	want := (28.0 / (USD2RMB * 2)) / 3.0
	if !approxEq(out["conditional_v2"], want) {
		t.Fatalf("720p+video got %v, want %v", out["conditional_v2"], want)
	}

	// 1080p 无视频 -> 应命中 51
	body = []byte(`{"resolution":"1080p","content":[{"type":"text"}]}`)
	out = ApplyConditionalRatiosV2("test-model-C", body)
	want = (51.0 / (USD2RMB * 2)) / 3.0
	if !approxEq(out["conditional_v2"], want) {
		t.Fatalf("1080p got %v, want %v", out["conditional_v2"], want)
	}
}

func TestApplyConditionalRatiosV2_PrefixWildcard(t *testing.T) {
	registerTestDimensions(t)
	cleanup := setBaseRatio(t, "doubao-seedance-2-0-foo", 3.0)
	defer cleanup()

	cfgJSON := `{
        "enabled": true,
        "models": [{
            "model_pattern": "doubao-seedance-2-0-*",
            "rules": [
                {"conditions": {"resolution":"720p"}, "price_rmb_per_million": 46}
            ]
        }]
    }`
	if err := UpdateConditionalRatiosV2ByJSONString(cfgJSON); err != nil {
		t.Fatal(err)
	}
	out := ApplyConditionalRatiosV2("doubao-seedance-2-0-foo", []byte(`{"resolution":"720p"}`))
	if out == nil {
		t.Fatal("prefix wildcard should match")
	}
}

func TestApplyConditionalRatiosV2_NoMatchReturnsNil(t *testing.T) {
	registerTestDimensions(t)
	cleanup := setBaseRatio(t, "test-model-D", 3.0)
	defer cleanup()

	cfgJSON := `{
        "enabled": true,
        "models": [{
            "model_pattern": "test-model-D",
            "rules": [
                {"conditions": {"resolution":"1080p"}, "price_rmb_per_million": 50}
            ]
        }]
    }`
	if err := UpdateConditionalRatiosV2ByJSONString(cfgJSON); err != nil {
		t.Fatal(err)
	}
	// resolution=480p 不匹配任何规则
	out := ApplyConditionalRatiosV2("test-model-D", []byte(`{"resolution":"480p"}`))
	if out != nil {
		t.Fatalf("no rule should match, got %v", out)
	}
}

func TestApplyConditionalRatiosV2_FallbackRule(t *testing.T) {
	registerTestDimensions(t)
	cleanup := setBaseRatio(t, "test-model-E", 3.0)
	defer cleanup()

	// 空条件的兜底规则
	cfgJSON := `{
        "enabled": true,
        "models": [{
            "model_pattern": "test-model-E",
            "rules": [
                {"conditions": {"resolution":"1080p"}, "price_rmb_per_million": 50},
                {"conditions": {}, "price_rmb_per_million": 20}
            ]
        }]
    }`
	if err := UpdateConditionalRatiosV2ByJSONString(cfgJSON); err != nil {
		t.Fatal(err)
	}
	// 命中具体规则
	out := ApplyConditionalRatiosV2("test-model-E", []byte(`{"resolution":"1080p"}`))
	if out == nil || !approxEq(out["conditional_v2"], (50.0/(USD2RMB*2))/3.0) {
		t.Fatalf("expected specific rule price 50, got %v", out)
	}
	// 不命中具体规则 -> 走兜底
	out = ApplyConditionalRatiosV2("test-model-E", []byte(`{"resolution":"480p"}`))
	if out == nil || !approxEq(out["conditional_v2"], (20.0/(USD2RMB*2))/3.0) {
		t.Fatalf("expected fallback rule price 20, got %v", out)
	}
}
