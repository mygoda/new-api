package ratio_setting

import "testing"

// TestGetCreateCacheRatio1h 锁定 1h 缓存倍率的"独立覆盖 + 未配回退"契约:
// 未配置 -> ok=false(price.go 回退到 5m × 1.6);配置后 -> 返回该绝对值。
func TestGetCreateCacheRatio1h(t *testing.T) {
	orig := CreateCacheRatio1h2JSONString()
	t.Cleanup(func() { _ = UpdateCreateCacheRatio1hByJSONString(orig) })

	// 清空 -> 未配置
	if err := UpdateCreateCacheRatio1hByJSONString("{}"); err != nil {
		t.Fatal(err)
	}
	if _, ok := GetCreateCacheRatio1h("claude-opus-4-7"); ok {
		t.Fatalf("expected ok=false when 1h ratio unset")
	}

	// 显式配置
	if err := UpdateCreateCacheRatio1hByJSONString(`{"claude-opus-4-7":2.0}`); err != nil {
		t.Fatal(err)
	}
	r, ok := GetCreateCacheRatio1h("claude-opus-4-7")
	if !ok || r != 2.0 {
		t.Fatalf("expected (2.0,true), got (%v,%v)", r, ok)
	}
	// 其它模型仍未配置
	if _, ok := GetCreateCacheRatio1h("gpt-4o"); ok {
		t.Fatalf("unconfigured model should return ok=false")
	}
}
