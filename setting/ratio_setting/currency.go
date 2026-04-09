package ratio_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
)

// CurrencyUSD is the canonical internal billing currency. modelRatio /
// modelPrice values are always normalized to USD before being multiplied
// by QuotaPerUnit, so this constant is the only "no-op" currency.
const CurrencyUSD = "USD"

// defaultCurrencyRates seeds the option store the first time the server
// starts. Keys are ISO currency codes; values are "1 USD = X <currency>"
// (i.e. multiply a USD amount by the rate to get the foreign amount).
//
// USD2RMB in model_ratio.go is kept as the historical default for the
// hardcoded `* RMB` ratios in defaultModelRatio. This map is the
// runtime-editable equivalent for the new per-model currency feature.
var defaultCurrencyRates = map[string]float64{
	"CNY": USD2RMB,
}

var (
	currencyRatesMap  = types.NewRWMap[string, float64]()
	modelCurrencyMap  = types.NewRWMap[string, string]()
)

func init() {
	currencyRatesMap.AddAll(defaultCurrencyRates)
}

// --- CurrencyRates option helpers ---------------------------------------------------

func CurrencyRates2JSONString() string {
	return currencyRatesMap.MarshalJSONString()
}

func UpdateCurrencyRatesByJSONString(jsonStr string) error {
	return types.LoadFromJsonStringWithCallback(currencyRatesMap, jsonStr, InvalidateExposedDataCache)
}

func GetCurrencyRatesCopy() map[string]float64 {
	return currencyRatesMap.ReadAll()
}

// GetCurrencyRate returns "1 USD = X <currency>" for the given code.
// USD always returns 1. Unknown currencies return 1 with a SysError so the
// caller falls back to no-op conversion (safer than dropping the price to 0).
func GetCurrencyRate(currency string) float64 {
	currency = normalizeCurrencyCode(currency)
	if currency == CurrencyUSD {
		return 1
	}
	rate, ok := currencyRatesMap.Get(currency)
	if !ok || rate <= 0 {
		common.SysError("currency rate not configured, falling back to USD: " + currency)
		return 1
	}
	return rate
}

// --- ModelCurrency option helpers ---------------------------------------------------

func ModelCurrency2JSONString() string {
	return modelCurrencyMap.MarshalJSONString()
}

func UpdateModelCurrencyByJSONString(jsonStr string) error {
	return types.LoadFromJsonStringWithCallback(modelCurrencyMap, jsonStr, InvalidateExposedDataCache)
}

func GetModelCurrencyCopy() map[string]string {
	return modelCurrencyMap.ReadAll()
}

// GetModelCurrency returns the currency code configured for a model, or
// USD if none is registered. The lookup mirrors GetModelRatio's matching
// strategy (FormatMatchingModelName + compact wildcard fallback) so that
// wildcard model entries inherit a single currency setting.
func GetModelCurrency(modelName string) string {
	modelName = FormatMatchingModelName(modelName)
	if currency, ok := modelCurrencyMap.Get(modelName); ok {
		return normalizeCurrencyCode(currency)
	}
	if strings.HasSuffix(modelName, CompactModelSuffix) {
		if currency, ok := modelCurrencyMap.Get(CompactWildcardModelKey); ok {
			return normalizeCurrencyCode(currency)
		}
	}
	return CurrencyUSD
}

// ConvertToUSD normalizes a raw value (already-stored ratio or per-call
// price) to its USD equivalent using the configured static rate.
//
//	usdValue = rawValue / rate
//
// where rate = "1 USD = X currency". USD or unknown currencies are passed
// through unchanged.
func ConvertToUSD(rawValue float64, currency string) float64 {
	currency = normalizeCurrencyCode(currency)
	if currency == CurrencyUSD {
		return rawValue
	}
	rate := GetCurrencyRate(currency)
	if rate <= 0 {
		return rawValue
	}
	return rawValue / rate
}

// ConvertModelValueToUSD looks up the model's currency and normalizes
// rawValue to USD. Used by GetModelRatio / GetModelPrice and the *Copy
// helpers so all callers downstream see USD-equivalent numbers.
func ConvertModelValueToUSD(modelName string, rawValue float64) float64 {
	return ConvertToUSD(rawValue, GetModelCurrency(modelName))
}

func normalizeCurrencyCode(code string) string {
	code = strings.TrimSpace(strings.ToUpper(code))
	if code == "" {
		return CurrencyUSD
	}
	return code
}
