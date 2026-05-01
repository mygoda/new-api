# 创作中心（Creation Center）产品设计文档

> 版本：v0.2（草案）
> 作者：产品 / Claude
> 日期：2026-04-30
> 状态：评审前
> 关联模块：Playground（操练场）、Task（任务）、Midjourney、Pricing（模型定价）
> 主要参考竞品：[pollo.ai](https://pollo.ai/)（多模型视频生成聚合器）

---

## 更新记录

- **v0.2（2026-04-30）**：新增「§5 视频生成详细参数设计」，对齐 pollo.ai 的子模式划分（T2V / I2V / Keyframes / Reference / Remix），完整覆盖现有 6 个后端视频适配器（Sora、Kling、Jimeng、Vidu、Hailuo、Doubao）；补充 §6「参数归一化与协议映射」描述统一前端参数→各适配器的转换层。后续节号递增。
- **v0.1（2026-04-30）**：初稿，确定整体架构、IA、MVP 范围与分阶段交付。

---

## 1. 背景与目标

### 1.1 现状

new-api 已经在「操练场（Playground）」中提供了一个面向 **文本对话/Chat Completions** 的调试与试用界面：消息列表 + 参数面板 + 调试面板 + 自定义请求体。它对纯文本和 Vision 类对话已经能用，但对**生成式多模态模型**几乎不可用：

- **文生图 / 图生图**：OpenAI `images/generations`、`images/edits`、Midjourney `submit/imagine`、Jimeng、豆包文生图、Doubao Seedream、Recraft、Replicate 等需要的是「Prompt → 多张候选图 → 局部重绘 / Upscale / Variation」的工作流，而不是消息列表。
- **文生视频 / 图生视频**：Sora、Kling、Vidu、Hailuo、豆包 Seedance、Jimeng 视频、Replicate Video 等是**异步任务**（提交 → 轮询/WebHook → 取回素材），现有 Playground 的「同步发消息」交互完全无法承载。
- **音频生成（Suno / TTS）**：Suno 是异步任务、TTS 是流式音频，也不适合放进对话框。

后台能力其实已经齐全：路由、Adapter、Task 模型、计费、按 `EndpointType`（`image-generation` / `openai-video` 等）筛选模型——但**前台没有匹配的载体**。用户要试用一个文生视频模型，目前要么自己写 cURL，要么去找第三方调试工具，新用户体验断层严重。

### 1.2 目标

打造**「创作中心」**：一个面向**多模态生成模型**的统一试用与日常创作工作台，让用户像在 Midjourney Web、Krea、Sora、ComfyUI 这类创作工具里一样：

1. **选择模态 → 选择模型 → 写提示词 → 调参 → 生成 → 浏览作品**，全流程不用离开 new-api。
2. 兼容 new-api 现有所有的多模态上游能力（OpenAI Image/Video、MJ、Suno、Kling、Jimeng、Vidu、Hailuo、Sora、Doubao、Replicate、Vertex Imagen 等）。
3. 异步任务的提交、进度、结果、失败重试、计费回执，对用户**完全可见**。
4. 与 Playground 形成清晰互补：**Playground 服务文本/Chat 调试，创作中心服务多模态创作**。

### 1.3 非目标（v1 不做）

- ❌ 不做 ComfyUI 那种**节点式工作流编排**（节点连线、复杂 pipeline）。v1 只服务「单步生成」。
- ❌ 不做**多人协作 / 评论 / 公开画廊**。作品默认私有、仅自己可见。
- ❌ 不做**模型微调入口**（LoRA 上传、训练）——后台还没这个能力。
- ❌ 不做**后期编辑器**（蒙版绘制、抠图、合成）。仅在模型本身支持时（如 `images/edits`）通过 SDK 暴露。
- ❌ 不替换 Playground——两者并存，分工明确。

---

## 2. 目标用户与场景

### 2.1 用户画像

| 画像 | 占比预估 | 主要诉求 | 现状痛点 |
|---|---|---|---|
| **API 集成开发者**（核心） | ~50% | 在接入前快速验证某个图/视频模型是否可用、参数怎么调、出图质量、计费多少 | 没有可视化界面，只能写 cURL；MJ Proxy 协议复杂；视频任务要自己实现轮询 |
| **内部业务测试 / PM** | ~25% | 给业务方看「这个模型能不能做我们的需求」，不想让他们用 cURL | 操练场只能跑文本，给业务方看图/视频还得截图拼凑 |
| **C 端轻度创作者** | ~20% | 在 new-api 充值后，直接用平台试用各家文生图/视频模型，按需付费 | 没有创作场景，只能转去 MJ/即梦官网，不能集中消费配额 |
| **渠道运维 / 售前** | ~5% | 验证渠道是否畅通、对比多个上游产出的画质 | 现在只能盯日志和 Task 列表，没有快速比对的工具 |

### 2.2 关键场景

1. **「我刚加了一个新的 Sora 渠道，要验证一下能不能跑通」** —— 渠道运维：选 Sora，输入提示词，提交，等任务回来，看到视频能播 = 验证通过。
2. **「业务方想做电商主图，要在 4 个文生图模型里挑一个」** —— PM：同一个 Prompt，复制到 Doubao Seedream、Imagen、Recraft、MJ，并排出图对比。
3. **「想给小红书做 5 张配图，每张 prompt 不同」** —— C 端创作者：连续 5 次提交，作品库里能看到全部产出，挑选并下载。
4. **「我接入了文生视频，担心扣费踩坑」** —— 开发者：提交前看到「本次预计消耗 N 配额 / ¥X」，提交后能在任务详情里看到实际计费。
5. **「上次那个 Prompt 在哪？参数是什么？」** —— 创作者：作品卡片上能复制 Prompt + 一键「再生成」沿用全部参数。

---

## 3. 信息架构与导航

### 3.1 入口

在左侧主导航 **「聊天」** 分组下新增 **「创作中心」** 菜单项，与「操练场」并列：

```
聊天
 ├─ 操练场       /playground         （文本 / Chat 调试）
 ├─ 创作中心      /creation           （图像 / 视频 / 音频 创作工作台）  ← 新增
 └─ 聊天          /console/chat/...
```

> 路由命名候选：`/creation`（首选，简短）、`/studio`（备选，与 Playground 词性更对仗）。本文统一用 `/creation`。

权限：登录即可见。未登录用户与「模型」菜单一致——**可见但点击跳登录**（保持「先种草、再注册」的转化漏斗）。

### 3.2 模块内 IA

```
/creation                         （创作中心首页 = 默认进入「图像」Tab）
  ├─ Tab: 图像                    /creation/image
  ├─ Tab: 视频                    /creation/video
  ├─ Tab: 音频         （v2）     /creation/audio        ← Suno / TTS
  ├─ 作品库                       /creation/gallery      ← 跨模态汇总，按时间倒序
  └─ 任务详情（弹窗 / Drawer）    /creation/task/:taskId
```

「图像」「视频」是平级 Tab，因为两者的 UI 形态、参数集差异巨大（图像是即时 / 同步多张候选，视频是异步长任务）。把它们放进同一个 Tab 用 toggle 切换，会让参数面板大段闪烁，体验差。

「作品库」独立成一个 Tab 而非分散在每个模态下，原因是用户的实际诉求是「**找我之前生成过的东西**」，他们不会先想「那是图还是视频」。Tab 内部用筛选器再分。

---

## 4. 功能设计

### 4.1 整体布局

桌面端三栏（与 Playground 一致的视觉骨架，降低学习成本）：

```
┌─────────────────────────────────────────────────────────────┐
│ Header（沿用全局）                                            │
├──────────────┬──────────────────────────────┬───────────────┤
│ 左侧设置面板  │       中央创作画布            │  右侧任务/调试 │
│              │                              │               │
│ • 分组选择    │  ┌──────────────────────┐  │  Tab：         │
│ • 模型选择    │  │   提示词输入区        │  │  • 任务队列    │
│   （按模态过滤）│  │  （含上传图片入口）   │  │  • 调试        │
│ • 参数控制    │  └──────────────────────┘  │  （Request /   │
│   • 尺寸/比例 │                              │   Response /  │
│   • 数量/seed │  ┌──────────────────────┐  │   cURL）      │
│   • Steps/CFG │  │  作品展示区           │  │               │
│   • 负向提示词│  │  （即时图：网格）      │  │               │
│   • 风格/质量 │  │  （视频：播放器卡片）  │  │               │
│ • 流式/Webhook│  └──────────────────────┘  │               │
│ • 配置导入导出│                              │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

移动端：顶部 Tab 切模态，参数面板用 Drawer 从左侧弹出，任务面板从右侧弹出（沿用 Playground 的 `FloatingButtons` 模式）。

### 4.2 模型选择器（关键）

这是创作中心和 Playground 最大的区别之一。Playground 的模型下拉是「全量模型」，对多模态用户极不友好——一个 GPT-5-Chat 出现在文生图选择器里没有任何意义。

**做法**：复用后端 `Pricing.SupportedEndpointTypes` 字段做硬过滤。

| Tab | 过滤条件 |
|---|---|
| 图像 | `EndpointType` ∈ {`image-generation`} 或模型名匹配已知 MJ / Jimeng / Doubao 文生图模型 |
| 视频 | `EndpointType` ∈ {`openai-video`} 或匹配 Kling / Vidu / Hailuo / Sora / Jimeng video 模型 |
| 音频（v2） | Suno / TTS 模型 |

**模型卡片**（替代纯下拉）：当前 Playground 只是一个文字下拉。创作中心的模型选择器要展示更多信息，因为用户**正在挑选「画风/能力」，而不只是「调一个 API」**：

```
┌────────────────────────────┐
│ [icon]  doubao-seedream-3  │
│         即梦 · 中文友好     │
│         ¥0.08/张  · 1024² │
└────────────────────────────┘
```

实现：基于现有 `/api/pricing` 数据（已有 `Icon` / `Description` / `OwnerBy` / `ModelPrice`），在 Tab 内以卡片网格展示，单选高亮。下拉作为兜底（模型多时可搜索）。

### 4.3 参数面板（按模态/模型动态渲染）

不同模型的参数差异极大：

- OpenAI `images/generations`：`size`, `n`, `quality`, `style`, `response_format`
- MJ `imagine`：`prompt`（含 `--ar --s --v --niji` 等内联参数）+ 上传 base 图
- Kling 文生视频：`prompt`, `duration`, `aspect_ratio`, `mode`(std/pro), `cfg_scale`, `negative_prompt`
- Sora：`prompt`, `seconds`, `size`, `model`
- Jimeng：`prompt`, `seed`, `width`, `height`, `use_pre_llm`

**做法**：定义 `creation_model_schema`（前端常量 + 后端可选下发）：

```ts
type CreationModelSchema = {
  modelName: string;
  modality: 'image' | 'video' | 'audio';
  endpoint: string;                  // 用于构造请求 URL
  protocol: 'openai-image' | 'openai-video' | 'mj' | 'kling' | 'jimeng' | 'suno' | 'replicate';
  fields: ParamField[];              // 渲染参数面板用
  examples?: PromptExample[];        // 提示词示例
  pricing: { unit: '张' | '秒' | '次'; estimate: (params) => number };
};
```

v1 把 schema **写在前端**（参考 web/src/constants/playground.constants.js 的位置）。这是务实的取舍——后端下发 schema 也行，但会让一次发版需要前后端都改，节奏更慢。等模型种类稳定后再考虑后端化。

未在 schema 中登记的模型，回退到「通用模式」：仅暴露 `prompt` + `n` + 自定义 JSON 编辑器（沿用 Playground 的 `CustomRequestEditor`）。

> ⚠️ 视频模型的参数体系最复杂、上游差异最大，单独在 [§5「视频生成详细参数设计」](#5-视频生成详细参数设计) 展开。本节只描述通用机制。

### 4.4 提示词输入区

- **多行文本框**，自动高度，支持 ⌘/Ctrl+Enter 提交。
- **示例提示词**：每个模型自带 3-5 个 official example，一键填入（降低空白页焦虑）。
- **图像上传槽**（仅图生图 / 图生视频模型显示）：复用 Playground 的 `ImageUrlInput`，支持本地拖拽、URL 粘贴、剪贴板粘贴；最多支持 N 张（依模型而定）。
- **负向提示词**（仅支持的模型显示）。
- **Prompt 历史**：下拉显示该用户最近 20 条 prompt，供再次发送（数据来源：本地 IndexedDB，与 Playground 的 `configStorage.js` 同套机制）。

### 4.5 作品展示区

#### 4.5.1 图像

- **生成中**：占位骨架卡 + 进度条（同步模型走「假进度条」，异步走真实进度）。
- **生成完成**：网格展示（n=1 单图大图，n=2/4 网格），每张图悬浮显示操作：
  - 下载（PNG/原格式）
  - 复制图片 URL
  - 复制 Prompt
  - **再生成（同 Prompt 同参）/ 微调再生成**
  - **作为输入**（送入图像编辑模型，或送入图生视频）
  - 删除
- **失败**：错误卡片，显示 status_code + message + 「重试」「查看请求/响应」。

#### 4.5.2 视频

- 异步任务卡片：
  - 顶部进度条 / 状态徽标（queued / in_progress / completed / failed）
  - 完成后内嵌 HTML5 `<video controls>`，自动加载首帧
  - 同样的下载 / 复制 URL / 重生成 / 删除
- 进度更新机制：**前端轮询 `/v1/video/generations/:task_id`**（已有路由）；轮询频率：前 30s 每 3s，30s 后每 10s，1 分钟后每 30s（指数退避）。
- 视频文件代理：复用已有 `/v1/videos/:task_id/content`，避免跨域和签名 URL 过期问题。

### 4.6 任务队列面板（右侧 Drawer / Tab）

显示**当前会话**提交但尚未结束的任务，以及最近 24h 的历史：

```
┌──────────────────────────┐
│ 任务队列         (3 进行中) │
├──────────────────────────┤
│ ● 视频  Kling-1.0  3:21   │
│   "夕阳下的海..."  62%    │
│ ● 图像  MJ-v6      0:08   │
│   "cyberpunk..."  排队中  │
│ ✓ 视频  Sora-1     2:05   │
│   "桌上..."        完成   │
└──────────────────────────┘
```

数据源：复用现有 `Task` 表（`model/task.go`）+ 现有 `/api/task/...` 接口。无需新增表结构。

### 4.7 调试面板

完全复用 Playground 的 `DebugPanel` 组件——同一套 Request / Response / cURL / SSE 视图。这是创作中心区别于第三方创作工具的关键卖点：**「我能直接拿到等价的 cURL 命令贴进我的代码」**。

### 4.8 作品库（Gallery）

独立 Tab，跨模态汇总用户所有的生成产出。

- 排序：时间倒序（默认）、模型聚合、收藏置顶
- 筛选：模态 / 模型 / 状态 / 时间范围 / 关键词搜 prompt
- 卡片视图 / 列表视图切换
- 批量操作：批量下载（zip 打包）、批量删除
- 收藏（⭐）、添加备注

**数据存储**：v1 不引入新表，直接基于 `Task` 表 + 一张轻量 `creation_assets` 表存「图片本身」（图像同步生成的产物，没有 task）。表结构：

```go
type CreationAsset struct {
    Id        int    `gorm:"primaryKey"`
    UserId    int    `gorm:"index"`
    TaskId    string `gorm:"index"`        // 可空，挂到 Task 上
    Modality  string                       // image | video | audio
    ModelName string
    Prompt    string `gorm:"type:text"`
    Params    string `gorm:"type:text"`    // JSON
    AssetUrl  string `gorm:"type:text"`    // 上游返回的 URL
    Thumbnail string `gorm:"type:text"`
    Quota     int                          // 实际消耗配额
    Favorite  bool
    Note      string
    CreatedAt int64
}
```

跨 SQLite / MySQL / PostgreSQL 兼容（遵循 CLAUDE.md Rule 2）：JSON 用 `TEXT` 存储；时间戳用 `int64`；不依赖任何方言。

### 4.9 计费透明度

提交按钮上方实时显示：

```
预计消耗：8 点数（约 ¥0.06）   ⓘ
```

数据来源：模型 schema 的 `pricing.estimate(params)` 客户端预估 + `/api/pricing` 服务端校准。

提交后任务卡片右下角显示**实际**消耗。失败任务显示「未扣费」。

---

## 5. 视频生成详细参数设计

> 本节专门描述「创作中心 - 视频 Tab」的详细参数与交互设计。
> 设计原则：**参考 [pollo.ai](https://pollo.ai/) 的子模式划分 + 模型卡片化选择**，但实际可用参数严格对齐 new-api 后端 6 个视频适配器（Sora / Kling / Jimeng / Vidu / Hailuo / Doubao Seedance）真实接受的字段，不做空头承诺。

### 5.1 子模式（Sub-Modes）

pollo.ai 在视频模块下用横向 Pill 把使用形态分成多个「子工具」。new-api 后端能力实测能稳定支撑的子模式如下：

| 子模式 | 中文名 | 必填 | 适用模型（已对齐适配器） | 对应适配器字段 |
|---|---|---|---|---|
| **T2V** | 文生视频 | `prompt` | Sora、Kling、Jimeng、Vidu、Hailuo（T2V-01）、Doubao | （无图片字段） |
| **I2V** | 图生视频 | `prompt` + 1 张首帧 | Kling（image）、Hailuo（first_frame_image）、Vidu（images[1]）、Doubao、Jimeng（image_urls[1]） | `image` / `first_frame_image` / `images[0]` |
| **Keyframes** | 首尾帧 | `prompt` + 首帧 + 尾帧 | Kling（image + image_tail）、Hailuo（first_frame_image + last_frame_image）、Vidu（images[2]） | 见上 |
| **Reference** | 参考图生视频 | `prompt` + N 张参考图 | Vidu（images > 2）、Jimeng（image_urls > 1） | `images[]` |
| **Subject** | 主体/角色参考 | `prompt` + 1 张人物图 | Hailuo（subject_reference[character]） | `subject_reference` |
| **Remix** | 视频改写 | 已有 `task_id` + 新 `prompt` | Sora（独有） | `POST /v1/videos/:video_id/remix` |
| **Motion Brush** | 运动笔刷 *(v1.5)* | 首帧 + mask + 轨迹 | Kling（dynamic_masks） | `dynamic_masks` |

UI 形式：视频 Tab 内部顶部一排 Pill（最多 5 个 v1 子模式 + 1 个 v1.5「运动笔刷」灰显标签）。**切换子模式时，模型选择器会自动过滤**——比如切到「Keyframes」，下面的模型卡片只剩 Kling / Hailuo / Vidu。

> 设计取舍：pollo 把「Effects（特效模板）」「Lip Sync（对口型）」「Mimic Motion（动作迁移）」也做成同级子模式。new-api 后端目前没有对应能力，**不做空壳**——不出现在 UI 里，避免误导。

### 5.2 通用参数清单

把 6 个适配器的参数集合并去重后，归纳出**统一前端参数模型**（`UnifiedVideoParams`）。每个参数标注：① 数据类型、② 哪些模型支持、③ UI 控件。

| 参数 | 类型 | UI 控件 | 支持模型 | 备注 |
|---|---|---|---|---|
| `prompt` | string | 多行文本框（自动高度，⌘+Enter 提交） | 全部 | 必填；右上角字数计 / 上限提示 |
| `negative_prompt` | string | 折叠面板内多行文本框 | Kling、Doubao | 仅在选中模型支持时出现 |
| `image_first` | url\|base64 | 上传槽（拖拽 / 粘贴 / URL） | I2V/Keyframes 全部 | 子模式决定可见性 |
| `image_last` | url\|base64 | 上传槽 | Kling、Hailuo、Vidu Keyframes | Keyframes 模式必填 |
| `images_ref` | url[]\|base64[] | 多槽（最多 9） | Vidu、Jimeng | Reference 模式 |
| `subject_image` | url\|base64 | 单槽，标签「人物/主体」 | Hailuo S2V-01 | Subject 模式 |
| `duration` | int (秒) | Segmented：4/5/6/8/10 | 全部，但每模型可选项不同 | UI 只渲染 `schema.allowedDurations` |
| `aspect_ratio` | "16:9" \| "9:16" \| "1:1" \| "4:3" \| "3:4" \| "21:9" | 图标按钮组（横/竖/方/电影） | Kling、Jimeng、Doubao | Sora 没有该字段，转 `size` |
| `size` | "1280x720" 等 | Select | Sora、Hailuo、Vidu | 与 `aspect_ratio` 二选一展示 |
| `resolution` | "480p" \| "720p" \| "1080p" \| "2k" | Segmented | Vidu、Hailuo、Doubao | 与上游 `resolution` 字段直传 |
| `fps` / `frames` | int | Segmented：24/30 fps；或帧数 | Doubao（frames）、Jimeng（frames）、OpenAI 通用 fps | 默认 24 |
| `seed` | int (-1 = 随机) | Number 输入 + 「随机骰子」按钮 | 全部 | 默认 -1（随机）；填入后按钮变「锁定」 |
| `n` | int 1-4 | Stepper | OpenAI VideoRequest（极少模型实际支持）、部分国产 | 默认 1；多数视频模型只能 1 |
| `mode` / `quality` | "std" \| "pro" | Segmented | Kling（mode）、Doubao（service_tier） | 影响计费 |
| `cfg_scale` | float 0-1 | Slider | Kling | 默认 0.5 |
| `motion_strength` | "auto" \| "small" \| "medium" \| "large" | Segmented | Vidu（movement_amplitude）、可映射 Kling 的 cfg | 默认 auto |
| `camera_control` | enum + 6 维向量 | 折叠：先选预设（Pan/Tilt/Zoom/Orbit/Static），高级展开 6 个 slider | Kling（camera_control）、Doubao（camera_fixed boolean） | 详见 §5.3.4 |
| `prompt_optimizer` | bool | Switch | Hailuo | 默认开 |
| `fast_pretreatment` | bool | Switch | Hailuo | 默认开 |
| `generate_audio` | bool | Switch | Doubao（generate_audio）、Vidu（bgm） | 默认关 |
| `watermark` | bool | Switch | Doubao、Kling 输出 watermark_url | 默认关 |
| `callback_url` | string | 高级面板，`text` | 全部支持 webhook 的模型 | 留空走轮询 |

### 5.3 参数面板布局

参数密度高，必须**分组折叠**，避免一屏堆 20 个控件。借鉴 pollo.ai 的「主参数始终可见 + 高级参数折叠」，分四块：

```
┌─ 参数面板（左侧 Sider） ────────────────────────────┐
│                                                    │
│ ▼ 模型                                             │
│   [模型卡片网格]   选中后下方实时变化               │
│                                                    │
│ ▼ 子模式      ◉T2V  ○I2V  ○Keyframes  ○Reference  │
│                                                    │
│ ▼ 基础参数                                         │
│   宽高比      [16:9] [9:16] [1:1] [4:3] [3:4]     │
│   时长        [5s] [10s]                           │
│   分辨率      [480p] [720p] [1080p]                │
│   生成数量    [- 1 +]                              │
│                                                    │
│ ▼ 高级参数（默认折叠）                             │
│   随机种子    [123456] [🎲]                        │
│   质量模式    [Standard] [Pro]                     │
│   CFG Scale   ━━●━━━━━━  0.5                      │
│   运动强度    [Auto] [Small] [Medium] [Large]      │
│   Prompt 优化 [开 ●]                               │
│   生成音频    [关 ○]                               │
│                                                    │
│ ▼ 镜头控制（默认折叠，仅 Kling 显示）              │
│   预设        [固定] [Pan-L] [Pan-R] [Zoom] ...   │
│   ▾ 高级       水平 ━●━ 垂直 ━━●  Pan ●━━ ...    │
│                                                    │
│ ▼ Webhook（默认折叠，开发者）                      │
│   回调地址    [https://...]                        │
│                                                    │
└────────────────────────────────────────────────────┘
```

#### 5.3.1 模型差异处理

「基础参数」「高级参数」里的每个控件，**根据当前选中模型的 schema 自动显隐 / 自动改可选项**：

- 选 Sora → 「分辨率」消失，「Size」出现（`720x1280` / `1280x720` / `1024x1792` / `1792x1024`）
- 选 Hailuo → 「CFG Scale」「Motion Strength」消失；「Prompt 优化」「快速预处理」出现
- 选 Doubao → 「服务等级」（standard / pro）出现；「生成音频」出现
- 选 Kling → 「质量模式」（std / pro）+「CFG Scale」+「镜头控制」全出现

切换模型时若现有参数在新模型不支持，**保留值但灰显**，并提示「该参数将不会发送到 X 模型」。这样回切回去不丢配置。

#### 5.3.2 时长选项动态化

每个模型支持的时长 hardcode 在 schema 里：

| 模型 | 可选时长（秒） |
|---|---|
| Sora（sora-1/sora-turbo） | 4 / 8 / 12 / 20 |
| Kling（v1 / v1-6 / v2-master） | 5 / 10 |
| Hailuo（MiniMax-Hailuo-2.3） | 6 / 10 |
| Hailuo（T2V-01 / I2V-01） | 6 |
| Vidu | 4 / 8 |
| Doubao（Seedance） | 5 / 10 |
| Jimeng | 通过 `frames` 字段间接控制（24/48/72） |

UI 渲染规则：动态生成 Segmented，超出范围的选项**不出现**（而不是 disabled）。

#### 5.3.3 宽高比 / 尺寸归一

为了让用户不必关心「这个模型用 `aspect_ratio` 还是 `size`」，前端统一以**宽高比 + 分辨率**输入，提交前在「参数归一化层」（见 §6）转成上游字段：

- Kling 接收 `aspect_ratio: "16:9"` → 直传
- Sora 接收 `size: "1280x720"` → 由 `(16:9, 720p)` 推算
- Vidu 接收 `resolution: "720p"` → 直传，`aspect_ratio` 忽略（Vidu 不支持，UI 提示）

#### 5.3.4 镜头控制（Camera Control）

只对 Kling 显示。Pollo 的做法是「6 个预设按钮 + 高级展开」，我们沿用：

```
预设按钮：固定 / Pan-Left / Pan-Right / Tilt-Up / Tilt-Down / Zoom-In / Zoom-Out / Orbit-Left / Orbit-Right / Down-Back / Forward-Up / Right-Turn-Forward
```

点预设按钮 = 后端 `camera_control.type` 设成对应字符串；展开「高级」可以手动调 6 个 slider（Horizontal / Vertical / Pan / Tilt / Roll / Zoom，范围 -10 ~ +10），此时 `type` 变 `simple` 模式。

Doubao 只有 `camera_fixed` 布尔，所以 Doubao 选中时这个块退化成单个 Switch「固定镜头」。

### 5.4 各核心模型的 Schema 示例

> 这是**前端常量**，保存在 `web/src/constants/creation/video-models.js`。新增一个模型 = 加一条 schema + 一行图标即可。

#### 5.4.1 Kling v1.6

```js
{
  modelName: 'kling-v1-6',
  displayName: 'Kling 1.6',
  vendor: 'kuaishou',
  icon: '/logos/kling.svg',
  modes: ['t2v', 'i2v', 'keyframes'],
  endpoint: '/kling/v1/videos/text2video',  // 子模式不同走不同 endpoint
  endpointMap: {
    t2v: '/kling/v1/videos/text2video',
    i2v: '/kling/v1/videos/image2video',
    keyframes: '/kling/v1/videos/image2video',
  },
  fields: {
    duration: { type: 'segmented', options: [5, 10], default: 5 },
    aspect_ratio: { type: 'ratio', options: ['16:9', '9:16', '1:1'], default: '16:9' },
    mode: { type: 'segmented', options: ['std', 'pro'], default: 'std',
            help: 'Pro 画质更好，计费更高' },
    cfg_scale: { type: 'slider', min: 0, max: 1, step: 0.1, default: 0.5 },
    negative_prompt: { type: 'textarea', placeholder: '不希望出现的元素…' },
    camera_control: { type: 'camera', enabled: true },
    seed: { type: 'seed', default: -1 },
  },
  pricing: {
    unit: '次',
    estimate: ({ duration, mode }) => duration * (mode === 'pro' ? 0.05 : 0.02),
  },
  maxImageSizeMB: 10,
  acceptImageFormats: ['jpg', 'png', 'webp'],
}
```

#### 5.4.2 Sora

```js
{
  modelName: 'sora-1',
  displayName: 'Sora',
  vendor: 'openai',
  icon: '/logos/openai.svg',
  modes: ['t2v', 'remix'],
  endpoint: '/v1/videos',
  fields: {
    seconds: { type: 'segmented', options: [4, 8, 12, 20], default: 8 },
    size: { type: 'select',
            options: ['720x1280', '1280x720', '1024x1792', '1792x1024'],
            default: '1280x720' },
    seed: { type: 'seed', default: -1 },
  },
  pricing: { unit: '秒', estimate: ({ seconds, size }) =>
    seconds * (size.includes('1792') ? 0.5 : 0.3) },
  remixSupported: true,  // 完成的视频卡片上展示「再创作」按钮
}
```

#### 5.4.3 Hailuo

```js
{
  modelName: 'MiniMax-Hailuo-2.3',
  displayName: 'Hailuo 2.3',
  vendor: 'minimax',
  modes: ['t2v', 'i2v', 'keyframes', 'subject'],
  endpoint: '/v1/video/generations',
  fields: {
    duration: { type: 'segmented', options: [6, 10], default: 6 },
    resolution: { type: 'segmented', options: ['768p', '1080p'], default: '768p' },
    prompt_optimizer: { type: 'switch', default: true,
                        help: '让模型先优化你的 prompt 再生成' },
    fast_pretreatment: { type: 'switch', default: true },
  },
  pricing: { unit: '秒', estimate: ({ duration, resolution }) =>
    duration * (resolution === '1080p' ? 0.08 : 0.04) },
}
```

#### 5.4.4 Doubao Seedance

```js
{
  modelName: 'doubao-seedance-1.0-pro',
  displayName: 'Seedance Pro',
  vendor: 'doubao',
  modes: ['t2v', 'i2v', 'keyframes'],
  endpoint: '/v1/video/generations',
  fields: {
    duration: { type: 'segmented', options: [5, 10], default: 5 },
    resolution: { type: 'segmented', options: ['720p', '1080p'], default: '720p' },
    aspect_ratio: { type: 'ratio', options: ['16:9', '9:16', '1:1'], default: '16:9' },
    service_tier: { type: 'segmented', options: ['standard', 'pro'], default: 'standard' },
    generate_audio: { type: 'switch', default: false, help: '同时生成背景音乐' },
    camera_fixed: { type: 'switch', default: false, help: '保持镜头固定' },
    seed: { type: 'seed', default: -1 },
  },
  pricing: { unit: '秒', estimate: ({ duration, resolution, service_tier }) =>
    duration * (resolution === '1080p' ? 0.1 : 0.05) * (service_tier === 'pro' ? 1.5 : 1) },
}
```

#### 5.4.5 Vidu / Jimeng（v1.1 接入，schema 略，结构同上）

### 5.5 提示词区域（Prompt Composer）

参考 pollo 的 prompt 区设计，做三件事：

1. **多行 textarea + 字数计**：右下角显示 `0 / 500`，超限标红。各模型上限来自 schema。
2. **Prompt 优化建议**：右上角一个「✨ 优化」按钮，点击后用一个轻量 LLM（默认走当前 token 对应账户里**任意可用的 Chat 模型**，模型由用户在创作中心设置里指定，默认 `gpt-4o-mini`）把 prompt 重写得更具镜头语言、更长。原文/优化文双 Tab 切换，可一键回退。
3. **官方示例库**：折叠面板「✦ 示例」内放该模型官方 3-5 条示范 prompt，点一条直接填入。

> 设计取舍：不做 pollo 那种「Prompt Library 公共社区」。new-api 是企业网关，不做 UGC。

### 5.6 图片上传槽

I2V / Keyframes / Reference 三个模式涉及上传，统一组件 `ImageSlot`：

- 接受拖拽 / 点击上传 / 粘贴 / URL 输入四种方式
- 单槽显示**首帧 / 尾帧** 标签；多槽显示编号
- 自动展示尺寸、文件大小，超出 `maxImageSizeMB` 直接拦截（如 Jimeng 限 4.7MB）
- 上传到 new-api 自身的临时图床（v1）→ 提交时把 URL 传给上游；图床过期 7 天
- 自动从图片 EXIF 推断宽高比，若与当前 `aspect_ratio` 不一致，提示「图片是 4:3，是否切换？」

```
┌─ 首帧 ─────────────┐  ┌─ 尾帧 ─────────────┐
│  ┌─────────────┐   │  │   ┌─────┐          │
│  │   image     │   │  │   │  +  │  上传图片 │
│  │  preview    │   │  │   └─────┘          │
│  └─────────────┘   │  │   或拖入此处        │
│  1024×768 · 240KB  │  │                    │
│  [×]               │  │                    │
└────────────────────┘  └────────────────────┘
```

### 5.7 提交、进度与结果展示

#### 提交按钮
```
┌──────────────────────────────────────────┐
│  本次预计消耗 14 点（约 ¥0.10）  ⓘ       │
│  ┌────────────────────────────────────┐ │
│  │  生成视频                    ⌘+↵   │ │
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

按钮上方实时显示**预估**，由 schema 的 `pricing.estimate(params)` 计算。ⓘ 悬浮显示「按 X 模型 Y 秒 Z 分辨率，参考价；最终以实际扣费为准」。

#### 任务卡片状态

异步任务卡片在中央创作画布展示，状态机：

```
queued (排队中) → in_progress (生成中, 进度条 0-100) → completed (可播放) ┐
                                                    └→ failed (错误信息)  ┘
```

- **排队中**：灰色骨架卡，显示「队列中…」+ 取消按钮（v1 取消仅前端停止轮询，不调用上游 cancel；v1.5 接入上游 cancel）
- **生成中**：进度条 + 当前状态文本（来自上游 `task_status_msg` 字段）+「最长预计 X 分钟」（按模型经验值给）
- **完成**：内嵌 `<video controls poster=cover>`，下方一排操作：
  - ▶️ 播放 / ⬇️ 下载 MP4 / 🔗 复制链接 / 🔁 沿用参数再生成 / ✏️ Sora-Remix（仅 Sora）/ 🖼️ 提取首帧→新图生视频任务 / 🗑️ 删除
- **失败**：错误码 + 错误信息 + 「查看请求/响应」+ 「重试（同参）」

#### 轮询策略

复用 [§4.5.2 视频] 描述：前 30s 每 3s，30s-1min 每 10s，1min+ 每 30s。Hailuo / Kling 上游有时延 1-3 分钟，所以最长轮询 15 分钟后停止并提示「任务仍在处理，可在『任务队列』面板查看」。

### 5.8 错误与边界处理

| 场景 | 处理 |
|---|---|
| 模型不支持当前子模式（如 Sora 选 Keyframes） | 子模式 Pill 灰显并 tooltip「Sora 暂不支持首尾帧」 |
| 上传图与模型要求宽高比差距 > 5% | 黄条提示「建议裁剪到 16:9 后上传，否则结果可能扭曲」+「自动裁剪」按钮 |
| 计费预估失败（pricing 数据未拉到） | 隐藏预估行，按钮文案改「提交（费用未估算）」 |
| 任务超时（超过 15 min） | 标橙「任务仍在排队，结果会自动追加到作品库」，前端停止轮询，后端 Task 持续 |
| 上游返回 429 / 配额不足 | 错误卡 + 「去充值」深链 |
| 任务列表中有 ≥3 个 in_progress | 顶部提示「当前并发已达 3 个，新提交将排队」（与 token 限流配合） |

### 5.9 移动端适配

- 子模式 Pill 横向滚动
- 参数面板默认收起，只暴露「模型 + Prompt + 生成」+ 一个「参数」按钮拉起 Drawer
- 视频播放器自适应屏宽，竖屏/横屏视频都能完整显示
- 上传槽支持调用相册 / 相机

### 5.10 与 pollo.ai 的关键差异

| 维度 | pollo.ai | 创作中心 | 取舍理由 |
|---|---|---|---|
| 定位 | C 端创作工具 + 多模型聚合 | 开发者 / 内部测试 + C 端轻创作 | new-api 主体是网关，开发者优先 |
| 模型获取 | pollo 自有上游账号 | 复用平台已配置渠道 | 我们不卖模型卖网关 |
| 子模式数 | T2V / I2V / Effects / Lip Sync / Mimic Motion / Style Transfer / Upscale / ... | T2V / I2V / Keyframes / Reference / Subject / Remix（5+1） | 后端有什么做什么，不堆空壳 |
| 调试能力 | ✗ | ✓ Request/Response/cURL 一键复制 | 服务开发者的核心卖点 |
| 充值/会员 | 月套餐 + 积分 | 复用 new-api 现有配额体系 | 不做新计费 |
| 公共画廊 | ✓ | ✗（v1.5 只做个人作品库） | 企业网关不做 UGC |
| Prompt 优化 | ✓（pollo Prompt Enhancer） | ✓ 用账户自有 Chat 模型 | 复用，不引入外部依赖 |
| 协议透明 | 黑盒 | 完全透明，等价 cURL 可见 | 这是创作中心区别于 pollo 的护城河 |

---

## 6. 参数归一化与协议映射

前端把所有视频参数收敛到一个 `UnifiedVideoParams`，提交前由「**协议适配层**」转成各上游真正的 JSON。这一层放在**前端**（`web/src/services/creation/videoAdapter.js`），不修改后端，因为后端的 6 个 adapter 已经自带从 `dto.VideoRequest` → 上游格式的转换。

### 6.1 统一前端参数

```ts
type UnifiedVideoParams = {
  model: string;
  mode: 't2v' | 'i2v' | 'keyframes' | 'reference' | 'subject' | 'remix';
  prompt: string;
  negative_prompt?: string;

  image_first?: string;       // URL or data:base64
  image_last?: string;
  images_ref?: string[];
  subject_image?: string;
  remix_from_task_id?: string;

  duration?: number;          // 统一以秒为单位
  aspect_ratio?: string;      // "16:9" / "9:16" 等
  resolution?: string;        // "720p" / "1080p"
  size?: string;              // "1280x720"，由 ratio + resolution 推导

  seed?: number;              // -1 = 随机
  n?: number;
  fps?: number;
  frames?: number;

  mode_quality?: 'std' | 'pro';
  cfg_scale?: number;
  motion_strength?: 'auto' | 'small' | 'medium' | 'large';
  camera_preset?: string;
  camera_advanced?: { horizontal?: number; vertical?: number; pan?: number; tilt?: number; roll?: number; zoom?: number };

  prompt_optimizer?: boolean;
  fast_pretreatment?: boolean;
  generate_audio?: boolean;
  watermark?: boolean;

  callback_url?: string;
};
```

### 6.2 适配映射表

| 前端字段 | OpenAI（VideoRequest） | Sora | Kling | Hailuo | Vidu | Doubao | Jimeng |
|---|---|---|---|---|---|---|---|
| `prompt` | `prompt` | `prompt` | `prompt` | `prompt` | `prompt` | `content[type=text].text` | `prompt` |
| `negative_prompt` | `metadata.negative_prompt` | – | `negative_prompt` | – | – | `content[].negative_prompt` | – |
| `image_first` | `image` | 走 multipart `input_reference` | `image` | `first_frame_image` | `images[0]` | `content[type=image_url].image_url.url` | `image_urls[0]` |
| `image_last` | – | – | `image_tail` | `last_frame_image` | `images[1]` | `content[].url`（last_frame） | – |
| `images_ref` | – | – | – | – | `images[]` | – | `image_urls[]` |
| `subject_image` | – | – | – | `subject_reference[character]` | – | – | – |
| `duration` | `duration` | `seconds` (string) | `duration` (string "5"/"10") | `duration` (int) | `duration` (int) | `duration` (int) | 推导成 `frames` |
| `aspect_ratio` | – | 推导成 `size` | `aspect_ratio` | – (用 size) | – | `ratio` | `aspect_ratio` |
| `resolution` | – | – | – | `resolution` ("768P") | `resolution` | `resolution` | – |
| `size` | `width`+`height` | `size` | – | – | – | – | – |
| `seed` | `seed` | – | – | – | `seed` | `seed` | `seed` |
| `n` | `n` | – | – | – | – | – | – |
| `mode_quality` | `metadata.mode` | – | `mode` | – | – | `service_tier` | – |
| `cfg_scale` | `metadata.cfg_scale` | – | `cfg_scale` | – | – | – | – |
| `motion_strength` | `metadata.motion_strength` | – | – | – | `movement_amplitude` | – | – |
| `camera_preset` + `camera_advanced` | – | – | `camera_control.{type,config}` | – | – | `camera_fixed`（仅取 fixed/free） | – |
| `prompt_optimizer` | – | – | – | `prompt_optimizer` | – | – | – |
| `fast_pretreatment` | – | – | – | `fast_pretreatment` | – | – | – |
| `generate_audio` | – | – | – | – | `bgm` | `generate_audio` | – |
| `watermark` | – | – | – | `aigc_watermark` | – | `watermark` | – |
| `callback_url` | – | – | `callback_url` | `callback_url` | `callback_url` | `callback_url` | – |

> 注：上面的映射有 70% 直接落到统一的 `dto.VideoRequest` + `metadata`，因为后端 adapter 本身在做二次转换；其余少数（如 Doubao 的 `content[]` 嵌套、Sora 的 multipart）需要前端按 `protocol` 字段走分支构造。

### 6.3 何时走哪个 endpoint

```
mode === 'remix'        → POST /v1/videos/:from_id/remix         (Sora-only)
mode in (t2v,i2v,kf,…)  → POST /v1/video/generations              (主线，绝大多数模型)
provider === 'kling'    → POST /kling/v1/videos/text2video|image2video  (官方协议透传)
provider === 'jimeng'   → POST /jimeng                            (官方协议透传)
```

前端按 `schema.endpointMap[mode]` 决定。这样后端**完全无感**，仍然是它自己的 6 个 adapter 在收请求。

### 6.4 schema 校验

提交前前端做一次本地校验：必填字段、互斥字段（如 `aspect_ratio` vs `size`）、不支持字段（选了 Vidu 但开了 cfg_scale → 警告并去掉）。校验失败按钮 disable，鼠标悬浮显示原因。

---

## 7. 与现有模块的关系

| 模块 | 关系 | 说明 |
|---|---|---|
| Playground | **平级互补** | 文本 → Playground，多模态 → 创作中心。两者共享 `helpers/buildApiPayload`、`DebugPanel`、`ConfigManager` 等通用组件 |
| Midjourney 页面 | **被取代** | 现有 `/pages/Midjourney/index.jsx` 只是 TaskLogsTable 的简单包装，可在 v1 完成后下线，MJ 进入创作中心-图像 Tab |
| Task 页面 | **数据共享** | 创作中心的「作品库」「任务队列」消费 Task 表；管理员的「任务管理」仍保留作为运营视角入口 |
| Marketplace | **入口联动** | 在 Marketplace 的图像/视频模型卡片上加「去创作」按钮，跳到 `/creation/image?model=xxx` 直接预选模型 |
| Pricing | **数据复用** | 模型筛选基于 `Pricing.SupportedEndpointTypes`；估价基于 `ModelPrice` / `ModelRatio` |

---

## 8. 接口与协议

### 6.1 复用既有接口（v1 不新增 API）

| 用途 | 接口 |
|---|---|
| 文生图 | `POST /v1/images/generations` |
| 图生图 | `POST /v1/images/edits` |
| 文生视频 | `POST /v1/video/generations` 或 `POST /v1/videos`（OpenAI 兼容） |
| 查询视频任务 | `GET /v1/video/generations/:task_id` |
| MJ 提交 | `POST /mj/submit/imagine` 等 |
| Suno | `POST /suno/submit/:action` |
| Kling | `POST /kling/v1/videos/text2video`、`image2video` |
| 模型/分组 | 复用 Playground 调用的 `/api/user/models`、`/api/group/...` |

### 6.2 v1.5 新增（作品库需要）

- `POST /api/creation/asset` — 收藏一个生成产物（任务完成时前端自动调用）
- `GET /api/creation/assets?modality=&model=&page=` — 列出当前用户作品
- `DELETE /api/creation/asset/:id` — 删除作品记录（不删上游素材，仅删本地引用）
- `PATCH /api/creation/asset/:id` — 更新备注 / 收藏

> 这些接口不在 v1 范围内，v1 用 IndexedDB 本地缓存先跑通。

---

## 9. 国际化

按 CLAUDE.md：所有文案以**中文**为源，进入 `web/src/i18n/locales/zh.json` 的扁平结构，再通过 `bun run i18n:extract` 同步到 en/fr/ru/ja/vi。

需要新增的关键文案约 80-120 条，集中在：模态名（图像/视频/音频）、参数标签（尺寸/数量/步数/CFG/负向提示词）、状态（排队中/生成中/完成/失败）、操作（再生成/下载/作为输入）、空态/错误提示。

---

## 10. 权限与限流

- **可见性**：未登录用户可见菜单，点击跳登录页（与 Marketplace 一致的转化策略）。
- **使用门槛**：登录后即可使用，扣费走现有配额 / 用户计费链路，无需单独开关。
- **管理员可关闭模块**：复用 SiderBar 已有的 `isModuleVisible('chat', 'creation')` 模式，在系统设置中可整体关闭创作中心。
- **限流**：复用 token rate limit + model rate limit，无需新增；任务并发数受限于上游渠道本身。

---

## 11. 关键设计取舍

| 取舍 | 选择 | 理由 |
|---|---|---|
| 是否做节点式工作流 | ❌ 不做 | 与 ComfyUI 拉开差异需要巨大投入；80% 用户只要单步生成 |
| 多模态是 Tab 还是 toggle | Tab | 参数集差异大，Tab 切换不闪烁、可直接深链 |
| 模型 schema 写后端还是前端 | v1 写前端 | 节奏快，新加模型只改一处；稳定后再后端化 |
| 作品库存上游 URL 还是落本地 | 存上游 URL | 落本地涉及 OSS / 容量 / 安全策略，超出 v1 范围；上游过期问题 v1.5 用代理解决 |
| 视频进度是轮询还是推送 | 轮询 + 退避 | 后端没有 WS 基础设施，轮询足够稳定；指数退避控制开销 |
| 是否取代 Playground | ❌ 共存 | 文本 / Chat 用户群很大，Playground 已经稳定，无谓打散 |
| 是否取代 Midjourney 页面 | ✅ 是 | 现有 MJ 页面只是 Task 列表，价值低，整合进创作中心更合理 |

---

## 12. 验收指标

### 10.1 上线 30 天内

- ✅ 创作中心 DAU / Playground DAU > 30%（说明承接住了多模态需求）
- ✅ 平均每个进入创作中心的用户成功生成 ≥ 1 个产物（说明流程跑通）
- ✅ 用户主动从 cURL / 第三方工具切回创作中心的反馈 ≥ 5 个（定性）
- ✅ 视频任务完成率（completed / submitted）≥ 同期 API 直调完成率（说明前端轮询/状态展示没掉链子）

### 10.2 反向指标

- ❌ 任务失败率显著高于 API 直调 → 说明前端参数构造有 bug
- ❌ 「重试」点击占总点击 > 15% → 说明首次成功率太差，参数面板设计有问题

---

## 13. 分阶段交付

### v1.0（MVP，2-3 周）

- [ ] 路由 / 菜单 / 三栏布局骨架
- [ ] 图像 Tab：OpenAI `images/generations` + 1-2 个国产文生图（Doubao Seedream / Jimeng）
- [ ] 视频 Tab：1 个文生视频（Kling 或 Sora），含异步任务轮询
- [ ] 模型筛选基于 `SupportedEndpointTypes`
- [ ] 提示词输入 + 基础参数面板（尺寸/数量/seed）
- [ ] 同步图像即时展示、异步视频任务卡片
- [ ] 调试面板（复用 Playground）
- [ ] 计费预估
- [ ] 中英文 i18n

### v1.1（2 周）

- [ ] 接入 MJ（imagine / variation / upscale，对应 MJ proxy 协议）
- [ ] 接入 Vidu / Hailuo / Jimeng 视频
- [ ] 图生图 / 图生视频（图像上传槽）
- [ ] 「再生成」「作为输入」「复制 Prompt」操作
- [ ] 提示词示例库
- [ ] 全语种 i18n（fr/ru/ja/vi）

### v1.5（2 周）

- [ ] `creation_assets` 表 + 作品库页面（云端）
- [ ] 收藏 / 备注 / 批量下载
- [ ] 跨模态产物链路（图 → 视频）
- [ ] 资源代理与缓存（解决上游 URL 过期）
- [ ] 接入 Suno / TTS（音频 Tab）
- [ ] 下线旧 Midjourney 页面，菜单合并

### v2（评估）

- 多模型并排对比模式
- Prompt 自动优化（小模型重写）
- 公开画廊 / 分享链接（需要风控配套）

---

## 14. 风险与依赖

| 风险 | 影响 | 缓解 |
|---|---|---|
| 上游模型协议差异极大，参数 schema 维护成本高 | 中 | v1 仅纳入 5-6 个明星模型；统一 `schema` 定义；新增模型 PR 模板化 |
| 视频任务长时间运行，用户关闭页面后状态丢失 | 中 | 任务实际由后端 Task 表持久化；重新打开页面可从 `/api/task` 拉回最近任务列表 |
| 上游图片/视频 URL 短时过期 | 中 | v1 让用户自行下载留底；v1.5 上代理 + 缓存 |
| 计费预估与实际不一致引起客诉 | 中 | 显示「预计」字样 + ⓘ 提示「最终以实际消耗为准」 |
| 部分模型（如 MJ）需要长 prompt 内联参数（`--ar` 等），用户不会写 | 低 | 参数面板把这些抽成可视化字段，提交时自动拼接 |
| 与 Playground 共享组件，重构改动可能波及 | 低 | 只**消费**通用组件（DebugPanel / ConfigManager / ImageUrlInput），不修改它们；新组件全部进 `web/src/components/creation/` |

---

## 15. Open Questions（待与团队对齐）

1. 路由命名 `/creation` vs `/studio`？
2. 是否复用 Playground 的本地存储 key 命名空间，还是另起一套？
3. 作品库 v1 用 IndexedDB 是否能满足 95% 场景？还是直接做后端 v1.5 一步到位？
4. 模型 schema 是否需要支持运营在后台**通过 UI 配置**新增模型支持，而不是改前端代码？
5. 是否需要一个管理员视角的「全站创作流量大盘」？（v2 候选）
6. 旧 Midjourney 页面（`/pages/Midjourney`）下线时机：v1.5 还是更晚？需考虑用户习惯迁移成本。
7. 视频 v1 默认接入哪几个模型？建议「Sora + Kling + Doubao Seedance」三选——分别覆盖海外旗舰 / 国产高画质 / 国产高性价比，能承接 80% 场景。
8. Prompt 优化用哪个 Chat 模型？默认 `gpt-4o-mini`，但若用户账户没该模型权限怎么处理？建议 fallback 到当前账户能用的最便宜 chat 模型。
9. 上传图片的临时图床：v1 走 new-api 自身存储（已有逻辑？）还是要求用户传 URL？两者用户体验差距大。
10. Sora 视频「Remix」入口要不要单独成子模式？还是只在已完成视频卡片上以「再创作」按钮形式存在？后者更轻、更符合 Sora 实际用法。

---

## 16. 附录

### A. 参考竞品

- **Midjourney Web**（https://midjourney.com）—— 网格 + 任务流，是异步图像生成的标杆
- **Krea**（https://krea.ai）—— 多模型聚合，模型卡片化展示
- **Sora**（OpenAI）—— 视频任务的状态展示与作品库范式
- **Replicate Playground** —— 每个模型一套独立参数 schema 的好例子
- **ComfyUI** —— 节点工作流参考，但 v1 不做

### B. 涉及代码与文件清单（预估）

```
新增：
  web/src/pages/Creation/                       — 创作中心页面
    index.jsx                                   — Tab 容器
    Image.jsx / Video.jsx / Gallery.jsx         — 各模态页面
  web/src/components/creation/                  — 新组件
    ModelPicker.jsx                             — 模型卡片选择器
    PromptInput.jsx                             — 提示词输入
    ParamPanel.jsx                              — 动态参数面板
    AssetCard.jsx / AssetGrid.jsx               — 作品展示
    TaskQueue.jsx                               — 任务队列
  web/src/constants/creation.constants.js       — 模型 schema
  web/src/hooks/creation/                       — 状态管理 hooks
  i18n/locales/*.json                           — 新文案

复用 / 轻改：
  web/src/components/playground/DebugPanel.jsx  — 调试面板
  web/src/components/playground/ImageUrlInput.jsx
  web/src/components/playground/ConfigManager.jsx
  web/src/components/layout/SiderBar.jsx        — 加菜单项
  web/src/App.js                                — 加路由

后端（v1 几乎无改动；v1.5 增量）：
  model/creation_asset.go                       — v1.5 新增
  controller/creation.go                        — v1.5 新增
  router/api-router.go                          — v1.5 注册路由
```

### C. 相关现有文档

- [`docs/channel-affinity.md`](../channel-affinity.md) — 渠道亲和度（任务路由相关）
- [`docs/billing-and-quota.md`](../billing-and-quota.md) — 计费体系
- [`docs/model-channel-config.md`](../model-channel-config.md) — 模型与渠道配置
- [`CLAUDE.md`](../../CLAUDE.md) — 项目工程规范（i18n / 数据库兼容 / JSON 等）
