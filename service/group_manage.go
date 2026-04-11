package service

import (
	"errors"
	"regexp"
	"strconv"

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

// ListAllGroups returns all groups with their full details.
func ListAllGroups() ([]*dto.GroupDetail, error) {
	ratioMap := ratio_setting.GetGroupRatioCopy()
	descMap := setting.GetUserUsableGroupsCopy()
	autoGroups := setting.GetAutoGroups()

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
			Name:         name,
			Description:  desc,
			Ratio:        ratio,
			IsAuto:       autoSet[name],
			ChannelCount: channelCount,
			UserCount:    userCount,
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
