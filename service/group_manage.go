package service

import (
	"errors"
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

var groupNameRegexp = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

func validateGroupName(name string) error {
	if name == "" {
		return errors.New("分组名称不能为空")
	}
	if len(name) > 64 {
		return errors.New("分组名称不能超过 64 个字符")
	}
	if name == "auto" {
		return errors.New("'auto' 是保留名称，不能作为分组名")
	}
	if !groupNameRegexp.MatchString(name) {
		return errors.New("分组名称只能包含字母、数字、下划线和连字符")
	}
	return nil
}

// syncGroupChannels 将分组的成员渠道全量同步为 channelIds：
// 不在目标集合里的旧成员会被移除该分组，新增成员会被加入该分组。
// 通过改写每个渠道的 group（逗号分隔）字段并重建 abilities 实现。
func syncGroupChannels(groupName string, channelIds []int) error {
	target := make(map[int]struct{}, len(channelIds))
	for _, id := range channelIds {
		if id > 0 {
			target[id] = struct{}{}
		}
	}

	current, err := model.GetChannelsByGroup(groupName)
	if err != nil {
		return err
	}
	currentSet := make(map[int]struct{}, len(current))
	changed := false

	// 移除：当前是成员但不在目标集合
	for _, ch := range current {
		currentSet[ch.Id] = struct{}{}
		if _, ok := target[ch.Id]; ok {
			continue
		}
		groups := ch.GetGroups()
		filtered := make([]string, 0, len(groups))
		for _, g := range groups {
			if g != groupName {
				filtered = append(filtered, g)
			}
		}
		if err := model.SetChannelGroup(ch.Id, strings.Join(filtered, ",")); err != nil {
			return err
		}
		changed = true
	}

	// 新增：在目标集合但当前不是成员
	for id := range target {
		if _, ok := currentSet[id]; ok {
			continue
		}
		ch, err := model.GetChannelById(id, true)
		if err != nil {
			return errors.New("渠道 " + strconv.Itoa(id) + " 不存在")
		}
		groups := ch.GetGroups()
		exists := false
		for _, g := range groups {
			if g == groupName {
				exists = true
				break
			}
		}
		if exists {
			continue
		}
		groups = append(groups, groupName)
		if err := model.SetChannelGroup(id, strings.Join(groups, ",")); err != nil {
			return err
		}
		changed = true
	}

	if changed {
		model.InitChannelCache()
	}
	return nil
}

// setGroupFallback 设置或清除某个分组的兜底渠道。channelId <= 0 表示清除。
func setGroupFallback(groupName string, channelId int) error {
	fbMap := setting.GetGroupFallbackCopy()
	if channelId <= 0 {
		delete(fbMap, groupName)
	} else {
		fbMap[groupName] = channelId
	}
	fbJSON, err := common.Marshal(fbMap)
	if err != nil {
		return err
	}
	return model.UpdateOption("GroupFallback", string(fbJSON))
}

// setGroupGlobalVisible 持久化某个分组的全局可见性。
// 通过 UpdateOption 写入数据库的同时,内存 map 会经由 model.UpdateOption 回调同步。
func setGroupGlobalVisible(groupName string, visible bool) error {
	visMap := setting.GetGroupGlobalVisibleCopy()
	visMap[groupName] = visible
	visJSON, err := common.Marshal(visMap)
	if err != nil {
		return err
	}
	return model.UpdateOption("GroupGlobalVisible", string(visJSON))
}

// ListAllGroups returns all groups with their full details.
func ListAllGroups() ([]*dto.GroupDetail, error) {
	ratioMap := ratio_setting.GetGroupRatioCopy()
	descMap := setting.GetUserUsableGroupsCopy()
	autoGroups := setting.GetAutoGroups()
	fallbackMap := setting.GetGroupFallbackCopy()

	autoSet := make(map[string]bool)
	for _, g := range autoGroups {
		autoSet[g] = true
	}

	var groups []*dto.GroupDetail
	for name, ratio := range ratioMap {
		desc := descMap[name]
		channelCount, _ := model.CountChannelsByGroup(name)
		userCount, _ := model.CountUsersByGroup(name)

		groups = append(groups, &dto.GroupDetail{
			Name:              name,
			Description:       desc,
			Ratio:             ratio,
			IsAuto:            autoSet[name],
			IsGlobal:          setting.IsGroupGlobalVisible(name),
			ChannelCount:      channelCount,
			UserCount:         userCount,
			FallbackChannelId: fallbackMap[name],
		})
	}
	return groups, nil
}

// CreateGroup creates a new group by atomically updating all relevant Option keys.
func CreateGroup(req *dto.CreateGroupRequest) error {
	if err := validateGroupName(req.Name); err != nil {
		return err
	}
	if req.Ratio < 0 {
		return errors.New("分组倍率不能小于 0")
	}
	if ratio_setting.ContainsGroupRatio(req.Name) {
		return errors.New("分组 '" + req.Name + "' 已存在")
	}

	// 1. Update GroupRatio
	ratioMap := ratio_setting.GetGroupRatioCopy()
	ratioMap[req.Name] = req.Ratio
	ratioJSON, err := common.Marshal(ratioMap)
	if err != nil {
		return err
	}
	if err := model.UpdateOption("GroupRatio", string(ratioJSON)); err != nil {
		return err
	}

	// 2. Update UserUsableGroups
	descMap := setting.GetUserUsableGroupsCopy()
	descMap[req.Name] = req.Description
	descJSON, err := common.Marshal(descMap)
	if err != nil {
		return err
	}
	if err := model.UpdateOption("UserUsableGroups", string(descJSON)); err != nil {
		return err
	}

	// 3. If auto, update AutoGroups
	if req.IsAuto {
		autoGroups := setting.GetAutoGroups()
		autoGroups = append(autoGroups, req.Name)
		autoJSON, err := common.Marshal(autoGroups)
		if err != nil {
			return err
		}
		if err := model.UpdateOption("AutoGroups", string(autoJSON)); err != nil {
			return err
		}
	}

	// 4. 关联渠道（把该分组写入选中渠道的 group 字段）
	if len(req.ChannelIds) > 0 {
		if err := syncGroupChannels(req.Name, req.ChannelIds); err != nil {
			return err
		}
	}

	// 5. 兜底渠道
	if req.FallbackChannelId != nil {
		if err := setGroupFallback(req.Name, *req.FallbackChannelId); err != nil {
			return err
		}
	}

	// 6. 全局可见性。nil 视为 true(默认全局可见);default 强制 true。
	isGlobal := true
	if req.IsGlobal != nil {
		isGlobal = *req.IsGlobal
	}
	if req.Name == "default" {
		isGlobal = true
	}
	if err := setGroupGlobalVisible(req.Name, isGlobal); err != nil {
		return err
	}

	return nil
}

// UpdateGroup updates an existing group's properties.
func UpdateGroup(req *dto.UpdateGroupRequest) error {
	if !ratio_setting.ContainsGroupRatio(req.Name) {
		return errors.New("分组 '" + req.Name + "' 不存在")
	}

	// 1. Update ratio
	if req.Ratio != nil {
		if *req.Ratio < 0 {
			return errors.New("分组倍率不能小于 0")
		}
		ratioMap := ratio_setting.GetGroupRatioCopy()
		ratioMap[req.Name] = *req.Ratio
		ratioJSON, err := common.Marshal(ratioMap)
		if err != nil {
			return err
		}
		if err := model.UpdateOption("GroupRatio", string(ratioJSON)); err != nil {
			return err
		}
	}

	// 2. Update description
	if req.Description != nil {
		descMap := setting.GetUserUsableGroupsCopy()
		descMap[req.Name] = *req.Description
		descJSON, err := common.Marshal(descMap)
		if err != nil {
			return err
		}
		if err := model.UpdateOption("UserUsableGroups", string(descJSON)); err != nil {
			return err
		}
	}

	// 3. Update auto status
	if req.IsAuto != nil {
		autoGroups := setting.GetAutoGroups()
		if *req.IsAuto {
			// Add to auto groups if not already present
			found := false
			for _, g := range autoGroups {
				if g == req.Name {
					found = true
					break
				}
			}
			if !found {
				autoGroups = append(autoGroups, req.Name)
			}
		} else {
			// Remove from auto groups
			filtered := make([]string, 0, len(autoGroups))
			for _, g := range autoGroups {
				if g != req.Name {
					filtered = append(filtered, g)
				}
			}
			autoGroups = filtered
		}
		autoJSON, err := common.Marshal(autoGroups)
		if err != nil {
			return err
		}
		if err := model.UpdateOption("AutoGroups", string(autoJSON)); err != nil {
			return err
		}
	}

	// 4. 同步关联渠道（非 nil 表示全量覆盖该分组成员）
	if req.ChannelIds != nil {
		if err := syncGroupChannels(req.Name, *req.ChannelIds); err != nil {
			return err
		}
	}

	// 5. 兜底渠道
	if req.FallbackChannelId != nil {
		if err := setGroupFallback(req.Name, *req.FallbackChannelId); err != nil {
			return err
		}
	}

	// 6. 全局可见性。nil 表示不变;default 分组不允许改为非全局。
	if req.IsGlobal != nil {
		if req.Name == "default" && !*req.IsGlobal {
			return errors.New("'default' 分组必须保持全局可见")
		}
		if err := setGroupGlobalVisible(req.Name, *req.IsGlobal); err != nil {
			return err
		}
	}

	return nil
}

// DeleteGroup removes a group from all settings.
// If force is false and the group is still referenced by channels or users, it returns an error.
func DeleteGroup(name string, force bool) error {
	if name == "default" {
		return errors.New("不能删除 'default' 分组")
	}
	if !ratio_setting.ContainsGroupRatio(name) {
		return errors.New("分组 '" + name + "' 不存在")
	}

	// Check references
	channelCount, _ := model.CountChannelsByGroup(name)
	userCount, _ := model.CountUsersByGroup(name)
	if !force && (channelCount > 0 || userCount > 0) {
		return errors.New("该分组仍被引用（渠道: " + strconv.FormatInt(channelCount, 10) + "，用户: " + strconv.FormatInt(userCount, 10) + "），请使用强制删除或先移除引用")
	}

	// 1. Remove from GroupRatio
	ratioMap := ratio_setting.GetGroupRatioCopy()
	delete(ratioMap, name)
	ratioJSON, err := common.Marshal(ratioMap)
	if err != nil {
		return err
	}
	if err := model.UpdateOption("GroupRatio", string(ratioJSON)); err != nil {
		return err
	}

	// 2. Remove from UserUsableGroups
	descMap := setting.GetUserUsableGroupsCopy()
	delete(descMap, name)
	descJSON, err := common.Marshal(descMap)
	if err != nil {
		return err
	}
	if err := model.UpdateOption("UserUsableGroups", string(descJSON)); err != nil {
		return err
	}

	// 3. Remove from AutoGroups
	autoGroups := setting.GetAutoGroups()
	filtered := make([]string, 0, len(autoGroups))
	for _, g := range autoGroups {
		if g != name {
			filtered = append(filtered, g)
		}
	}
	autoJSON, err := common.Marshal(filtered)
	if err != nil {
		return err
	}
	if err := model.UpdateOption("AutoGroups", string(autoJSON)); err != nil {
		return err
	}

	// 3.1 Remove from GroupFallback (both as a group with a fallback, and as a fallback target)
	fbMap := setting.GetGroupFallbackCopy()
	fbChanged := false
	if _, ok := fbMap[name]; ok {
		delete(fbMap, name)
		fbChanged = true
	}
	if fbChanged {
		if fbJSON, err := common.Marshal(fbMap); err == nil {
			_ = model.UpdateOption("GroupFallback", string(fbJSON))
		}
	}

	// 3.2 Remove from GroupGlobalVisible
	visMap := setting.GetGroupGlobalVisibleCopy()
	if _, ok := visMap[name]; ok {
		delete(visMap, name)
		if visJSON, err := common.Marshal(visMap); err == nil {
			_ = model.UpdateOption("GroupGlobalVisible", string(visJSON))
		}
	}

	// 4. Remove from GroupGroupRatio (both as outer key and from inner maps)
	ggRatioStr := ratio_setting.GroupGroupRatio2JSONString()
	var ggRatio map[string]map[string]float64
	if err := common.Unmarshal([]byte(ggRatioStr), &ggRatio); err == nil {
		delete(ggRatio, name)
		for outerKey, innerMap := range ggRatio {
			delete(innerMap, name)
			ggRatio[outerKey] = innerMap
		}
		ggJSON, err := common.Marshal(ggRatio)
		if err == nil {
			_ = model.UpdateOption("GroupGroupRatio", string(ggJSON))
		}
	}

	// 5. Remove from GroupSpecialUsableGroup
	gsSetting := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	if gsSetting != nil {
		gsMap := gsSetting.ReadAll()
		delete(gsMap, name)
		// Also remove from inner maps
		for outerKey, innerMap := range gsMap {
			for innerKey := range innerMap {
				// Keys can be "name", "+:name", or "-:name"
				cleanKey := innerKey
				if len(cleanKey) > 2 && (cleanKey[:2] == "+:" || cleanKey[:2] == "-:") {
					cleanKey = cleanKey[2:]
				}
				if cleanKey == name {
					delete(innerMap, innerKey)
				}
			}
			gsMap[outerKey] = innerMap
		}
		gsJSON, err := common.Marshal(gsMap)
		if err == nil {
			_ = model.UpdateOption("group_ratio_setting.group_special_usable_group", string(gsJSON))
		}
	}

	return nil
}

// GetGroupChannels returns channels that belong to the specified group.
func GetGroupChannels(name string) ([]*model.Channel, error) {
	return model.GetChannelsByGroup(name)
}

// GetGroupChannelsWithWeight returns channels enriched with their group-specific weight from the abilities table.
func GetGroupChannelsWithWeight(name string) ([]dto.GroupChannelInfo, error) {
	channels, err := model.GetChannelsByGroup(name)
	if err != nil {
		return nil, err
	}
	weightMap, err := model.GetGroupChannelWeights(name)
	if err != nil {
		return nil, err
	}
	result := make([]dto.GroupChannelInfo, 0, len(channels))
	for _, ch := range channels {
		info := dto.GroupChannelInfo{
			Id:     ch.Id,
			Name:   ch.Name,
			Type:   ch.Type,
			Status: ch.Status,
		}
		if w, ok := weightMap[ch.Id]; ok {
			wCopy := w
			info.GroupWeight = &wCopy
		}
		result = append(result, info)
	}
	return result, nil
}

// UpdateGroupChannelWeight updates the weight of all ability records for a channel within a group.
func UpdateGroupChannelWeight(group string, channelId int, weight uint) error {
	return model.UpdateGroupChannelWeight(group, channelId, weight)
}
