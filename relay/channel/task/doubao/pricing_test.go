package doubao

import (
	"testing"
)

// 验证 Seedance 各模型 + 各条件组合的乘子计算与官方 PDF 价格自洽。
func TestSeedanceMultipliers(t *testing.T) {
	cases := []struct {
		name string
		c    SeedanceConditions
		want map[string]float64 // nil 等价于空 map
	}{
		// ─── Seedance 1.5 pro ──────────────────────────────────────────
		{
			name: "1.5 pro 默认 有声 720p",
			c:    SeedanceConditions{Model: "doubao-seedance-1-5-pro-251215", GenerateAudio: true, Resolution: "720p"},
			want: map[string]float64{},
		},
		{
			name: "1.5 pro 无声",
			c:    SeedanceConditions{Model: "doubao-seedance-1-5-pro-251215", GenerateAudio: false},
			want: map[string]float64{"audio": 0.5},
		},
		{
			name: "1.5 pro 有声 + draft",
			c:    SeedanceConditions{Model: "doubao-seedance-1-5-pro-251215", GenerateAudio: true, Draft: true},
			want: map[string]float64{"mode": 0.6},
		},
		{
			name: "1.5 pro 无声 + draft",
			c:    SeedanceConditions{Model: "doubao-seedance-1-5-pro-251215", GenerateAudio: false, Draft: true},
			want: map[string]float64{"mode": 0.35},
		},

		// ─── Seedance 2.0 ──────────────────────────────────────────────
		{
			name: "2.0 默认 720p 输入不含视频",
			c:    SeedanceConditions{Model: "doubao-seedance-2-0-260128", Resolution: "720p"},
			want: map[string]float64{},
		},
		{
			name: "2.0 1080p 输入不含视频",
			c:    SeedanceConditions{Model: "doubao-seedance-2-0-260128", Resolution: "1080p"},
			want: map[string]float64{"mode": 1.109},
		},
		{
			name: "2.0 720p 输入含视频",
			c:    SeedanceConditions{Model: "doubao-seedance-2-0-260128", Resolution: "720p", HasVideoInput: true},
			want: map[string]float64{"mode": 0.609},
		},
		{
			name: "2.0 1080p 输入含视频",
			c:    SeedanceConditions{Model: "doubao-seedance-2-0-260128", Resolution: "1080p", HasVideoInput: true},
			want: map[string]float64{"mode": 0.674},
		},

		// ─── Seedance 2.0 fast ─────────────────────────────────────────
		{
			name: "2.0 fast 默认 720p 输入不含视频",
			c:    SeedanceConditions{Model: "doubao-seedance-2-0-fast-260128", Resolution: "720p"},
			want: map[string]float64{},
		},
		{
			name: "2.0 fast 输入含视频",
			c:    SeedanceConditions{Model: "doubao-seedance-2-0-fast-260128", HasVideoInput: true},
			want: map[string]float64{"mode": 0.595},
		},

		// ─── 非 Seedance 模型 ──────────────────────────────────────────
		{
			name: "1.0 pro 不应用条件分价",
			c:    SeedanceConditions{Model: "doubao-seedance-1-0-pro-250528", Resolution: "1080p", HasVideoInput: true, GenerateAudio: false},
			want: map[string]float64{},
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			got := computeSeedanceMultipliers(tt.c)
			if len(got) != len(tt.want) {
				t.Fatalf("len mismatch: got %d (%v), want %d (%v)", len(got), got, len(tt.want), tt.want)
			}
			for k, v := range tt.want {
				gv, ok := got[k]
				if !ok {
					t.Fatalf("missing key %q in result %v", k, got)
				}
				if absDelta(gv, v) > 1e-6 {
					t.Fatalf("key %q: got %f, want %f", k, gv, v)
				}
			}
		})
	}
}

func absDelta(a, b float64) float64 {
	if a > b {
		return a - b
	}
	return b - a
}
