package model

// 首页 4 个 option 的默认值。所有都是字符串(JSON)形式存储,
// 由 controller/home_dashboard.go 解析后下发给前端。
// 管理员可在「运营设置 → 首页配置」页面通过表单覆盖。

func defaultHomeTestimonialsJSON() string {
	return `[
  {
    "quote": "我们一个项目同时调 GPT、Claude、DeepSeek，以前要管 3 套 key，现在一个 BASE_URL 全搞定。",
    "name": "陈先生",
    "title": "SaaS 公司 CTO",
    "avatar": "from-orange-400 to-pink-500"
  },
  {
    "quote": "我不会写代码但喜欢用 AI 出图。在创作中心试了 Seedream、Midjourney、Flux，直接对比效果选最满意的。",
    "name": "@digital_lily",
    "title": "独立创作者",
    "avatar": "from-purple-400 to-blue-500"
  },
  {
    "quote": "自动重路由是真香。前几天主渠道间歇性挂，我们没察觉，因为请求自动切到备用去了，业务不停摆。",
    "name": "王同学",
    "title": "AI 应用开发者",
    "avatar": "from-emerald-400 to-teal-500"
  }
]`
}

func defaultHomeFAQJSON() string {
	return `[
  {
    "question": "注册送的体验额度能用多久？",
    "answer": "够调用 GPT 类模型约 25 万 tokens（≈ 17 万字），DeepSeek 约 500 万 tokens。基本能让你试遍所有热门模型。"
  },
  {
    "question": "为什么比官方便宜？",
    "answer": "规模化采购 + 多家供应商对比 + 智能路由到当前最便宜的渠道。同样的 prompt，我们替你选最优解。"
  },
  {
    "question": "支持哪些客户端？",
    "answer": "完全 OpenAI 兼容，所有支持 OpenAI API 的客户端都能直接用：ChatBox、Cherry Studio、NextChat、Open WebUI、Cursor、LobeChat 等等。"
  },
  {
    "question": "能在国内直接用吗？需要梯子吗？",
    "answer": "不需要。所有海外模型（GPT、Claude、Gemini）都通过国内 CDN 节点中转，无需任何代理。延迟通常 < 200ms。"
  },
  {
    "question": "充值的额度会过期吗？",
    "answer": "永不过期，按实际调用扣费，余额可在控制台随时查看。"
  }
]`
}

func defaultHomeFooterJSON() string {
	return `{
  "tagline": "统一的 AI 模型聚合与分发网关",
  "columns": [
    {
      "title": "产品",
      "links": [
        { "text": "模型广场", "url": "/marketplace" },
        { "text": "创作中心", "url": "/creation" },
        { "text": "Playground", "url": "/console/playground" },
        { "text": "价格", "url": "/pricing" }
      ]
    },
    {
      "title": "开发者",
      "links": [
        { "text": "文档", "url": "/docs" },
        { "text": "控制台", "url": "/console" },
        { "text": "GitHub", "url": "https://github.com/QuantumNous/new-api" }
      ]
    },
    {
      "title": "公司",
      "links": [
        { "text": "关于我们", "url": "/about" },
        { "text": "用户协议", "url": "/user-agreement" },
        { "text": "隐私政策", "url": "/privacy-policy" }
      ]
    }
  ],
  "copyright": "© 2026 QuantumNous"
}`
}

// defaultHomePricingDealsJSON 返回首页主推优惠模型的默认配置。
// admin 可在「运营设置 → 首页配置 → 价格优惠」表单中覆盖。
//
// 字段:
//   model:          模型展示名(对应模型表里的 model_name 或自定义文案)
//   vendor:         厂商徽章("OpenAI" / "Anthropic" / ...)
//   official_price: 官方公开价(数字,展示用)
//   our_price:      我方价(数字,可能等于实际计费价,也可能是限时活动价)
//   unit:           计价单位文案("美元/M tokens (输入)" / "元/M tokens" / "元/张")
//   tagline:        可选副标题/徽章文案("限时" / "热门" / "本月主推")
//   highlight:      是否突出展示(中间一张设 true 视觉更醒目)
func defaultHomePricingDealsJSON() string {
	return `[
  {
    "model": "GPT-4o",
    "vendor": "OpenAI",
    "official_price": 5.00,
    "our_price": 2.50,
    "unit": "美元/M tokens (输入)",
    "tagline": "对标官方",
    "highlight": false
  },
  {
    "model": "Claude Sonnet 4",
    "vendor": "Anthropic",
    "official_price": 3.00,
    "our_price": 1.50,
    "unit": "美元/M tokens (输入)",
    "tagline": "本月主推",
    "highlight": true
  },
  {
    "model": "DeepSeek-V3",
    "vendor": "DeepSeek",
    "official_price": 2.00,
    "our_price": 1.00,
    "unit": "元/M tokens (输入)",
    "tagline": "国内首选",
    "highlight": false
  }
]`
}
