package ratio_setting

import (
	"testing"
)

func TestSelectTierByPromptTokens(t *testing.T) {
	tiers := []ModelRatioTier{
		{Threshold: 0, ModelRatio: 0.625, CompletionRatio: 8},
		{Threshold: 200000, ModelRatio: 1.25, CompletionRatio: 8},
		{Threshold: 1000000, ModelRatio: 2.5, CompletionRatio: 12},
	}

	cases := []struct {
		name       string
		prompt     int
		wantIdx    int
		wantRatio  float64
		wantCompl  float64
	}{
		{"zero prompt", 0, 0, 0.625, 8},
		{"below first threshold", 1, 0, 0.625, 8},
		{"just below second threshold", 199999, 0, 0.625, 8},
		{"exactly at second threshold", 200000, 1, 1.25, 8},
		{"just over second threshold", 200001, 1, 1.25, 8},
		{"middle tier", 500000, 1, 1.25, 8},
		{"just below third threshold", 999999, 1, 1.25, 8},
		{"exactly at third threshold", 1000000, 2, 2.5, 12},
		{"just over third threshold", 1000001, 2, 2.5, 12},
		{"way past third threshold", 9999999, 2, 2.5, 12},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			idx, tier := SelectTierByPromptTokens(tiers, tc.prompt)
			if idx != tc.wantIdx {
				t.Errorf("idx: want %d, got %d", tc.wantIdx, idx)
			}
			if tier.ModelRatio != tc.wantRatio {
				t.Errorf("modelRatio: want %v, got %v", tc.wantRatio, tier.ModelRatio)
			}
			if tier.CompletionRatio != tc.wantCompl {
				t.Errorf("completionRatio: want %v, got %v", tc.wantCompl, tier.CompletionRatio)
			}
		})
	}

	t.Run("empty tiers", func(t *testing.T) {
		idx, tier := SelectTierByPromptTokens(nil, 100)
		if idx != -1 {
			t.Errorf("expected -1 for empty tiers, got %d", idx)
		}
		if tier.ModelRatio != 0 {
			t.Errorf("expected zero tier, got %+v", tier)
		}
	})
}

func TestValidateModelRatioTieredJSON(t *testing.T) {
	good := `{
		"gemini-2.5-pro": [
			{"threshold": 0, "model_ratio": 0.625, "completion_ratio": 8},
			{"threshold": 200000, "model_ratio": 1.25, "completion_ratio": 8}
		]
	}`
	if err := ValidateModelRatioTieredJSON(good); err != nil {
		t.Fatalf("expected good config to validate, got %v", err)
	}

	emptyOk := ``
	if err := ValidateModelRatioTieredJSON(emptyOk); err != nil {
		t.Fatalf("empty string should be allowed, got %v", err)
	}

	cases := map[string]string{
		"missing first threshold zero": `{"m":[{"threshold":100,"model_ratio":1,"completion_ratio":2}]}`,
		"non-monotonic threshold":      `{"m":[{"threshold":0,"model_ratio":1,"completion_ratio":2},{"threshold":0,"model_ratio":2,"completion_ratio":2}]}`,
		"zero ratio":                   `{"m":[{"threshold":0,"model_ratio":0,"completion_ratio":2}]}`,
		"empty tiers array":            `{"m":[]}`,
		"negative cache_ratio":         `{"m":[{"threshold":0,"model_ratio":1,"completion_ratio":2,"cache_ratio":-0.1}]}`,
		"negative create_cache_ratio":  `{"m":[{"threshold":0,"model_ratio":1,"completion_ratio":2,"create_cache_ratio":-1}]}`,
	}
	for name, bad := range cases {
		t.Run(name, func(t *testing.T) {
			if err := ValidateModelRatioTieredJSON(bad); err == nil {
				t.Errorf("expected validation to fail for %s, got nil", name)
			}
		})
	}
}

func TestUpdateModelRatioTieredByJSONStringSortsByThreshold(t *testing.T) {
	// Provide unsorted; expect ascending after load.
	in := `{"m":[
		{"threshold": 1000000, "model_ratio": 3, "completion_ratio": 4},
		{"threshold": 0,       "model_ratio": 1, "completion_ratio": 2},
		{"threshold": 200000,  "model_ratio": 2, "completion_ratio": 3}
	]}`
	if err := UpdateModelRatioTieredByJSONString(in); err != nil {
		t.Fatalf("update failed: %v", err)
	}
	defer modelRatioTieredMap.Clear()
	tiers, ok := GetModelRatioTiers("m")
	if !ok || len(tiers) != 3 {
		t.Fatalf("expected 3 tiers, got %v", tiers)
	}
	if tiers[0].Threshold != 0 || tiers[1].Threshold != 200000 || tiers[2].Threshold != 1000000 {
		t.Errorf("tiers not sorted: %+v", tiers)
	}
}
