# 价格配置

## 概述

后台「价格配置」(`web/src/components/settings/RatioSetting.jsx`)是 admin 控制每一次 API 调用最终扣费金额的中枢。它由 7 个 Tab 组成,分别管理「按 token 倍率计费」「按次计费」「分组打折」「条件分价」「币种换算」「上游同步」「未配置模型自检」等维度。

本文档解释每个 Tab 背后的 option、计费公式与典型用法,以及它们之间的依赖关系。改动 admin UI 即时生效——保存后通过 `model.UpdateOption` 写入数据库,内存 `OptionMap` 同步刷新。

---

## 计费总公式

每次 API 请求,系统在 `service/billing_session.go` 中按下式预扣并最终结算:

```
quota = baseUnit × ModelRatio × CompletionRatio × CacheRatio × ∏OtherRatios × GroupRatio × QuotaPerUnit
```

其中:

| 因子 | 来源 | Tab |
|------|------|------|
| `baseUnit` | 输入 / 输出 token 数,或图像 / 音频帧数 | — |
| `ModelRatio` | 单模型基准价系数 | Tab 1 |
| `CompletionRatio` | 输出 token 相对输入的倍数 | Tab 1 |
| `CacheRatio` / `CreateCacheRatio` | 缓存读 / 写折扣 | Tab 1 |
| `ImageRatio` / `AudioRatio` / `AudioCompletionRatio` | 图像 / 音频专用倍率 | Tab 1 |
| `OtherRatios` | 条件分价乘子(如 1080p / draft / 含视频输入) | Tab 7 |
| `GroupRatio` | 用户分组折扣 | Tab 2 |
| `QuotaPerUnit` | 把美元价转成内部 quota 整数单位的常数 | 系统设置 |

按次计费的模型(MidJourney / Suno 等)走另一条路径:

```
quota = ModelPrice × QuotaPerUnit × GroupRatio
```

详见 Tab 3。

---

## Tab 1. 模型倍率设置(ModelRatioSettings)

按 token 计费的核心 Tab,统一管理 7 个 option。

| Option key | 含义 | 数据形态 |
|------------|------|----------|
| `ModelRatio` | 模型基准倍率(USD / 1K input token 的相对系数) | `{"gpt-4o":2.5, ...}` |
| `CompletionRatio` | 输出 token 相对输入的价格倍数(默认 1) | `{"gpt-4o":4, ...}` |
| `CacheRatio` | 缓存命中读取的价格折扣(默认 1,Anthropic ≈ 0.1) | `{"claude-...":0.1}` |
| `CreateCacheRatio` | 缓存创建写入的额外溢价(默认 1,Anthropic 5m ≈ 1.25) | `{"claude-...":1.25}` |
| `ImageRatio` | 图像类输入 / 输出的单位倍率 | `{"gpt-4o":...}` |
| `AudioRatio` / `AudioCompletionRatio` | 音频输入 / 输出倍率 | `{"gpt-4o-audio":...}` |

**典型场景**:新接入一个模型时,在「未设置价格模型」Tab(Tab 4)看到它,然后回到本 Tab 配 `ModelRatio` + `CompletionRatio`。如果模型支持 prompt cache,补 `CacheRatio` / `CreateCacheRatio`。

**默认值的来源**:`setting/ratio_setting/model_ratio.go` 里的 `defaultModelRatio`,upgrade 时新模型会被 backfill 到 admin 配置中——admin 已配过的不会被覆盖。

---

## Tab 2. 分组相关设置(GroupRatioSettings)

按用户分组进行差异化定价 / 模型授权的核心 Tab。

| Option key | 含义 |
|------------|------|
| `GroupRatio` | 一维分组倍率: `{"vip":0.5, "default":1.0, "guest":2.0}` |
| `GroupGroupRatio` | 二维「用户分组 × 渠道分组」矩阵: `{"vip":{"gpt":0.4, "claude":0.5}}` |
| `UserUsableGroups` | 普通用户可见 / 可用的分组白名单 |
| `AutoGroups` | 用户首次登录自动归入的分组 |
| `DefaultUseAutoGroup` | 是否启用「自动分组」逻辑 |
| `ExposeRatioEnabled` | 是否在用户端显示具体倍率值(关闭则只显示价格) |
| `group_ratio_setting.group_special_usable_group` | 某些分组允许跨组使用其它分组模型的特殊授权 |

**计费时的查询顺序**(`HandleGroupRatio`):

1. 优先 `GetGroupGroupRatio(userGroup, channelGroup)` —— 二维矩阵
2. fallback `GetGroupRatio(userGroup)` —— 一维倍率
3. 都没有 → 1.0(原价)

**示例**:VIP 用户调 `gpt` 渠道分组,矩阵 `vip→gpt = 0.4` 命中,即使他默认 `GroupRatio["vip"]=0.6` 也用 0.4。

---

## Tab 3. 价格设置(ModelSettingsVisualEditor)

对应 `ModelPrice` option,**按次计费**(per-call billing)的模型在这里配置。与 Tab 1 的「按 token 倍率」是两条**独立**的链路。

```
按次计费 quota = ModelPrice × QuotaPerUnit × GroupRatio
```

**触发**:`ModelPriceHelper` 检查 `ModelPrice` 是否有该模型的条目,有则走按次链路,**不应用 CompletionRatio / CacheRatio**。

**典型用例**:

- MidJourney(每张 0.04 USD)
- Suno(每首歌 0.05 USD)
- DALL-E(每张 0.04 USD)
- Seedream / Seedance 视频 / 图像如果运维选择按次而不是按 token 计费

**Token 计费 vs 按次计费**:同一个模型只能在一种链路里——`ModelPrice` 优先,有则按次,否则走 `ModelRatio`。

---

## Tab 4. 未设置价格模型(ModelRatioNotSetEditor)

工具页,**不直接产生计费**。

它对比 `/api/channel/models_enabled` 返回的所有已启用模型 vs `ModelRatio` + `ModelPrice` 已配置的模型,列出**遗漏未定价**的模型。admin 在这里点「快速配置」,会跳到 Tab 1 / Tab 3 进行设置,设置完后该模型自动从列表中消失。

**作用**:防止新接入的渠道因为没配价被「免费白嫖」。

---

## Tab 5. 上游倍率同步(UpstreamRatioSync)

从已配置的某条「上游通道」(或公开数据源 models.dev)拉取最新的 `model_ratio` / `completion_ratio` / `cache_ratio` / `model_price`,与本地配置对比并支持批量更新。

**流程**:

```
[选择上游] → FetchUpstreamRatios(并发拉取)
       ↓
[与本地 OptionMap 中的 ratio JSON 做 diff]
       ↓
[展示冲突列表 — admin 勾选要应用的项]
       ↓
[确认应用 → 批量 UpdateOption]
```

适合周期性把价格表同步到上游(比如每月 OpenAI 调价)。

---

## Tab 6. 汇率设置(CurrencySettings)

支持模型用**非 USD 币种**报价(比如火山方舟用 RMB / Anthropic 用 USD),系统内部统一以 USD 标准计算。

| Option key | 含义 |
|------------|------|
| `CurrencyRates` | 汇率表: `{"CNY": 7.3, "EUR": 0.92}` 表示 1 USD = 7.3 CNY |
| `ModelCurrency` | 每个模型的报价币种: `{"doubao-seedance-1-5-pro":"CNY", "gpt-4o":"USD"}` |

**换算公式**:

```
USD 标准价 = 本币价格 / CurrencyRates[币种]
```

**典型场景**:火山方舟 PDF 价格表全是 RMB,在 Tab 1 直接填 RMB 数字,然后 Tab 6 配 `ModelCurrency["doubao-..."]="CNY"`,系统按当前汇率把 RMB 换算成 USD 做最终扣费。

---

## Tab 7. 条件分价(ConditionalRatioSettings)

按**请求参数变化**对单一模型应用不同乘子。例如 Seedance 视频:

- 同样 token 数,1080p 比 720p 贵
- 输入含视频会比纯文生视频贵 / 便宜
- 1.5 pro 的 draft 模式有 0.6× / 0.35× 折扣

**Option key**: `ConditionalRatios`(JSON):

```json
{
  "enabled": true,
  "models": {
    "seedance-2-0": {
      "1080p_with_video": {"enabled": true, "multiplier": 0.674},
      "1080p_no_video":   {"enabled": true, "multiplier": 1.109},
      "720p_with_video":  {"enabled": true, "multiplier": 0.609}
    }
  }
}
```

### 数据流

```
adapter init() → common.RegisterConditionalRatioFamily(family 元数据)
                          ↓
admin 在 UI 上 GET /api/option/conditional_ratios/families 拉注册表渲染
                          ↓
admin 改乘子 → PUT /api/option/ → DB
                          ↓
adapter.AdjustBillingOnSubmit:
  - 解析请求体里的条件参数(generate_audio / draft / resolution / has_video_input)
  - 调 common.GetConditionalRatio(family, condKey) 拿乘子
  - 返回 map → 框架写入 BillingContext.OtherRatios
                          ↓
预扣费时 OtherRatios 参与上面计费总公式
                          ↓
任务终态 adapter.AdjustBillingOnComplete 用真实 token × 所有比率重算实际扣费,
框架补扣 / 退还差额。
```

### 关键设计

- **后端注册 + 前端通用**:每个支持条件分价的 channel 在自己的 `init()` 里注册 family 元数据(key / label / 条件列表 / 默认乘子);前端 UI 不感知具体业务,纯按注册表渲染。
- **新增族 = 写一个 register.go**:不改前端、不改 schema。例如 Kling 接入只需 `relay/channel/task/kling/conditional_register.go` 的 init() 调一次 `RegisterConditionalRatioFamily(...)` + adaptor 实现 `AdjustBillingOnSubmit` 提取参数并查 `GetConditionalRatio`。
- **总开关一关全失效**:`enabled=false` 时所有 family 不应用乘子,模型按基准 ModelRatio 计费。
- **缺失项 backfill**:adapter 注册了新 condition 但 admin 还没保存过,默认 `multiplier=DefaultMul, enabled=true` 即时生效,不需要 admin 主动操作。

### 当前已注册族(2026-05)

| Family key | 来源 | 条件数 |
|------------|------|--------|
| `seedance-1-5-pro` | doubao | silent / draft_audio / draft_silent |
| `seedance-2-0` | doubao | 1080p_no_video / 720p_with_video / 1080p_with_video |
| `seedance-2-0-fast` | doubao | with_video |

---

## option 与 admin 操作的对应表速查

| Tab | option keys |
|-----|-------------|
| 1 模型倍率设置 | `ModelRatio` `CompletionRatio` `CacheRatio` `CreateCacheRatio` `ImageRatio` `AudioRatio` `AudioCompletionRatio` |
| 2 分组相关设置 | `GroupRatio` `GroupGroupRatio` `UserUsableGroups` `AutoGroups` `DefaultUseAutoGroup` `ExposeRatioEnabled` `group_ratio_setting.group_special_usable_group` |
| 3 价格设置 | `ModelPrice` |
| 4 未设置价格模型 | (无独立 option,只读 `ModelRatio` + `ModelPrice` 做 diff) |
| 5 上游倍率同步 | (写 Tab 1 / Tab 3 的 option) |
| 6 汇率设置 | `CurrencyRates` `ModelCurrency` |
| 7 条件分价 | `ConditionalRatios` |

---

## 常见疑问

### Q1. ModelRatio 和 ModelPrice 同时配了会怎样?

`ModelPriceHelper` 优先检查 `ModelPrice`,命中即按次计费,完全忽略 `ModelRatio` / `CompletionRatio` / `CacheRatio`。如果想恢复按 token 计费,**删掉 `ModelPrice` 的对应条目**(置 0 不行——0 元被解释为「免费模型」)。

### Q2. 新加了模型却没看到价格生效?

按这个顺序检查:

1. `/api/channel/models_enabled` 返回里有这个模型吗?(没有→是渠道没启用或模型表没注册)
2. Tab 4「未设置价格模型」里出现了吗?(出现了说明 ModelRatio 也没配)
3. Tab 1 里手动配 `ModelRatio` 后保存,刷新前端再 dispatch 一次请求看 log

### Q3. Seedance 计费实际扣多少 ≠ 我预期?

按以下顺序排查(优先级从高到低):

1. **总开关**:Tab 7 总开关是否启用
2. **基准价**:Tab 1 的 `ModelRatio["doubao-seedance-..."]` 是不是 PDF 文档里的「主流场景」基准价(1.5 pro 有声 720p / 2.0 系列 720p 输入不含视频)
3. **币种换算**:Tab 6 的 `ModelCurrency["doubao-seedance-..."]="CNY"` 是否设置;`CurrencyRates["CNY"]` 是否为当前实际汇率
4. **条件命中**:看请求 body 的 `generate_audio` / `draft` / `resolution` / 是否含 video_url,推断条件 key,再去 Tab 7 看该 key 的 multiplier 与 enabled
5. **分组**:看用户分组的 `GroupRatio` 是否打折

最终扣费 = `total_tokens × ModelRatio[基准] × multiplier(条件) × GroupRatio × QuotaPerUnit / CurrencyRates[币种]`。

### Q4. 上游倍率同步会覆盖我手动配的值吗?

不会自动覆盖。Tab 5 拉到的 diff 列表会让 admin 勾选要应用的项,**未勾选不会写入**。如果你担心同步把折扣价改回原价,只勾选你不在意的模型即可。

### Q5. 怎么给「VIP 分组用 Claude」单独打折?

Tab 2 的 `GroupGroupRatio`:

```json
{"vip": {"claude": 0.6}}
```

意为 VIP 用户走 claude 渠道分组时倍率 0.6。如果只在 `GroupRatio["vip"]=1.0` 里全局配,没法做到「只对某个渠道分组打折」。

---

## 相关核心文件

| 文件 | 职责 |
|------|------|
| `web/src/components/settings/RatioSetting.jsx` | 7 个 Tab 容器 |
| `web/src/pages/Setting/Ratio/*.jsx` | 各 Tab 编辑器实现 |
| `setting/ratio_setting/model_ratio.go` | `ModelRatio` / `CompletionRatio` 等的解析、查询、默认 backfill |
| `setting/ratio_setting/group_ratio.go` | `GroupRatio` / `GroupGroupRatio` 查询 |
| `setting/ratio_setting/cache_ratio.go` | `CacheRatio` / `CreateCacheRatio` 查询 |
| `setting/ratio_setting/currency.go` | `CurrencyRates` / `ModelCurrency` 与换算 |
| `common/conditional_ratio.go` | `ConditionalRatios` 注册表 + 配置 store + `GetConditionalRatio` |
| `relay/channel/task/doubao/seedance_register.go` | Seedance 3 个族的注册范式 |
| `relay/channel/task/doubao/pricing.go` | Seedance 条件提取与乘子计算 |
| `service/billing_session.go` | 预扣费、结算、退款的总入口 |
| `service/text_quota.go` | 按 token 计费的具体公式 |
| `relay/helper/model_price_helper.go` | 按次 / 按 token 链路分流 |
| `model/option.go` | OptionMap 注册、`LoadOptionsFromDatabase`、迁移逻辑 |

---

## 相关文档

- [billing-and-quota.md](./billing-and-quota.md) — 预扣费 / 结算 / 退款的完整流程
- [model-channel-config.md](./model-channel-config.md) — 模型 + 渠道的关联配置
- [channel-affinity.md](./channel-affinity.md) — 用户/模型 → 渠道亲和缓存
