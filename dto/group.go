package dto

type GroupDetail struct {
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	Ratio        float64 `json:"ratio"`
	IsAuto       bool    `json:"is_auto"`
	ChannelCount int64   `json:"channel_count"`
	UserCount    int64   `json:"user_count"`
}

type CreateGroupRequest struct {
	Name        string  `json:"name" binding:"required"`
	Description string  `json:"description"`
	Ratio       float64 `json:"ratio"`
	IsAuto      bool    `json:"is_auto"`
}

type UpdateGroupRequest struct {
	Name        string   `json:"name" binding:"required"`
	Description *string  `json:"description"`
	Ratio       *float64 `json:"ratio"`
	IsAuto      *bool    `json:"is_auto"`
}

type GroupChannelInfo struct {
	Id          int    `json:"id"`
	Name        string `json:"name"`
	Type        int    `json:"type"`
	Status      int    `json:"status"`
	GroupWeight *uint  `json:"group_weight"`
}

type UpdateGroupChannelWeightRequest struct {
	ChannelId int  `json:"channel_id" binding:"required"`
	Weight    uint `json:"weight"`
}
