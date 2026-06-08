package dto

type GroupDetail struct {
	Name              string  `json:"name"`
	Description       string  `json:"description"`
	Ratio             float64 `json:"ratio"`
	IsAuto            bool    `json:"is_auto"`
	IsGlobal          bool    `json:"is_global"`
	ChannelCount      int64   `json:"channel_count"`
	UserCount         int64   `json:"user_count"`
	FallbackChannelId int     `json:"fallback_channel_id"`
}

type CreateGroupRequest struct {
	Name              string  `json:"name" binding:"required"`
	Description       string  `json:"description"`
	Ratio             float64 `json:"ratio"`
	IsAuto            bool    `json:"is_auto"`
	IsGlobal          *bool   `json:"is_global,omitempty"`
	ChannelIds        []int   `json:"channel_ids"`
	FallbackChannelId *int    `json:"fallback_channel_id"`
}

type UpdateGroupRequest struct {
	Name              string   `json:"name" binding:"required"`
	Description       *string  `json:"description"`
	Ratio             *float64 `json:"ratio"`
	IsAuto            *bool    `json:"is_auto"`
	IsGlobal          *bool    `json:"is_global,omitempty"`
	ChannelIds        *[]int   `json:"channel_ids"`
	FallbackChannelId *int     `json:"fallback_channel_id"`
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
