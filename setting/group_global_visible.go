package setting

import (
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// groupGlobalVisibleMap 记录每个分组是否对所有普通用户全局可见：
//
//	true  → 该分组对所有普通用户可见（即出现在 /api/user/groups、/api/pricing 等接口）。
//	false → 该分组仅对管理员、以及在 users.extra_groups 中显式分配了该分组的用户可见。
//
// 关键兼容点：当 map 中不存在某个分组名时，IsGroupGlobalVisible 默认返回 true。
// 这使得历史数据（升级前已创建、未在此 map 留下记录的分组）保持原有"全部全局可见"的行为，
// 无需任何一次性数据迁移代码即可平滑升级。
var groupGlobalVisibleMap = map[string]bool{}
var groupGlobalVisibleMutex sync.RWMutex

// IsGroupGlobalVisible 判断指定分组是否全局可见。
// 当 map 中不存在该分组时，回退默认值 true（保持升级前行为）。
func IsGroupGlobalVisible(groupName string) bool {
	groupGlobalVisibleMutex.RLock()
	defer groupGlobalVisibleMutex.RUnlock()
	if v, ok := groupGlobalVisibleMap[groupName]; ok {
		return v
	}
	return true
}

// SetGroupGlobalVisible 仅在内存中设置某分组的全局可见性。
// 持久化由调用方通过 UpdateOption("GroupGlobalVisible", ...) 完成。
func SetGroupGlobalVisible(groupName string, visible bool) {
	groupGlobalVisibleMutex.Lock()
	defer groupGlobalVisibleMutex.Unlock()
	groupGlobalVisibleMap[groupName] = visible
}

// DeleteGroupGlobalVisible 从 map 中移除某分组的记录（用于删除分组时清理）。
func DeleteGroupGlobalVisible(groupName string) {
	groupGlobalVisibleMutex.Lock()
	defer groupGlobalVisibleMutex.Unlock()
	delete(groupGlobalVisibleMap, groupName)
}

// GetGroupGlobalVisibleCopy 返回 map 的一份拷贝，调用方可安全地修改后整体写回。
func GetGroupGlobalVisibleCopy() map[string]bool {
	groupGlobalVisibleMutex.RLock()
	defer groupGlobalVisibleMutex.RUnlock()
	c := make(map[string]bool, len(groupGlobalVisibleMap))
	for k, v := range groupGlobalVisibleMap {
		c[k] = v
	}
	return c
}

// UpdateGroupGlobalVisibleByJsonString 从 JSON 字符串重新加载内存 map。
// 由 model.UpdateOption("GroupGlobalVisible", ...) 在持久化后调用以保持内存同步。
func UpdateGroupGlobalVisibleByJsonString(jsonString string) error {
	groupGlobalVisibleMutex.Lock()
	defer groupGlobalVisibleMutex.Unlock()
	groupGlobalVisibleMap = make(map[string]bool)
	if jsonString == "" {
		return nil
	}
	return common.Unmarshal([]byte(jsonString), &groupGlobalVisibleMap)
}

// GroupGlobalVisible2JsonString 把当前 map 序列化为 JSON 字符串（用于持久化）。
func GroupGlobalVisible2JsonString() string {
	groupGlobalVisibleMutex.RLock()
	defer groupGlobalVisibleMutex.RUnlock()
	jsonBytes, err := common.Marshal(groupGlobalVisibleMap)
	if err != nil {
		common.SysLog("error marshalling group global visible map: " + err.Error())
		return "{}"
	}
	return string(jsonBytes)
}
