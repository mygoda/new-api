package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// RetrySetting 重试相关行为开关。两项均默认开启,用于纠正历史不合理默认;
// 出问题时管理员可在后台置 false 即时回滚,无需重新部署。
type RetrySetting struct {
	// PreferUntriedChannel: 重试时优先选择本次请求尚未尝试过的渠道;
	// 当没有未尝试的渠道时回退到原候选集(仍允许重试同渠道),
	// 以保留单渠道模型在瞬时错误(429/5xx)下的恢复能力。
	PreferUntriedChannel bool `json:"prefer_untried_channel"`
	// SkipRetryClientError: 上游返回确定性客户端错误(400/413/422)时不再跨渠道重试,
	// 因为请求本身非法,换任何渠道都会同样失败。放行 408/409/425/429(瞬时类)。
	SkipRetryClientError bool `json:"skip_retry_client_error"`
}

var retrySetting = RetrySetting{
	PreferUntriedChannel: true,
	SkipRetryClientError: true,
}

func init() {
	config.GlobalConfig.Register("retry_setting", &retrySetting)
}

func GetRetrySetting() *RetrySetting {
	return &retrySetting
}

// ShouldPreferUntriedChannel 重试时是否优先选未尝试过的渠道。
func ShouldPreferUntriedChannel() bool {
	return retrySetting.PreferUntriedChannel
}

// ShouldSkipRetryClientError 是否对确定性客户端错误跳过重试。
func ShouldSkipRetryClientError() bool {
	return retrySetting.SkipRetryClientError
}

// IsNonRetryableClientStatus 判断状态码是否为确定性客户端错误(换渠道必然同样失败)。
// 仅 400/413/422;放行 408(超时)/409(冲突)/425(too early)/429(限流)等瞬时类,
// 以及 404(目标模型/端点在别的渠道可能存在)。
func IsNonRetryableClientStatus(code int) bool {
	switch code {
	case 400, 413, 422:
		return true
	default:
		return false
	}
}
