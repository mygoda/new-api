package setting

import (
	"github.com/QuantumNous/new-api/common"
)

// groupFallbackMap 保存每个分组的兜底渠道：分组名 -> 兜底 channelId。
// 当某个分组下所有渠道都重试失败后，relay 会最后再请求一次该兜底渠道。
// 兜底渠道可以是任意渠道，不要求属于该分组。
var groupFallbackMap = map[string]int{}

// UpdateGroupFallbackByJsonString 从 JSON 字符串加载 GroupFallback 配置。
func UpdateGroupFallbackByJsonString(jsonString string) error {
	groupFallbackMap = make(map[string]int)
	if jsonString == "" {
		return nil
	}
	return common.Unmarshal([]byte(jsonString), &groupFallbackMap)
}

// GroupFallback2JsonString 把 GroupFallback 配置序列化为 JSON 字符串。
func GroupFallback2JsonString() string {
	jsonBytes, err := common.Marshal(groupFallbackMap)
	if err != nil {
		return "{}"
	}
	return string(jsonBytes)
}

// GetGroupFallbackCopy 返回 GroupFallback 配置的副本。
func GetGroupFallbackCopy() map[string]int {
	c := make(map[string]int, len(groupFallbackMap))
	for k, v := range groupFallbackMap {
		c[k] = v
	}
	return c
}

// GetGroupFallbackChannel 返回指定分组的兜底渠道 id，只有 id>0 时才返回 true。
func GetGroupFallbackChannel(group string) (int, bool) {
	id, ok := groupFallbackMap[group]
	if !ok || id <= 0 {
		return 0, false
	}
	return id, true
}
