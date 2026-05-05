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
        { "text": "模型广场", "url": "/models" },
        { "text": "创作中心", "url": "/creation" },
        { "text": "Playground", "url": "/playground" },
        { "text": "价格", "url": "/pricing" }
      ]
    },
    {
      "title": "开发者",
      "links": [
        { "text": "文档", "url": "/docs" },
        { "text": "API 参考", "url": "/docs/api" },
        { "text": "SDK", "url": "/docs/sdk" },
        { "text": "状态页", "url": "/status" }
      ]
    },
    {
      "title": "公司",
      "links": [
        { "text": "关于我们", "url": "/about" },
        { "text": "联系商务", "url": "/contact" },
        { "text": "服务条款", "url": "/terms" },
        { "text": "隐私政策", "url": "/privacy" }
      ]
    }
  ],
  "copyright": "© 2026 QuantumNous"
}`
}
