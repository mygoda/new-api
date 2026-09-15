package service

import (
	"errors"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

func GetUserUsableGroups(userGroup string) map[string]string {
	// 基底:GroupRatio 中存在的所有真实分组中,GroupGlobalVisible 标记为 true 的子集。
	// GroupGlobalVisible 缺省视为 true(setting/group_global_visible.go),从而保证升级前的老分组
	// 默认仍然全局可见,无需任何一次性数据迁移代码。描述继续从 UserUsableGroups 取,缺省回退到分组名。
	ratioMap := ratio_setting.GetGroupRatioCopy()
	descMap := setting.GetUserUsableGroupsCopy()
	groupsCopy := make(map[string]string, len(ratioMap))
	for name := range ratioMap {
		if !setting.IsGroupGlobalVisible(name) {
			continue
		}
		desc, ok := descMap[name]
		if !ok || desc == "" {
			desc = name
		}
		groupsCopy[name] = desc
	}

	if userGroup != "" {
		specialSettings, b := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get(userGroup)
		if b {
			// 处理特殊可用分组
			for specialGroup, desc := range specialSettings {
				if strings.HasPrefix(specialGroup, "-:") {
					// 移除分组
					groupToRemove := strings.TrimPrefix(specialGroup, "-:")
					delete(groupsCopy, groupToRemove)
				} else if strings.HasPrefix(specialGroup, "+:") {
					// 添加分组
					groupToAdd := strings.TrimPrefix(specialGroup, "+:")
					groupsCopy[groupToAdd] = desc
				} else {
					// 直接添加分组
					groupsCopy[specialGroup] = desc
				}
			}
		}
		// 如果userGroup不在UserUsableGroups中，返回UserUsableGroups + userGroup
		if _, ok := groupsCopy[userGroup]; !ok {
			groupsCopy[userGroup] = "用户分组"
		}
	}
	return groupsCopy
}

func GroupInUserUsableGroups(userGroup, groupName string) bool {
	_, ok := GetUserUsableGroups(userGroup)[groupName]
	return ok
}

// GetUserUsableGroupsWithExtra 在 GetUserUsableGroups 之上叠加用户级 extra groups。
// extraGroupsRaw 是 users.extra_groups 字段(JSON 数组字符串如 ["vip","svip"]),
// 解析失败或为空时退化为 GetUserUsableGroups 的结果。
// 只接受真实存在(GroupRatio 中已定义)的分组,避免脏数据进入可用列表。
func GetUserUsableGroupsWithExtra(userGroup string, extraGroupsRaw string) map[string]string {
	groups := GetUserUsableGroups(userGroup)
	for _, name := range parseExtraGroupsJSON(extraGroupsRaw) {
		if !ratio_setting.ContainsGroupRatio(name) {
			continue
		}
		if _, exists := groups[name]; exists {
			continue
		}
		groups[name] = setting.GetUsableGroupDescription(name)
	}
	return groups
}

// parseExtraGroupsJSON 解析 users.extra_groups JSON 数组字符串,
// 兼容空串/无效 JSON,返回去重去空的分组名列表。
func parseExtraGroupsJSON(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var list []string
	if err := common.UnmarshalJsonStr(raw, &list); err != nil {
		return nil
	}
	seen := make(map[string]struct{}, len(list))
	out := make([]string, 0, len(list))
	for _, g := range list {
		g = strings.TrimSpace(g)
		if g == "" {
			continue
		}
		if _, ok := seen[g]; ok {
			continue
		}
		seen[g] = struct{}{}
		out = append(out, g)
	}
	return out
}

// ResolveProviderGroups 把 OpenRouter 风格 provider 对象的路由字段解析成一个有序、去重、
// 且都在用户可用分组集合内的候选分组列表，供跨组选择引擎逐个尝试。语义见 provider 文档。
// 返回空列表时返回 error（调用方转 400）。
func ResolveProviderGroups(userGroup string, order, only, ignore, avoid []string, allowFallbacks bool) ([]string, error) {
	usable := GetUserUsableGroups(userGroup)

	exclude := make(map[string]struct{})
	for _, g := range ignore {
		exclude[g] = struct{}{}
	}
	for _, g := range avoid {
		exclude[g] = struct{}{}
	}

	// 候选全集：only 给了则限定为 only∩usable，否则为全部 usable；再剔除 exclude。
	universe := make(map[string]struct{})
	if len(only) > 0 {
		for _, g := range only {
			if _, ok := usable[g]; ok {
				if _, bad := exclude[g]; !bad {
					universe[g] = struct{}{}
				}
			}
		}
	} else {
		for g := range usable {
			if _, bad := exclude[g]; !bad {
				universe[g] = struct{}{}
			}
		}
	}

	out := make([]string, 0, len(universe))
	seen := make(map[string]struct{})
	// 1. order 里的分组排最前（只保留在候选全集内的）
	for _, g := range order {
		if _, ok := universe[g]; !ok {
			continue
		}
		if _, dup := seen[g]; dup {
			continue
		}
		out = append(out, g)
		seen[g] = struct{}{}
	}
	// 2. 是否追加候选全集里剩余分组：
	//    - only 给了：only 本身就是允许边界，剩余的始终追加；
	//    - 否则（全集=全部 usable）：仅当 allowFallbacks 才追加，否则只用 order 指定的。
	if len(only) > 0 || allowFallbacks {
		rest := make([]string, 0, len(universe))
		for g := range universe {
			if _, dup := seen[g]; !dup {
				rest = append(rest, g)
			}
		}
		sort.Strings(rest) // 名字序，保证确定性
		out = append(out, rest...)
	}

	if len(out) == 0 {
		return nil, errors.New("no usable group matches provider selection")
	}
	return out, nil
}

// GetUserAutoGroup 根据用户分组获取自动分组设置
func GetUserAutoGroup(userGroup string) []string {
	groups := GetUserUsableGroups(userGroup)
	autoGroups := make([]string, 0)
	for _, group := range setting.GetAutoGroups() {
		if _, ok := groups[group]; ok {
			autoGroups = append(autoGroups, group)
		}
	}
	return autoGroups
}

// GetUserGroupRatio 获取用户使用某个分组的倍率
// userGroup 用户分组
// group 需要获取倍率的分组
func GetUserGroupRatio(userGroup, group string) float64 {
	ratio, ok := ratio_setting.GetGroupGroupRatio(userGroup, group)
	if ok {
		return ratio
	}
	return ratio_setting.GetGroupRatio(group)
}
