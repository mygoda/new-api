package model

import "github.com/QuantumNous/new-api/common"

// CountChannelsByGroup counts channels whose comma-separated group field contains the given group name.
func CountChannelsByGroup(groupName string) (int64, error) {
	var count int64
	var groupCondition string
	if common.UsingMySQL {
		groupCondition = `CONCAT(',', ` + commonGroupCol + `, ',') LIKE ?`
	} else {
		groupCondition = `(',' || ` + commonGroupCol + ` || ',') LIKE ?`
	}
	err := DB.Model(&Channel{}).Where(groupCondition, "%,"+groupName+",%").Count(&count).Error
	return count, err
}

// GetChannelsByGroup returns channels whose group field contains the given group name.
// The key field is cleared to avoid leaking secrets.
func GetChannelsByGroup(groupName string) ([]*Channel, error) {
	var channels []*Channel
	var groupCondition string
	if common.UsingMySQL {
		groupCondition = `CONCAT(',', ` + commonGroupCol + `, ',') LIKE ?`
	} else {
		groupCondition = `(',' || ` + commonGroupCol + ` || ',') LIKE ?`
	}
	err := DB.Where(groupCondition, "%,"+groupName+",%").Find(&channels).Error
	if err != nil {
		return nil, err
	}
	for _, ch := range channels {
		ch.Key = ""
	}
	return channels, nil
}

// CountUsersByGroup counts users with the exact group value.
func CountUsersByGroup(groupName string) (int64, error) {
	var count int64
	err := DB.Model(&User{}).Where(commonGroupCol+" = ?", groupName).Count(&count).Error
	return count, err
}
