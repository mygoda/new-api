package model

import (
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	sentrypkg "github.com/QuantumNous/new-api/sentry"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/performance_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

type Option struct {
	Key   string `json:"key" gorm:"primaryKey"`
	Value string `json:"value"`
}

func AllOption() ([]*Option, error) {
	var options []*Option
	var err error
	err = DB.Find(&options).Error
	return options, err
}

func InitOptionMap() {
	common.OptionMapRWMutex.Lock()
	common.OptionMap = make(map[string]string)

	// 添加原有的系统配置
	common.OptionMap["FileUploadPermission"] = strconv.Itoa(common.FileUploadPermission)
	common.OptionMap["FileDownloadPermission"] = strconv.Itoa(common.FileDownloadPermission)
	common.OptionMap["ImageUploadPermission"] = strconv.Itoa(common.ImageUploadPermission)
	common.OptionMap["ImageDownloadPermission"] = strconv.Itoa(common.ImageDownloadPermission)
	common.OptionMap["PasswordLoginEnabled"] = strconv.FormatBool(common.PasswordLoginEnabled)
	common.OptionMap["PasswordRegisterEnabled"] = strconv.FormatBool(common.PasswordRegisterEnabled)
	common.OptionMap["EmailVerificationEnabled"] = strconv.FormatBool(common.EmailVerificationEnabled)
	common.OptionMap["GitHubOAuthEnabled"] = strconv.FormatBool(common.GitHubOAuthEnabled)
	common.OptionMap["LinuxDOOAuthEnabled"] = strconv.FormatBool(common.LinuxDOOAuthEnabled)
	common.OptionMap["TelegramOAuthEnabled"] = strconv.FormatBool(common.TelegramOAuthEnabled)
	common.OptionMap["WeChatAuthEnabled"] = strconv.FormatBool(common.WeChatAuthEnabled)
	common.OptionMap["TurnstileCheckEnabled"] = strconv.FormatBool(common.TurnstileCheckEnabled)
	common.OptionMap["RegisterEnabled"] = strconv.FormatBool(common.RegisterEnabled)
	common.OptionMap["AutomaticDisableChannelEnabled"] = strconv.FormatBool(common.AutomaticDisableChannelEnabled)
	common.OptionMap["AutomaticEnableChannelEnabled"] = strconv.FormatBool(common.AutomaticEnableChannelEnabled)
	common.OptionMap["AutomaticDisableChannelModelEnabled"] = strconv.FormatBool(common.AutomaticDisableChannelModelEnabled)
	common.OptionMap["ChannelModelHeartbeatSuccessThreshold"] = strconv.Itoa(common.ChannelModelHeartbeatSuccessThreshold)
	common.OptionMap["ChannelModelHeartbeatIntervalSeconds"] = strconv.Itoa(common.ChannelModelHeartbeatIntervalSeconds)
	common.OptionMap["FeishuAlertEnabled"] = strconv.FormatBool(common.FeishuAlertEnabled)
	common.OptionMap["FeishuAlertWebhookUrl"] = common.FeishuAlertWebhookUrl
	common.OptionMap["FeishuAlertSignSecret"] = common.FeishuAlertSignSecret
	common.OptionMap["FeishuAlertAppId"] = common.FeishuAlertAppId
	common.OptionMap["FeishuAlertAppSecret"] = common.FeishuAlertAppSecret
	common.OptionMap["FeishuAlertReceiveId"] = common.FeishuAlertReceiveId
	common.OptionMap["FeishuAlertReceiveIdType"] = common.FeishuAlertReceiveIdType
	common.OptionMap["FeishuAlertDedupSeconds"] = strconv.Itoa(common.FeishuAlertDedupSeconds)
	common.OptionMap["FeishuAlertEventMask"] = common.FeishuAlertEventMask
	common.OptionMap["FeishuAlertRelay5xxWindowSeconds"] = strconv.Itoa(common.FeishuAlertRelay5xxWindowSeconds)
	common.OptionMap["FeishuAlertRelay5xxThreshold"] = strconv.Itoa(common.FeishuAlertRelay5xxThreshold)
	common.OptionMap["FeishuAlertHeartbeatFailureLimit"] = strconv.Itoa(common.FeishuAlertHeartbeatFailureLimit)
	common.OptionMap["AlertEmailReceivers"] = common.AlertEmailReceivers
	// 通用模型条件分价配置(JSON,admin 在「价格配置」UI 编辑)
	// family 由各 adapter 通过 common.RegisterConditionalRatioFamily 在 init() 注册,
	// 默认 JSON 此时已经包含所有已注册族(import 链触发了各 register.go)。
	common.OptionMap["ConditionalRatios"] = common.ConditionalRatioDefaultJSON()
	common.SetConditionalRatios(common.OptionMap["ConditionalRatios"])
	// v2 通用条件分价: admin 可在前端为"任意模型"按"维度组合"自由配价,无需后端编译。
	// 维度由各 adapter 通过 common.RegisterDimension 在 init() 注册;
	// 默认配置为禁用 + 空规则集,首次开启后由 admin 自助填入规则。
	common.OptionMap["ConditionalRatiosV2"] = ratio_setting.ConditionalRatiosV2JSONString()
	// 首页 4 个 option 的默认值。先写入 common.X 变量,再镜像到 OptionMap。
	// 这样 service 层读 common.X 即可拿到默认值;DB 有覆盖时由 loadOptionsFromDatabase 改 common.X。
	common.HomeTestimonials = defaultHomeTestimonialsJSON()
	common.HomeFAQ = defaultHomeFAQJSON()
	common.HomeFooter = defaultHomeFooterJSON()
	common.HomePricingDeals = defaultHomePricingDealsJSON()
	common.OptionMap["HomeStatsSLA"] = common.HomeStatsSLA
	common.OptionMap["HomeTestimonials"] = common.HomeTestimonials
	common.OptionMap["HomeFAQ"] = common.HomeFAQ
	common.OptionMap["HomeFooter"] = common.HomeFooter
	common.OptionMap["HomePricingDeals"] = common.HomePricingDeals
	common.OptionMap["LogConsumeEnabled"] = strconv.FormatBool(common.LogConsumeEnabled)
	common.OptionMap["DisplayInCurrencyEnabled"] = strconv.FormatBool(common.DisplayInCurrencyEnabled)
	common.OptionMap["DisplayTokenStatEnabled"] = strconv.FormatBool(common.DisplayTokenStatEnabled)
	common.OptionMap["DrawingEnabled"] = strconv.FormatBool(common.DrawingEnabled)
	common.OptionMap["TaskEnabled"] = strconv.FormatBool(common.TaskEnabled)
	common.OptionMap["DataExportEnabled"] = strconv.FormatBool(common.DataExportEnabled)
	common.OptionMap["ChannelDisableThreshold"] = strconv.FormatFloat(common.ChannelDisableThreshold, 'f', -1, 64)
	common.OptionMap["EmailDomainRestrictionEnabled"] = strconv.FormatBool(common.EmailDomainRestrictionEnabled)
	common.OptionMap["EmailAliasRestrictionEnabled"] = strconv.FormatBool(common.EmailAliasRestrictionEnabled)
	common.OptionMap["EmailDomainWhitelist"] = strings.Join(common.EmailDomainWhitelist, ",")
	common.OptionMap["SMTPServer"] = ""
	common.OptionMap["SMTPFrom"] = ""
	common.OptionMap["SMTPPort"] = strconv.Itoa(common.SMTPPort)
	common.OptionMap["SMTPAccount"] = ""
	common.OptionMap["SMTPToken"] = ""
	common.OptionMap["SMTPSSLEnabled"] = strconv.FormatBool(common.SMTPSSLEnabled)
	common.OptionMap["Notice"] = ""
	common.OptionMap["About"] = ""
	common.OptionMap["HomePageContent"] = ""
	common.OptionMap["Footer"] = common.Footer
	common.OptionMap["SystemName"] = common.SystemName
	common.OptionMap["Logo"] = common.Logo
	common.OptionMap["ServerAddress"] = ""
	common.OptionMap["WorkerUrl"] = system_setting.WorkerUrl
	common.OptionMap["WorkerValidKey"] = system_setting.WorkerValidKey
	common.OptionMap["WorkerAllowHttpImageRequestEnabled"] = strconv.FormatBool(system_setting.WorkerAllowHttpImageRequestEnabled)
	common.OptionMap["PayAddress"] = ""
	common.OptionMap["CustomCallbackAddress"] = ""
	common.OptionMap["EpayId"] = ""
	common.OptionMap["EpayKey"] = ""
	common.OptionMap["Price"] = strconv.FormatFloat(operation_setting.Price, 'f', -1, 64)
	common.OptionMap["USDExchangeRate"] = strconv.FormatFloat(operation_setting.USDExchangeRate, 'f', -1, 64)
	common.OptionMap["MinTopUp"] = strconv.Itoa(operation_setting.MinTopUp)
	common.OptionMap["StripeMinTopUp"] = strconv.Itoa(setting.StripeMinTopUp)
	common.OptionMap["StripeApiSecret"] = setting.StripeApiSecret
	common.OptionMap["StripeWebhookSecret"] = setting.StripeWebhookSecret
	common.OptionMap["StripePriceId"] = setting.StripePriceId
	common.OptionMap["StripeUnitPrice"] = strconv.FormatFloat(setting.StripeUnitPrice, 'f', -1, 64)
	common.OptionMap["StripePromotionCodesEnabled"] = strconv.FormatBool(setting.StripePromotionCodesEnabled)
	common.OptionMap["CreemApiKey"] = setting.CreemApiKey
	common.OptionMap["CreemProducts"] = setting.CreemProducts
	common.OptionMap["CreemTestMode"] = strconv.FormatBool(setting.CreemTestMode)
	common.OptionMap["CreemWebhookSecret"] = setting.CreemWebhookSecret
	common.OptionMap["WaffoEnabled"] = strconv.FormatBool(setting.WaffoEnabled)
	common.OptionMap["WaffoApiKey"] = setting.WaffoApiKey
	common.OptionMap["WaffoPrivateKey"] = setting.WaffoPrivateKey
	common.OptionMap["WaffoPublicCert"] = setting.WaffoPublicCert
	common.OptionMap["WaffoSandboxPublicCert"] = setting.WaffoSandboxPublicCert
	common.OptionMap["WaffoSandboxApiKey"] = setting.WaffoSandboxApiKey
	common.OptionMap["WaffoSandboxPrivateKey"] = setting.WaffoSandboxPrivateKey
	common.OptionMap["WaffoSandbox"] = strconv.FormatBool(setting.WaffoSandbox)
	common.OptionMap["WaffoMerchantId"] = setting.WaffoMerchantId
	common.OptionMap["WaffoNotifyUrl"] = setting.WaffoNotifyUrl
	common.OptionMap["WaffoReturnUrl"] = setting.WaffoReturnUrl
	common.OptionMap["WaffoSubscriptionReturnUrl"] = setting.WaffoSubscriptionReturnUrl
	common.OptionMap["WaffoCurrency"] = setting.WaffoCurrency
	common.OptionMap["WaffoUnitPrice"] = strconv.FormatFloat(setting.WaffoUnitPrice, 'f', -1, 64)
	common.OptionMap["WaffoMinTopUp"] = strconv.Itoa(setting.WaffoMinTopUp)
	common.OptionMap["WaffoPayMethods"] = setting.WaffoPayMethods2JsonString()
	common.OptionMap["TopupGroupRatio"] = common.TopupGroupRatio2JSONString()
	common.OptionMap["Chats"] = setting.Chats2JsonString()
	common.OptionMap["AutoGroups"] = setting.AutoGroups2JsonString()
	common.OptionMap["DefaultUseAutoGroup"] = strconv.FormatBool(setting.DefaultUseAutoGroup)
	common.OptionMap["PayMethods"] = operation_setting.PayMethods2JsonString()
	common.OptionMap["GitHubClientId"] = ""
	common.OptionMap["GitHubClientSecret"] = ""
	common.OptionMap["TelegramBotToken"] = ""
	common.OptionMap["TelegramBotName"] = ""
	common.OptionMap["WeChatServerAddress"] = ""
	common.OptionMap["WeChatServerToken"] = ""
	common.OptionMap["WeChatAccountQRCodeImageURL"] = ""
	common.OptionMap["TurnstileSiteKey"] = ""
	common.OptionMap["TurnstileSecretKey"] = ""
	common.OptionMap["QuotaForNewUser"] = strconv.Itoa(common.QuotaForNewUser)
	common.OptionMap["QuotaForInviter"] = strconv.Itoa(common.QuotaForInviter)
	common.OptionMap["QuotaForInvitee"] = strconv.Itoa(common.QuotaForInvitee)
	common.OptionMap["QuotaRemindThreshold"] = strconv.Itoa(common.QuotaRemindThreshold)
	common.OptionMap["PreConsumedQuota"] = strconv.Itoa(common.PreConsumedQuota)
	common.OptionMap["ModelRequestRateLimitCount"] = strconv.Itoa(setting.ModelRequestRateLimitCount)
	common.OptionMap["ModelRequestRateLimitDurationMinutes"] = strconv.Itoa(setting.ModelRequestRateLimitDurationMinutes)
	common.OptionMap["ModelRequestRateLimitSuccessCount"] = strconv.Itoa(setting.ModelRequestRateLimitSuccessCount)
	common.OptionMap["ModelRequestRateLimitGroup"] = setting.ModelRequestRateLimitGroup2JSONString()
	common.OptionMap["ModelRatio"] = ratio_setting.ModelRatio2JSONString()
	common.OptionMap["ModelRatioTiered"] = ratio_setting.ModelRatioTiered2JSONString()
	common.OptionMap["ModelPrice"] = ratio_setting.ModelPrice2JSONString()
	common.OptionMap["CacheRatio"] = ratio_setting.CacheRatio2JSONString()
	common.OptionMap["CreateCacheRatio"] = ratio_setting.CreateCacheRatio2JSONString()
	common.OptionMap["GroupRatio"] = ratio_setting.GroupRatio2JSONString()
	common.OptionMap["GroupGroupRatio"] = ratio_setting.GroupGroupRatio2JSONString()
	common.OptionMap["UserUsableGroups"] = setting.UserUsableGroups2JSONString()
	common.OptionMap["CompletionRatio"] = ratio_setting.CompletionRatio2JSONString()
	common.OptionMap["ImageRatio"] = ratio_setting.ImageRatio2JSONString()
	common.OptionMap["AudioRatio"] = ratio_setting.AudioRatio2JSONString()
	common.OptionMap["AudioCompletionRatio"] = ratio_setting.AudioCompletionRatio2JSONString()
	common.OptionMap["CurrencyRates"] = ratio_setting.CurrencyRates2JSONString()
	common.OptionMap["ModelCurrency"] = ratio_setting.ModelCurrency2JSONString()
	common.OptionMap["TopUpLink"] = common.TopUpLink
	//common.OptionMap["ChatLink"] = common.ChatLink
	//common.OptionMap["ChatLink2"] = common.ChatLink2
	common.OptionMap["QuotaPerUnit"] = strconv.FormatFloat(common.QuotaPerUnit, 'f', -1, 64)
	common.OptionMap["RetryTimes"] = strconv.Itoa(common.RetryTimes)
	common.OptionMap["DataExportInterval"] = strconv.Itoa(common.DataExportInterval)
	common.OptionMap["DataExportDefaultTime"] = common.DataExportDefaultTime
	common.OptionMap["DefaultCollapseSidebar"] = strconv.FormatBool(common.DefaultCollapseSidebar)
	common.OptionMap["MjNotifyEnabled"] = strconv.FormatBool(setting.MjNotifyEnabled)
	common.OptionMap["MjAccountFilterEnabled"] = strconv.FormatBool(setting.MjAccountFilterEnabled)
	common.OptionMap["MjModeClearEnabled"] = strconv.FormatBool(setting.MjModeClearEnabled)
	common.OptionMap["MjForwardUrlEnabled"] = strconv.FormatBool(setting.MjForwardUrlEnabled)
	common.OptionMap["MjActionCheckSuccessEnabled"] = strconv.FormatBool(setting.MjActionCheckSuccessEnabled)
	common.OptionMap["CheckSensitiveEnabled"] = strconv.FormatBool(setting.CheckSensitiveEnabled)
	common.OptionMap["DemoSiteEnabled"] = strconv.FormatBool(operation_setting.DemoSiteEnabled)
	common.OptionMap["SelfUseModeEnabled"] = strconv.FormatBool(operation_setting.SelfUseModeEnabled)
	common.OptionMap["ModelRequestRateLimitEnabled"] = strconv.FormatBool(setting.ModelRequestRateLimitEnabled)
	common.OptionMap["TokenRateLimitEnabled"] = strconv.FormatBool(setting.TokenRateLimitEnabled)
	common.OptionMap["TokenRateLimitDefaultRPM"] = strconv.Itoa(setting.TokenRateLimitDefaultRPM)
	common.OptionMap["TokenRateLimitDefaultTPM"] = strconv.Itoa(setting.TokenRateLimitDefaultTPM)
	common.OptionMap["DorisLogEnabled"] = strconv.FormatBool(setting.DorisLogEnabled)
	// 侧边栏管理员默认配置（含控制台「请求日志」默认开启）；若库中已有 SidebarModulesAdmin 会在 loadOptionsFromDatabase 中覆盖
	common.OptionMap["SidebarModulesAdmin"] = `{"chat":{"enabled":true,"playground":true,"chat":true},"console":{"enabled":true,"detail":true,"token":true,"log":true,"request_logs":true,"billing":true,"midjourney":true,"task":true},"personal":{"enabled":true,"topup":true,"personal":true},"admin":{"enabled":true,"channel":true,"group":true,"models":true,"deployment":true,"redemption":true,"user":true,"subscription":true,"setting":true}}`
	common.OptionMap["CheckSensitiveOnPromptEnabled"] = strconv.FormatBool(setting.CheckSensitiveOnPromptEnabled)
	common.OptionMap["StopOnSensitiveEnabled"] = strconv.FormatBool(setting.StopOnSensitiveEnabled)
	common.OptionMap["SensitiveWords"] = setting.SensitiveWordsToString()
	common.OptionMap["StreamCacheQueueLength"] = strconv.Itoa(setting.StreamCacheQueueLength)
	common.OptionMap["AutomaticDisableKeywords"] = operation_setting.AutomaticDisableKeywordsToString()
	common.OptionMap["AutomaticDisableStatusCodes"] = operation_setting.AutomaticDisableStatusCodesToString()
	common.OptionMap["AutomaticRetryStatusCodes"] = operation_setting.AutomaticRetryStatusCodesToString()
	common.OptionMap["ExposeRatioEnabled"] = strconv.FormatBool(ratio_setting.IsExposeRatioEnabled())

	// 自动添加所有注册的模型配置
	modelConfigs := config.GlobalConfig.ExportAllConfigs()
	for k, v := range modelConfigs {
		common.OptionMap[k] = v
	}

	common.OptionMapRWMutex.Unlock()
	LoadOptionsFromDatabase()
}

func LoadOptionsFromDatabase() {
	options, _ := AllOption()
	for _, option := range options {
		err := updateOptionMap(option.Key, option.Value)
		if err != nil {
			common.SysLog("failed to update option map: " + err.Error())
		}
	}
	// 老 SeedanceConditionalRatios option 一次性迁移到通用 ConditionalRatios
	migrateLegacyConditionalRatios()
	// 把 ratio/price 类配置从内存 map 重 marshal 回 OptionMap。
	// 原因:UpdateXxxByJSONString 内部会先把 DB JSON load 进 map,再回填新版本
	// 默认 entry(避免升级时新模型默认值丢失);但 updateOptionMap 仅把 DB 原始
	// 字符串塞进 OptionMap,不感知回填。这里统一刷一次,让 admin UI 能看到
	// backfill 后的完整列表。
	syncRatioMapsToOptionMap()
}

// migrateLegacyConditionalRatios 把老的 SeedanceConditionalRatios option 一次性
// 搬到新的通用 ConditionalRatios option。schema 完全兼容,直接搬 JSON 字符串即可。
// 操作幂等:迁移完成后老 option 写空,下次启动 / sync 时不再触发。
func migrateLegacyConditionalRatios() {
	legacyKey := "SeedanceConditionalRatios"
	var legacy Option
	if err := DB.First(&legacy, Option{Key: legacyKey}).Error; err != nil {
		return // 没有老配置,跳过
	}
	if legacy.Value == "" {
		return // 已经迁移过(被清空)
	}
	common.OptionMapRWMutex.RLock()
	cur := common.OptionMap["ConditionalRatios"]
	common.OptionMapRWMutex.RUnlock()
	// 仅当目标为空或仍是注册表默认值时,把 legacy 搬过去——避免覆盖 admin 已经写过的 ConditionalRatios
	if cur == "" || cur == common.ConditionalRatioDefaultJSON() {
		if err := UpdateOption("ConditionalRatios", legacy.Value); err != nil {
			common.SysLog("migrate ConditionalRatios failed: " + err.Error())
			return
		}
		common.SysLog("migrated SeedanceConditionalRatios -> ConditionalRatios")
	}
	// 无论是否覆盖目标,都清空 legacy(写空保留行),避免后续重复触发
	if err := UpdateOption(legacyKey, ""); err != nil {
		common.SysLog("clear SeedanceConditionalRatios failed: " + err.Error())
	}
}

// syncRatioMapsToOptionMap 让 OptionMap 与内存 ratio_setting map 保持一致。
// 启动期由 LoadOptionsFromDatabase 调用;不持有 OptionMap 锁,因为各 marshaler
// 内部已加各自的 RWMutex,且 OptionMap 写入用原子 set。
func syncRatioMapsToOptionMap() {
	common.OptionMapRWMutex.Lock()
	defer common.OptionMapRWMutex.Unlock()
	common.OptionMap["ModelRatio"] = ratio_setting.ModelRatio2JSONString()
	common.OptionMap["ModelPrice"] = ratio_setting.ModelPrice2JSONString()
	common.OptionMap["CompletionRatio"] = ratio_setting.CompletionRatio2JSONString()
	common.OptionMap["CacheRatio"] = ratio_setting.CacheRatio2JSONString()
	common.OptionMap["CreateCacheRatio"] = ratio_setting.CreateCacheRatio2JSONString()
	common.OptionMap["ImageRatio"] = ratio_setting.ImageRatio2JSONString()
	common.OptionMap["AudioRatio"] = ratio_setting.AudioRatio2JSONString()
	common.OptionMap["AudioCompletionRatio"] = ratio_setting.AudioCompletionRatio2JSONString()
}

func SyncOptions(frequency int) {
	for {
		time.Sleep(time.Duration(frequency) * time.Second)
		common.SysLog("syncing options from database")
		LoadOptionsFromDatabase()
	}
}

func UpdateOption(key string, value string) error {
	// Save to database first
	option := Option{
		Key: key,
	}
	if err := DB.FirstOrCreate(&option, Option{Key: key}).Error; err != nil {
		return err
	}
	option.Value = value
	if err := DB.Save(&option).Error; err != nil {
		return err
	}
	// Update OptionMap
	err := updateOptionMap(key, value)
	// 通知其他节点刷新配置
	common.NotifyOptionChange()
	return err
}

func updateOptionMap(key string, value string) (err error) {
	common.OptionMapRWMutex.Lock()
	defer common.OptionMapRWMutex.Unlock()
	common.OptionMap[key] = value

	// 检查是否是模型配置 - 使用更规范的方式处理
	if handleConfigUpdate(key, value) {
		return nil // 已由配置系统处理
	}

	// 处理传统配置项...
	if strings.HasSuffix(key, "Permission") {
		intValue, _ := strconv.Atoi(value)
		switch key {
		case "FileUploadPermission":
			common.FileUploadPermission = intValue
		case "FileDownloadPermission":
			common.FileDownloadPermission = intValue
		case "ImageUploadPermission":
			common.ImageUploadPermission = intValue
		case "ImageDownloadPermission":
			common.ImageDownloadPermission = intValue
		}
	}
	if strings.HasSuffix(key, "Enabled") || key == "DefaultCollapseSidebar" || key == "DefaultUseAutoGroup" {
		boolValue := value == "true"
		switch key {
		case "PasswordRegisterEnabled":
			common.PasswordRegisterEnabled = boolValue
		case "PasswordLoginEnabled":
			common.PasswordLoginEnabled = boolValue
		case "EmailVerificationEnabled":
			common.EmailVerificationEnabled = boolValue
		case "GitHubOAuthEnabled":
			common.GitHubOAuthEnabled = boolValue
		case "LinuxDOOAuthEnabled":
			common.LinuxDOOAuthEnabled = boolValue
		case "WeChatAuthEnabled":
			common.WeChatAuthEnabled = boolValue
		case "TelegramOAuthEnabled":
			common.TelegramOAuthEnabled = boolValue
		case "TurnstileCheckEnabled":
			common.TurnstileCheckEnabled = boolValue
		case "RegisterEnabled":
			common.RegisterEnabled = boolValue
		case "EmailDomainRestrictionEnabled":
			common.EmailDomainRestrictionEnabled = boolValue
		case "EmailAliasRestrictionEnabled":
			common.EmailAliasRestrictionEnabled = boolValue
		case "AutomaticDisableChannelEnabled":
			common.AutomaticDisableChannelEnabled = boolValue
		case "AutomaticEnableChannelEnabled":
			common.AutomaticEnableChannelEnabled = boolValue
		case "AutomaticDisableChannelModelEnabled":
			common.AutomaticDisableChannelModelEnabled = boolValue
		case "FeishuAlertEnabled":
			common.FeishuAlertEnabled = boolValue
		case "LogConsumeEnabled":
			common.LogConsumeEnabled = boolValue
		case "DisplayInCurrencyEnabled":
			// 兼容旧字段：同步到新配置 general_setting.quota_display_type（运行时生效）
			// true -> USD, false -> TOKENS
			newVal := "USD"
			if !boolValue {
				newVal = "TOKENS"
			}
			if cfg := config.GlobalConfig.Get("general_setting"); cfg != nil {
				_ = config.UpdateConfigFromMap(cfg, map[string]string{"quota_display_type": newVal})
			}
		case "DisplayTokenStatEnabled":
			common.DisplayTokenStatEnabled = boolValue
		case "DrawingEnabled":
			common.DrawingEnabled = boolValue
		case "TaskEnabled":
			common.TaskEnabled = boolValue
		case "DataExportEnabled":
			common.DataExportEnabled = boolValue
		case "DefaultCollapseSidebar":
			common.DefaultCollapseSidebar = boolValue
		case "MjNotifyEnabled":
			setting.MjNotifyEnabled = boolValue
		case "MjAccountFilterEnabled":
			setting.MjAccountFilterEnabled = boolValue
		case "MjModeClearEnabled":
			setting.MjModeClearEnabled = boolValue
		case "MjForwardUrlEnabled":
			setting.MjForwardUrlEnabled = boolValue
		case "MjActionCheckSuccessEnabled":
			setting.MjActionCheckSuccessEnabled = boolValue
		case "CheckSensitiveEnabled":
			setting.CheckSensitiveEnabled = boolValue
		case "DemoSiteEnabled":
			operation_setting.DemoSiteEnabled = boolValue
		case "SelfUseModeEnabled":
			operation_setting.SelfUseModeEnabled = boolValue
		case "CheckSensitiveOnPromptEnabled":
			setting.CheckSensitiveOnPromptEnabled = boolValue
		case "ModelRequestRateLimitEnabled":
			setting.ModelRequestRateLimitEnabled = boolValue
		case "TokenRateLimitEnabled":
			setting.TokenRateLimitEnabled = boolValue
		case "DorisLogEnabled":
			setting.DorisLogEnabled = boolValue
		case "StopOnSensitiveEnabled":
			setting.StopOnSensitiveEnabled = boolValue
		case "SMTPSSLEnabled":
			common.SMTPSSLEnabled = boolValue
		case "WorkerAllowHttpImageRequestEnabled":
			system_setting.WorkerAllowHttpImageRequestEnabled = boolValue
		case "DefaultUseAutoGroup":
			setting.DefaultUseAutoGroup = boolValue
		case "ExposeRatioEnabled":
			ratio_setting.SetExposeRatioEnabled(boolValue)
		}
	}
	switch key {
	case "EmailDomainWhitelist":
		common.EmailDomainWhitelist = strings.Split(value, ",")
	case "SMTPServer":
		common.SMTPServer = value
	case "SMTPPort":
		intValue, _ := strconv.Atoi(value)
		common.SMTPPort = intValue
	case "SMTPAccount":
		common.SMTPAccount = value
	case "SMTPFrom":
		common.SMTPFrom = value
	case "SMTPToken":
		common.SMTPToken = value
	case "ServerAddress":
		system_setting.ServerAddress = value
	case "WorkerUrl":
		system_setting.WorkerUrl = value
	case "WorkerValidKey":
		system_setting.WorkerValidKey = value
	case "PayAddress":
		operation_setting.PayAddress = value
	case "Chats":
		err = setting.UpdateChatsByJsonString(value)
	case "AutoGroups":
		err = setting.UpdateAutoGroupsByJsonString(value)
	case "CustomCallbackAddress":
		operation_setting.CustomCallbackAddress = value
	case "EpayId":
		operation_setting.EpayId = value
	case "EpayKey":
		operation_setting.EpayKey = value
	case "Price":
		operation_setting.Price, _ = strconv.ParseFloat(value, 64)
	case "USDExchangeRate":
		operation_setting.USDExchangeRate, _ = strconv.ParseFloat(value, 64)
	case "MinTopUp":
		operation_setting.MinTopUp, _ = strconv.Atoi(value)
	case "StripeApiSecret":
		setting.StripeApiSecret = value
	case "StripeWebhookSecret":
		setting.StripeWebhookSecret = value
	case "StripePriceId":
		setting.StripePriceId = value
	case "StripeUnitPrice":
		setting.StripeUnitPrice, _ = strconv.ParseFloat(value, 64)
	case "StripeMinTopUp":
		setting.StripeMinTopUp, _ = strconv.Atoi(value)
	case "StripePromotionCodesEnabled":
		setting.StripePromotionCodesEnabled = value == "true"
	case "CreemApiKey":
		setting.CreemApiKey = value
	case "CreemProducts":
		setting.CreemProducts = value
	case "CreemTestMode":
		setting.CreemTestMode = value == "true"
	case "CreemWebhookSecret":
		setting.CreemWebhookSecret = value
	case "WaffoEnabled":
		setting.WaffoEnabled = value == "true"
	case "WaffoApiKey":
		setting.WaffoApiKey = value
	case "WaffoPrivateKey":
		setting.WaffoPrivateKey = value
	case "WaffoPublicCert":
		setting.WaffoPublicCert = value
	case "WaffoSandboxPublicCert":
		setting.WaffoSandboxPublicCert = value
	case "WaffoSandboxApiKey":
		setting.WaffoSandboxApiKey = value
	case "WaffoSandboxPrivateKey":
		setting.WaffoSandboxPrivateKey = value
	case "WaffoSandbox":
		setting.WaffoSandbox = value == "true"
	case "WaffoMerchantId":
		setting.WaffoMerchantId = value
	case "WaffoNotifyUrl":
		setting.WaffoNotifyUrl = value
	case "WaffoReturnUrl":
		setting.WaffoReturnUrl = value
	case "WaffoSubscriptionReturnUrl":
		setting.WaffoSubscriptionReturnUrl = value
	case "WaffoCurrency":
		setting.WaffoCurrency = value
	case "WaffoUnitPrice":
		setting.WaffoUnitPrice, _ = strconv.ParseFloat(value, 64)
	case "WaffoMinTopUp":
		setting.WaffoMinTopUp, _ = strconv.Atoi(value)
	case "TopupGroupRatio":
		err = common.UpdateTopupGroupRatioByJSONString(value)
	case "GitHubClientId":
		common.GitHubClientId = value
	case "GitHubClientSecret":
		common.GitHubClientSecret = value
	case "LinuxDOClientId":
		common.LinuxDOClientId = value
	case "LinuxDOClientSecret":
		common.LinuxDOClientSecret = value
	case "LinuxDOMinimumTrustLevel":
		common.LinuxDOMinimumTrustLevel, _ = strconv.Atoi(value)
	case "Footer":
		common.Footer = value
	case "SystemName":
		common.SystemName = value
	case "Logo":
		common.Logo = value
	case "WeChatServerAddress":
		common.WeChatServerAddress = value
	case "WeChatServerToken":
		common.WeChatServerToken = value
	case "WeChatAccountQRCodeImageURL":
		common.WeChatAccountQRCodeImageURL = value
	case "TelegramBotToken":
		common.TelegramBotToken = value
	case "TelegramBotName":
		common.TelegramBotName = value
	case "TurnstileSiteKey":
		common.TurnstileSiteKey = value
	case "TurnstileSecretKey":
		common.TurnstileSecretKey = value
	case "QuotaForNewUser":
		common.QuotaForNewUser, _ = strconv.Atoi(value)
	case "QuotaForInviter":
		common.QuotaForInviter, _ = strconv.Atoi(value)
	case "QuotaForInvitee":
		common.QuotaForInvitee, _ = strconv.Atoi(value)
	case "QuotaRemindThreshold":
		common.QuotaRemindThreshold, _ = strconv.Atoi(value)
	case "PreConsumedQuota":
		common.PreConsumedQuota, _ = strconv.Atoi(value)
	case "ModelRequestRateLimitCount":
		setting.ModelRequestRateLimitCount, _ = strconv.Atoi(value)
	case "ModelRequestRateLimitDurationMinutes":
		setting.ModelRequestRateLimitDurationMinutes, _ = strconv.Atoi(value)
	case "ModelRequestRateLimitSuccessCount":
		setting.ModelRequestRateLimitSuccessCount, _ = strconv.Atoi(value)
	case "ModelRequestRateLimitGroup":
		err = setting.UpdateModelRequestRateLimitGroupByJSONString(value)
	case "TokenRateLimitDefaultRPM":
		setting.TokenRateLimitDefaultRPM, _ = strconv.Atoi(value)
	case "TokenRateLimitDefaultTPM":
		setting.TokenRateLimitDefaultTPM, _ = strconv.Atoi(value)
	case "RetryTimes":
		common.RetryTimes, _ = strconv.Atoi(value)
	case "DataExportInterval":
		common.DataExportInterval, _ = strconv.Atoi(value)
	case "DataExportDefaultTime":
		common.DataExportDefaultTime = value
	case "ModelRatio":
		err = ratio_setting.UpdateModelRatioByJSONString(value)
	case "ModelRatioTiered":
		if validateErr := ratio_setting.ValidateModelRatioTieredJSON(value); validateErr != nil {
			err = validateErr
		} else {
			err = ratio_setting.UpdateModelRatioTieredByJSONString(value)
		}
	case "GroupRatio":
		err = ratio_setting.UpdateGroupRatioByJSONString(value)
	case "GroupGroupRatio":
		err = ratio_setting.UpdateGroupGroupRatioByJSONString(value)
	case "UserUsableGroups":
		err = setting.UpdateUserUsableGroupsByJSONString(value)
	case "CompletionRatio":
		err = ratio_setting.UpdateCompletionRatioByJSONString(value)
	case "ModelPrice":
		err = ratio_setting.UpdateModelPriceByJSONString(value)
	case "CacheRatio":
		err = ratio_setting.UpdateCacheRatioByJSONString(value)
	case "CreateCacheRatio":
		err = ratio_setting.UpdateCreateCacheRatioByJSONString(value)
	case "ImageRatio":
		err = ratio_setting.UpdateImageRatioByJSONString(value)
	case "AudioRatio":
		err = ratio_setting.UpdateAudioRatioByJSONString(value)
	case "AudioCompletionRatio":
		err = ratio_setting.UpdateAudioCompletionRatioByJSONString(value)
	case "CurrencyRates":
		err = ratio_setting.UpdateCurrencyRatesByJSONString(value)
	case "ModelCurrency":
		err = ratio_setting.UpdateModelCurrencyByJSONString(value)
	case "TopUpLink":
		common.TopUpLink = value
	//case "ChatLink":
	//	common.ChatLink = value
	//case "ChatLink2":
	//	common.ChatLink2 = value
	case "ChannelDisableThreshold":
		common.ChannelDisableThreshold, _ = strconv.ParseFloat(value, 64)
	case "ChannelModelHeartbeatSuccessThreshold":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			common.ChannelModelHeartbeatSuccessThreshold = v
		}
	case "ChannelModelHeartbeatIntervalSeconds":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			common.ChannelModelHeartbeatIntervalSeconds = v
		}
	case "FeishuAlertWebhookUrl":
		common.FeishuAlertWebhookUrl = value
	case "FeishuAlertSignSecret":
		common.FeishuAlertSignSecret = value
	case "FeishuAlertAppId":
		common.FeishuAlertAppId = value
	case "FeishuAlertAppSecret":
		common.FeishuAlertAppSecret = value
	case "FeishuAlertReceiveId":
		common.FeishuAlertReceiveId = value
	case "FeishuAlertReceiveIdType":
		if value == "" {
			value = "chat_id"
		}
		common.FeishuAlertReceiveIdType = value
	case "FeishuAlertDedupSeconds":
		if v, err := strconv.Atoi(value); err == nil && v >= 0 {
			common.FeishuAlertDedupSeconds = v
		}
	case "FeishuAlertEventMask":
		common.FeishuAlertEventMask = value
	case "FeishuAlertRelay5xxWindowSeconds":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			common.FeishuAlertRelay5xxWindowSeconds = v
		}
	case "FeishuAlertRelay5xxThreshold":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			common.FeishuAlertRelay5xxThreshold = v
		}
	case "FeishuAlertHeartbeatFailureLimit":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			common.FeishuAlertHeartbeatFailureLimit = v
		}
	case "AlertEmailReceivers":
		common.AlertEmailReceivers = value
	case "ConditionalRatios":
		common.SetConditionalRatios(value)
	case "ConditionalRatiosV2":
		if err := ratio_setting.UpdateConditionalRatiosV2ByJSONString(value); err != nil {
			common.SysError("ConditionalRatiosV2 parse failed: " + err.Error())
		}
	case "HomeStatsSLA":
		common.HomeStatsSLA = value
	case "HomeTestimonials":
		common.HomeTestimonials = value
	case "HomeFAQ":
		common.HomeFAQ = value
	case "HomeFooter":
		common.HomeFooter = value
	case "HomePricingDeals":
		common.HomePricingDeals = value
	case "QuotaPerUnit":
		common.QuotaPerUnit, _ = strconv.ParseFloat(value, 64)
	case "SensitiveWords":
		setting.SensitiveWordsFromString(value)
	case "AutomaticDisableKeywords":
		operation_setting.AutomaticDisableKeywordsFromString(value)
	case "AutomaticDisableStatusCodes":
		err = operation_setting.AutomaticDisableStatusCodesFromString(value)
	case "AutomaticRetryStatusCodes":
		err = operation_setting.AutomaticRetryStatusCodesFromString(value)
	case "StreamCacheQueueLength":
		setting.StreamCacheQueueLength, _ = strconv.Atoi(value)
	case "PayMethods":
		err = operation_setting.UpdatePayMethodsByJsonString(value)
	case "WaffoPayMethods":
		// WaffoPayMethods is read directly from OptionMap via setting.GetWaffoPayMethods().
		// The value is already stored in OptionMap at the top of this function (line: common.OptionMap[key] = value).
		// No additional in-memory variable to update.
	}
	return err
}

// handleConfigUpdate 处理分层配置更新，返回是否已处理
func handleConfigUpdate(key, value string) bool {
	parts := strings.SplitN(key, ".", 2)
	if len(parts) != 2 {
		return false // 不是分层配置
	}

	configName := parts[0]
	configKey := parts[1]

	// 获取配置对象
	cfg := config.GlobalConfig.Get(configName)
	if cfg == nil {
		return false // 未注册的配置
	}

	// 更新配置
	configMap := map[string]string{
		configKey: value,
	}
	config.UpdateConfigFromMap(cfg, configMap)

	// 特定配置的后处理
	if configName == "performance_setting" {
		// 同步磁盘缓存配置到 common 包
		performance_setting.UpdateAndSync()
	}
	if configName == "sentry" {
		if sentrypkg.ReinitFunc != nil {
			sentrypkg.ReinitFunc()
		}
	}

	return true // 已处理
}
