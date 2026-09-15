package service

import (
	"reflect"
	"testing"

	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// setupGroups 用一组已知分组倍率初始化，使 GetUserUsableGroups 返回可预期的可用集。
func setupGroups(t *testing.T) {
	t.Helper()
	// default/vip/svip/test 都是全局可见的真实分组
	if err := ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":1,"svip":1,"test":1}`); err != nil {
		t.Fatalf("init group ratio: %v", err)
	}
}

func TestResolveProviderGroups(t *testing.T) {
	setupGroups(t)

	cases := []struct {
		name           string
		order          []string
		only           []string
		ignore         []string
		avoid          []string
		allowFallbacks bool
		want           []string
		wantErr        bool
	}{
		{name: "order first then fallback rest sorted", order: []string{"vip"}, allowFallbacks: true,
			want: []string{"vip", "default", "svip", "test"}},
		{name: "order only, no fallback", order: []string{"vip", "test"}, allowFallbacks: false,
			want: []string{"vip", "test"}},
		{name: "only whitelist ordered by order", order: []string{"vip"}, only: []string{"vip", "svip"}, allowFallbacks: false,
			want: []string{"vip", "svip"}},
		{name: "only without order, fallback flag irrelevant", only: []string{"svip"}, allowFallbacks: false,
			want: []string{"svip"}},
		{name: "ignore/avoid excluded", allowFallbacks: true, ignore: []string{"vip"}, avoid: []string{"test"},
			want: []string{"default", "svip"}},
		{name: "nonexistent group filtered out", order: []string{"__nope__", "vip"}, allowFallbacks: false,
			want: []string{"vip"}},
		{name: "no order no only no fallback -> empty error", allowFallbacks: false, wantErr: true},
		{name: "only with all excluded -> empty error", only: []string{"vip"}, ignore: []string{"vip"}, allowFallbacks: true, wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ResolveProviderGroups("default", tc.order, tc.only, tc.ignore, tc.avoid, tc.allowFallbacks)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}
