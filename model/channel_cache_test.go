package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
)

// TestGetRandomSatisfiedChannel_ExcludeUsed 验证重试排除已用渠道 + 排除后为空回退。
func TestGetRandomSatisfiedChannel_ExcludeUsed(t *testing.T) {
	// 保存并在结束后恢复全局状态,避免污染其它测试。
	origMem := common.MemoryCacheEnabled
	origG2M := group2model2channels
	origIDM := channelsIDM
	t.Cleanup(func() {
		common.MemoryCacheEnabled = origMem
		group2model2channels = origG2M
		channelsIDM = origIDM
	})

	common.MemoryCacheEnabled = true
	channelsIDM = map[int]*Channel{
		1: {Id: 1},
		2: {Id: 2},
		3: {Id: 3},
	}
	group2model2channels = map[string]map[string][]CachedAbility{
		"g": {
			"m": {
				{ChannelId: 1, Priority: 0, Weight: 10},
				{ChannelId: 2, Priority: 0, Weight: 10},
				{ChannelId: 3, Priority: 0, Weight: 10},
			},
		},
	}

	// 排除 1、2 → 只剩 3,必然返回 3。
	ch, err := GetRandomSatisfiedChannel("g", "m", 0, nil, map[int]struct{}{1: {}, 2: {}})
	if err != nil || ch == nil {
		t.Fatalf("expected channel, got ch=%v err=%v", ch, err)
	}
	if ch.Id != 3 {
		t.Fatalf("expected channel 3 (only untried), got %d", ch.Id)
	}

	// 排除 1 → 剩 2、3,返回值不应是 1。
	for i := 0; i < 20; i++ {
		ch, err = GetRandomSatisfiedChannel("g", "m", 0, nil, map[int]struct{}{1: {}})
		if err != nil || ch == nil {
			t.Fatalf("expected channel, got ch=%v err=%v", ch, err)
		}
		if ch.Id == 1 {
			t.Fatalf("excluded channel 1 should not be selected")
		}
	}

	// 排除全部 → 回退到原候选集,仍应返回非 nil(保留瞬时错误恢复能力)。
	ch, err = GetRandomSatisfiedChannel("g", "m", 0, nil, map[int]struct{}{1: {}, 2: {}, 3: {}})
	if err != nil || ch == nil {
		t.Fatalf("when all excluded, expected fallback non-nil channel, got ch=%v err=%v", ch, err)
	}
	if ch.Id != 1 && ch.Id != 2 && ch.Id != 3 {
		t.Fatalf("fallback returned unexpected channel %d", ch.Id)
	}
}
