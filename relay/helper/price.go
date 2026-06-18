package helper

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

// https://docs.claude.com/en/docs/build-with-claude/prompt-caching#1-hour-cache-duration
// ClaudeCacheCreation1hMultiplier 是 Claude 1h cache write 价格相对 5min cache write 的倍数。
const ClaudeCacheCreation1hMultiplier = 6 / 3.75
const claudeCacheCreation1hMultiplier = ClaudeCacheCreation1hMultiplier

// HandleGroupRatio checks for "auto_group" in the context and updates the group ratio and relayInfo.UsingGroup if present
func HandleGroupRatio(ctx *gin.Context, relayInfo *relaycommon.RelayInfo) types.GroupRatioInfo {
	groupRatioInfo := types.GroupRatioInfo{
		GroupRatio:        1.0, // default ratio
		GroupSpecialRatio: -1,
	}

	// check auto group
	autoGroup, exists := ctx.Get("auto_group")
	if exists {
		logger.LogDebug(ctx, fmt.Sprintf("final group: %s", autoGroup))
		relayInfo.UsingGroup = autoGroup.(string)
	}

	// check user group special ratio
	userGroupRatio, ok := ratio_setting.GetGroupGroupRatio(relayInfo.UserGroup, relayInfo.UsingGroup)
	if ok {
		// user group special ratio
		groupRatioInfo.GroupSpecialRatio = userGroupRatio
		groupRatioInfo.GroupRatio = userGroupRatio
		groupRatioInfo.HasSpecialRatio = true
	} else {
		// normal group ratio
		groupRatioInfo.GroupRatio = ratio_setting.GetGroupRatio(relayInfo.UsingGroup)
	}

	return groupRatioInfo
}

// resolveEffectiveRatio returns the ratio that should replace group_ratio in the
// pricing formula. Priority: per-user-model override → per-user default → group_ratio.
// A value of 0 at any per-user level means "unset", fall through to the next level.
func resolveEffectiveRatio(c *gin.Context, modelName string, groupRatio float64) float64 {
	if v, exists := common.GetContextKey(c, constant.ContextKeyUserModelRatios); exists {
		if s, ok := v.(string); ok && s != "" {
			m := map[string]float64{}
			if err := common.UnmarshalJsonStr(s, &m); err == nil {
				if r, ok := m[modelName]; ok && r > 0 {
					return r
				}
			}
		}
	}
	if v, exists := common.GetContextKey(c, constant.ContextKeyUserRatio); exists {
		if r, ok := v.(float64); ok && r > 0 {
			return r
		}
	}
	return groupRatio
}

func ModelPriceHelper(c *gin.Context, info *relaycommon.RelayInfo, promptTokens int, meta *types.TokenCountMeta) (types.PriceData, error) {
	modelPrice, usePrice := ratio_setting.GetModelPrice(info.OriginModelName, false)

	groupRatioInfo := HandleGroupRatio(c, info)
	// Override group_ratio with per-user or per-user-model effective ratio when set.
	groupRatioInfo.GroupRatio = resolveEffectiveRatio(c, info.OriginModelName, groupRatioInfo.GroupRatio)

	var preConsumedQuota int
	var modelRatio float64
	var completionRatio float64
	var cacheRatio float64
	var imageRatio float64
	var cacheCreationRatio float64
	var cacheCreationRatio5m float64
	var cacheCreationRatio1h float64
	var audioRatio float64
	var audioCompletionRatio float64
	var freeModel bool
	var tieredEnabled bool
	var tierIndex int
	var tierThreshold int
	var tierTotal int
	if !usePrice {
		preConsumedTokens := common.Max(promptTokens, common.PreConsumedQuota)
		if meta.MaxTokens != 0 {
			preConsumedTokens += meta.MaxTokens
		}
		var success bool
		var matchName string
		modelRatio, success, matchName = ratio_setting.GetModelRatio(info.OriginModelName)
		if !success {
			acceptUnsetRatio := false
			if info.UserSetting.AcceptUnsetRatioModel {
				acceptUnsetRatio = true
			}
			if !acceptUnsetRatio {
				return types.PriceData{}, fmt.Errorf("模型 %s 倍率或价格未配置，请联系管理员设置或开始自用模式；Model %s ratio or price not set, please set or start self-use mode", matchName, matchName)
			}
		}
		completionRatio = ratio_setting.GetCompletionRatio(info.OriginModelName)
		cacheRatio, _ = ratio_setting.GetCacheRatio(info.OriginModelName)
		cacheCreationRatio, _ = ratio_setting.GetCreateCacheRatio(info.OriginModelName)
		cacheCreationRatio5m = cacheCreationRatio
		// 1h 缓存写入价格：优先用模型管理里独立配置的 1h 倍率;
		// 未配置时回退到固定比例(5m × ClaudeCacheCreation1hMultiplier),保持向后兼容。
		if r1h, ok := ratio_setting.GetCreateCacheRatio1h(info.OriginModelName); ok {
			cacheCreationRatio1h = r1h
		} else {
			cacheCreationRatio1h = cacheCreationRatio * claudeCacheCreation1hMultiplier
		}
		imageRatio, _ = ratio_setting.GetImageRatio(info.OriginModelName)
		audioRatio = ratio_setting.GetAudioRatio(info.OriginModelName)
		audioCompletionRatio = ratio_setting.GetAudioCompletionRatio(info.OriginModelName)

		// 阶梯计费：若模型配置了 tiers，根据预扣阶段的 promptTokens 选档，
		// 覆盖 modelRatio/completionRatio 以及（若该档显式给出）cacheRatio/cacheCreationRatio。
		// 注意：promptTokens 此处可能是估算值，结算阶段会按真实 usage 重新选档。
		if tiers, ok := ratio_setting.GetModelRatioTiers(info.OriginModelName); ok && len(tiers) > 0 {
			idx, t := ratio_setting.SelectTierByPromptTokens(tiers, promptTokens)
			if idx >= 0 {
				modelRatio = t.ModelRatio
				completionRatio = t.CompletionRatio
				if t.CacheRatio > 0 {
					cacheRatio = t.CacheRatio
				}
				if t.CreateCacheRatio > 0 {
					cacheCreationRatio = t.CreateCacheRatio
					cacheCreationRatio5m = cacheCreationRatio
					cacheCreationRatio1h = cacheCreationRatio * claudeCacheCreation1hMultiplier
				}
				tieredEnabled = true
				tierIndex = idx
				tierThreshold = t.Threshold
				tierTotal = len(tiers)
			}
		}

		ratio := modelRatio * groupRatioInfo.GroupRatio
		preConsumedQuota = int(float64(preConsumedTokens) * ratio)
	} else {
		if meta.ImagePriceRatio != 0 {
			modelPrice = modelPrice * meta.ImagePriceRatio
		}
		preConsumedQuota = int(modelPrice * common.QuotaPerUnit * groupRatioInfo.GroupRatio)
	}

	// check if free model pre-consume is disabled
	if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
		// if model price or ratio is 0, do not pre-consume quota
		if groupRatioInfo.GroupRatio == 0 {
			preConsumedQuota = 0
			freeModel = true
		} else if usePrice {
			if modelPrice == 0 {
				preConsumedQuota = 0
				freeModel = true
			}
		} else {
			if modelRatio == 0 {
				preConsumedQuota = 0
				freeModel = true
			}
		}
	}

	priceData := types.PriceData{
		FreeModel:            freeModel,
		ModelPrice:           modelPrice,
		ModelRatio:           modelRatio,
		CompletionRatio:      completionRatio,
		GroupRatioInfo:       groupRatioInfo,
		UsePrice:             usePrice,
		CacheRatio:           cacheRatio,
		ImageRatio:           imageRatio,
		AudioRatio:           audioRatio,
		AudioCompletionRatio: audioCompletionRatio,
		CacheCreationRatio:   cacheCreationRatio,
		CacheCreation5mRatio: cacheCreationRatio5m,
		CacheCreation1hRatio: cacheCreationRatio1h,
		QuotaToPreConsume:    preConsumedQuota,
		TieredEnabled:        tieredEnabled,
		TierIndex:            tierIndex,
		TierThreshold:        tierThreshold,
		TierTotal:            tierTotal,
	}

	if common.DebugEnabled {
		println(fmt.Sprintf("model_price_helper result: %s", priceData.ToSetting()))
	}
	// 「输入含视频」加价:模型在 model.VideoInputRatio 配置 + 请求体含 video_url 时
	// 把乘子写入 priceData.OtherRatios["video_input"]。文本路径的 PreConsume 不会
	// 自动应用 OtherRatios,这里立即放大 QuotaToPreConsume,避免用户预扣不足
	// (text_quota.go 终态结算会自动 ×OtherRatios)。
	ApplyVideoInputRatioFromRequest(c, info, &priceData)
	if r, ok := priceData.OtherRatios["video_input"]; ok && r > 0 && priceData.QuotaToPreConsume > 0 {
		priceData.QuotaToPreConsume = int(float64(priceData.QuotaToPreConsume) * r)
	}
	info.PriceData = priceData
	return priceData, nil
}

// ModelPriceHelperPerCall 按次计费的 PriceHelper (MJ、Task)
func ModelPriceHelperPerCall(c *gin.Context, info *relaycommon.RelayInfo) (types.PriceData, error) {
	groupRatioInfo := HandleGroupRatio(c, info)
	groupRatioInfo.GroupRatio = resolveEffectiveRatio(c, info.OriginModelName, groupRatioInfo.GroupRatio)

	modelPrice, success := ratio_setting.GetModelPrice(info.OriginModelName, true)
	// 如果没有配置价格，检查模型倍率配置
	if !success {

		// 没有配置费用，也要使用默认费用,否则按费率计费模型无法使用
		defaultPrice, ok := ratio_setting.GetDefaultModelPriceMap()[info.OriginModelName]
		if ok {
			modelPrice = defaultPrice
		} else {
			// 没有配置倍率也不接受没配置,那就返回错误
			_, ratioSuccess, matchName := ratio_setting.GetModelRatio(info.OriginModelName)
			acceptUnsetRatio := false
			if info.UserSetting.AcceptUnsetRatioModel {
				acceptUnsetRatio = true
			}
			if !ratioSuccess && !acceptUnsetRatio {
				return types.PriceData{}, fmt.Errorf("模型 %s 倍率或价格未配置，请联系管理员设置或开始自用模式；Model %s ratio or price not set, please set or start self-use mode", matchName, matchName)
			}
			// 未配置价格但配置了倍率，使用默认预扣价格
			modelPrice = float64(common.PreConsumedQuota) / common.QuotaPerUnit
		}

	}
	quota := int(modelPrice * common.QuotaPerUnit * groupRatioInfo.GroupRatio)

	// 免费模型检测（与 ModelPriceHelper 对齐）
	freeModel := false
	if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
		if groupRatioInfo.GroupRatio == 0 || modelPrice == 0 {
			quota = 0
			freeModel = true
		}
	}

	priceData := types.PriceData{
		FreeModel:      freeModel,
		ModelPrice:     modelPrice,
		Quota:          quota,
		GroupRatioInfo: groupRatioInfo,
	}

	// 「输入含视频」加价:对按次计费(MJ / Task)同样适用;只写 OtherRatios,
	// task 路径的 OtherRatios → Quota 统一乘法循环会处理 Quota 放大,
	// 避免在此处与 task 循环双重相乘。
	ApplyVideoInputRatioFromRequest(c, info, &priceData)

	return priceData, nil
}

func ContainPriceOrRatio(modelName string) bool {
	_, ok := ratio_setting.GetModelPrice(modelName, false)
	if ok {
		return true
	}
	_, ok, _ = ratio_setting.GetModelRatio(modelName)
	if ok {
		return true
	}
	return false
}
