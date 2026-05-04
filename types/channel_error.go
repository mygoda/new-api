package types

type ChannelError struct {
	ChannelId   int    `json:"channel_id"`
	ChannelType int    `json:"channel_type"`
	ChannelName string `json:"channel_name"`
	IsMultiKey  bool   `json:"is_multi_key"`
	AutoBan     bool   `json:"auto_ban"`
	UsingKey    string `json:"using_key"`
	Model       string `json:"model"`
}

func NewChannelError(channelId int, channelType int, channelName string, isMultiKey bool, usingKey string, autoBan bool) *ChannelError {
	return &ChannelError{
		ChannelId:   channelId,
		ChannelType: channelType,
		ChannelName: channelName,
		IsMultiKey:  isMultiKey,
		AutoBan:     autoBan,
		UsingKey:    usingKey,
	}
}

// NewChannelErrorWithModel is the variant used by the relay path where the model name
// is known and channel+model granular auto-disable is desired.
func NewChannelErrorWithModel(channelId int, channelType int, channelName string, isMultiKey bool, usingKey string, autoBan bool, modelName string) *ChannelError {
	ce := NewChannelError(channelId, channelType, channelName, isMultiKey, usingKey, autoBan)
	ce.Model = modelName
	return ce
}

