package service

import (
	"regexp"
	"strings"
)

// 模型 → 品牌解析表。移植自上游前端 web/src/lib/model-provider.ts,
// 保留其「特定品牌优先于宽泛模型族」的有序匹配语义:
//   - 先跑一遍 primary(keywords / pattern),命中即返回;
//   - 都不中再跑一遍 fallback(fallbackKeywords / fallbackPattern)。
// 这样 360gpt 先于 GPT、Perplexity 的 sonar / NVIDIA 的 nemotron 先于 Llama、
// text-embedding-v3 归 Qwen 而非 OpenAI、step-tts-mini 归 StepFun 而非 OpenAI。
//
// domestic 标记该品牌是否国产,供首页「只展示国产模型」过滤使用。
// 语义模糊的按海外从严处理(Jina 柏林、Black Forest 德国),因为首页要求只展示国产,
// 漏掉一个国产模型只是少展示,放进一个海外模型才是违背要求。
//
// Go 的 RE2 不支持 lookahead,原 JS 正则里的 (?=$|[-._:]) 改写为消费定界符的
// 等价形式 (?:$|[-._:]),对布尔匹配等价。

type modelProviderRule struct {
	name             string
	domestic         bool
	keywords         []string
	pattern          *regexp.Regexp
	fallbackKeywords []string
	fallbackPattern  *regexp.Regexp
}

func (r *modelProviderRule) matchPrimary(m string) bool {
	for _, kw := range r.keywords {
		if strings.Contains(m, kw) {
			return true
		}
	}
	return r.pattern != nil && r.pattern.MatchString(m)
}

func (r *modelProviderRule) matchFallback(m string) bool {
	for _, kw := range r.fallbackKeywords {
		if strings.Contains(m, kw) {
			return true
		}
	}
	return r.fallbackPattern != nil && r.fallbackPattern.MatchString(m)
}

var modelProviderRules = []modelProviderRule{
	{name: "360 AI", domestic: true, keywords: []string{"360gpt", "360zhinao"}},
	{name: "Perplexity", keywords: []string{"perplexity", "sonar-"}},
	{name: "NVIDIA", keywords: []string{"nvidia/", "nvidia.", "nemotron"}},
	{
		name:             "OpenAI",
		keywords:         []string{"openai/", "openai.", "gpt-", "chatgpt-", "codex-", "dall-e-", "whisper-", "omni-moderation-", "text-moderation-", "text-embedding-ada-", "text-embedding-3-", "text-ada-", "text-babbage-", "text-curie-", "davinci-", "babbage-", "computer-use-preview", "sora"},
		pattern:          regexp.MustCompile(`(?:^|[/.:])(?:o[134](?:$|[-.:])|tts-)`),
		fallbackKeywords: []string{"text-embedding-", "omni-moderation", "dall-e", "whisper", "tts-"},
		fallbackPattern:  regexp.MustCompile(`\bo[134](?:-|$)`),
	},
	{name: "Anthropic", keywords: []string{"anthropic", "claude"}},
	{name: "Gemini", keywords: []string{"gemini", "gemma", "learnlm", "imagen", "veo", "nano-banana", "palm-"}, pattern: regexp.MustCompile(`(?:^|[/.:])aqa$`)},
	{name: "xAI", keywords: []string{"x-ai/", "xai/", "xai-", "grok"}},
	{name: "DeepSeek", domestic: true, keywords: []string{"deepseek"}},
	{name: "Qwen", domestic: true, keywords: []string{"qwen", "qwq-", "qvq-", "tongyi", "gte-"}, pattern: regexp.MustCompile(`(?:^|[/.:])(?:text-embedding-v\d+|gui-plus|z-image)(?:$|[-_.:])`)},
	{name: "Wan", domestic: true, pattern: regexp.MustCompile(`(?:^|[/.:])wan(?:x?\d|[-_])`)},
	{name: "Moonshot", domestic: true, keywords: []string{"moonshot", "kimi-"}},
	{name: "MiniMax", domestic: true, keywords: []string{"minimax", "abab", "hailuo"}, pattern: regexp.MustCompile(`^(?:t2v|i2v|s2v)-01(?:-|$)`)},
	{name: "Doubao", domestic: true, keywords: []string{"doubao", "volcengine", "seedance", "seedream", "seed-1-"}},
	{name: "Zhipu", domestic: true, keywords: []string{"zhipu", "zai-org", "thudm", "chatglm", "cogview", "cogvideo"}, pattern: regexp.MustCompile(`(?:^|[/._-])glm(?:$|[-._])`), fallbackKeywords: []string{"glm-"}},
	{name: "Baidu", domestic: true, keywords: []string{"baidu", "wenxin", "ernie"}},
	{name: "Yi", domestic: true, keywords: []string{"01-ai/"}, pattern: regexp.MustCompile(`(?:^|[/.:])yi(?:$|[-_])`), fallbackKeywords: []string{"yi-"}},
	{name: "iFlytek", domestic: true, keywords: []string{"iflytek", "sparkdesk"}, fallbackKeywords: []string{"spark"}},
	{name: "Tencent", domestic: true, keywords: []string{"tencent", "hunyuan"}, pattern: regexp.MustCompile(`(?:^|[/.:])hy\d*(?:$|[-_.:])`)},
	{name: "Baichuan", domestic: true, keywords: []string{"baichuan"}},
	{name: "InternLM", domestic: true, keywords: []string{"internlm"}},
	{name: "StepFun", domestic: true, keywords: []string{"stepfun", "step-"}},
	{name: "MiMo", domestic: true, keywords: []string{"xiaomi", "mimo-"}},
	{name: "Mistral", keywords: []string{"mistral", "mixtral", "codestral", "ministral", "pixtral", "magistral"}},
	{name: "Meta", keywords: []string{"meta-llama", "llama-", "llama2", "llama3"}, fallbackKeywords: []string{"meta-"}},
	{name: "Cohere", keywords: []string{"cohere", "command-", "c4ai-aya", "aya-"}, pattern: regexp.MustCompile(`(?:^|[/.:])command$`)},
	{name: "Jina", keywords: []string{"jinaai", "jina-"}},
	{name: "BAAI", domestic: true, keywords: []string{"baai/", "bge-"}},
	{name: "Black Forest Labs", keywords: []string{"black-forest-labs", "flux."}},
	{name: "Microsoft", keywords: []string{"microsoft/"}, pattern: regexp.MustCompile(`(?:^|[/.:])phi(?:$|[-._])`)},
	{name: "Amazon", keywords: []string{"amazon/", "amazon.", "nova-", "titan-"}},
	{name: "AI21 Labs", keywords: []string{"ai21", "jamba"}},
	{name: "Stability AI", keywords: []string{"stabilityai", "stable-diffusion", "stable-image", "sdxl-"}},
	{name: "Nous Research", keywords: []string{"nousresearch", "hermes-"}},
	{name: "Midjourney", keywords: []string{"midjourney", "mj_", "mj-", "swap_face"}},
	{name: "Kling", domestic: true, keywords: []string{"kling"}},
	{name: "Vidu", domestic: true, keywords: []string{"vidu"}},
	{name: "Suno", keywords: []string{"suno"}},
	{name: "Jimeng", domestic: true, keywords: []string{"jimeng"}},
}

// resolveModelProvider 把模型名解析到品牌。ok=false 表示无法识别。
func resolveModelProvider(modelName string) (name string, domestic bool, ok bool) {
	m := strings.ToLower(strings.TrimSpace(modelName))
	if m == "" {
		return "", false, false
	}
	for i := range modelProviderRules {
		if modelProviderRules[i].matchPrimary(m) {
			return modelProviderRules[i].name, modelProviderRules[i].domestic, true
		}
	}
	for i := range modelProviderRules {
		if modelProviderRules[i].matchFallback(m) {
			return modelProviderRules[i].name, modelProviderRules[i].domestic, true
		}
	}
	return "", false, false
}

// domesticVendorZhKeywords 兜底:当模型名解析不出品牌、且厂商名是中文时用。
// 只列英文品牌解析覆盖不到的中文厂商标识。
var domesticVendorZhKeywords = []string{
	"阿里", "通义", "千问", "智谱", "百度", "文心", "讯飞", "星火", "腾讯", "混元",
	"字节", "豆包", "火山", "月之暗面", "阶跃", "零一", "万物", "商汤", "百川", "面壁",
	"书生", "智源", "快手", "可灵", "生数", "即梦", "昆仑", "天工", "海螺", "小米", "蚂蚁",
}

// isDomesticModel 判定模型是否国产,供首页「只展示国产模型」过滤。
// 先按模型名解析品牌(权威:海外品牌直接判否),解析不出再看厂商名与中文兜底。
func isDomesticModel(vendorName, modelName string) bool {
	if _, domestic, ok := resolveModelProvider(modelName); ok {
		return domestic
	}
	if _, domestic, ok := resolveModelProvider(vendorName); ok {
		return domestic
	}
	hay := strings.ToLower(vendorName + " " + modelName)
	for _, kw := range domesticVendorZhKeywords {
		if strings.Contains(hay, kw) {
			return true
		}
	}
	return false
}
