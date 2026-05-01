# 创作中心（Creation Center）技术设计文档

> 版本：v0.1
> 作者：研发 / Claude
> 日期：2026-05-01
> 状态：评审前
> 配套产品文档：[`creation-center.md`](./creation-center.md)（v0.2）
> 适用范围：v1.0（MVP）+ v1.1 + v1.5（含作品库后端化）

---

## 0. TL;DR

- **前端新增独立模块** `web/src/pages/Creation/`，复用 Playground 的状态/请求/调试基础设施。
- **后端 v1.0 零改动**：所有视频/图像生成调用走现有的 `/v1/video/generations`、`/v1/images/generations`、`/kling/v1/...`、`/jimeng` 等路由；任务状态走现有 15s 后台轮询 + 前端按指数退避主动 `GET /v1/video/generations/:task_id`。
- **预扣费**已经在后端 `service/billing_session.go:144` 实现，前端只展示 estimate，不重复计算。
- **图像上传**：v1 走前端 base64 内联 + 文件大小预检（≤5MB），适配器层兼容 `http(s)://` 与 `data:image/...;base64,...` 两种形态；v1.5 新增 `POST /api/upload/image` 内置图床。
- **作品库**：v1 用 localStorage 起跑（沿用 `configStorage.js` 模式），v1.5 落库新表 `creation_assets`。
- **新增前端代码**约 25 个文件，~3000 行；**新增/修改后端代码**v1.0 ≈ 0；v1.5 新增 ≈ 600 行（新表 + 4 个接口 + 1 个上传接口）。

---

## 1. 范围与非目标

### 1.1 范围

| 阶段 | 功能 | 涉及层 |
|---|---|---|
| v1.0 | 创作中心骨架；图像 Tab（OpenAI Image + Doubao + Jimeng）；视频 Tab（Sora + Kling + Doubao Seedance）；本地作品历史 | 仅前端 |
| v1.1 | MJ 接入；Vidu/Hailuo；I2V / Keyframes 子模式；图生视频；提示词优化按钮；全语种 i18n | 前端 |
| v1.5 | 后端图床（`POST /api/upload/image`）；`creation_assets` 表 + 4 个 CRUD 接口；作品库迁移；下线旧 Midjourney 页面；Suno / TTS 音频 Tab | 前后端 |

### 1.2 非目标

- 不引入 WebSocket 用于任务状态推送（现有 15s 后台轮询 + 前端轮询足够）。
- 不在后端为创作中心新增独立的 BFF 层；继续直接消费 `/v1/...` 公开 API。
- 不修改 `relay/channel/task/*/adaptor.go` 任何一个适配器（参数兼容性纯前端归一化）。
- 不修改 `model/task.go`。
- v1.0 不引入新的 RBAC 维度，复用现有 token / group / user 鉴权。

---

## 2. 总体架构

### 2.1 分层视图

```
┌─────────────────────────────────────────────────────────────┐
│  Browser  ─────────────────────────────────────────────────  │
│                                                             │
│   pages/Creation/  ◄────  hooks/creation/  ◄──┐            │
│        │                       │               │            │
│        ▼                       ▼               │            │
│   components/creation/   services/creation/  ──┘            │
│   (UI primitives)        (协议适配 / 轮询 /  storage)       │
│                                                             │
│  ─── 复用 Playground ──                                     │
│   components/playground/DebugPanel, ConfigManager, ...     │
│   hooks/playground/useDataLoader (模型/分组拉取)           │
│   helpers/api.js (API 调用)                                │
└─────────────────────────────────────────────────────────────┘
            │ fetch / SSE
            ▼
┌─────────────────────────────────────────────────────────────┐
│  Gin (existing routes — NO CHANGES in v1.0)                │
│                                                             │
│   POST /v1/images/generations   →  controller.Relay         │
│   POST /v1/video/generations    →  controller.RelayTask     │
│   GET  /v1/video/generations/:id→  controller.RelayTaskFetch│
│   GET  /v1/videos/:id/content   →  controller.VideoProxy    │
│   POST /kling/v1/videos/...     →  controller.RelayTask     │
│   POST /jimeng                  →  controller.RelayTask     │
│   POST /mj/submit/imagine       →  controller.RelayMidjourney│
│   GET  /api/pricing             →  controller.GetPricing    │
│   GET  /api/user/models         →  controller.GetUserModels │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│  relay/relay_task.go  →  relay/channel/task/{kling,sora,…}  │
│  service/task_polling.go  (15 s 周期更新 Task.Status)        │
│  service/billing_session.go  (PreConsume / PostConsume)     │
│  model/task.go, model/pricing.go                            │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流（视频生成，端到端）

```
1. 用户在 创作中心-视频 Tab 选 Kling-v1-6, mode=t2v, prompt+param
2. 前端 services/creation/normalizer.js → UnifiedVideoParams → KlingPayload
3. 前端 fetch POST /kling/v1/videos/text2video  (Bearer <user-token>)
4. Gin → middleware.TokenAuth() → middleware.Distribute() → controller.RelayTask
5. relay_task.go: Init → Validate → EstimateBilling → PreConsume → adaptor.DoRequest → 上游
6. 上游返回 task_id；后端写入 model/task.go 表，HTTP 200 给前端
7. 前端 hooks/creation/useVideoTaskPolling 启动指数退避轮询：
   GET /v1/video/generations/:task_id  (3s × 10 → 10s × 6 → 30s × N，最长 15 min)
8. 后端 controller.RelayTaskFetch → adaptor.FetchTask → 返回 OpenAIVideo DTO
9. 前端检测到 status === 'completed' → 展示 video URL
   (URL 可以是上游签名 URL，或我们的 /v1/videos/:id/content 代理)
10. 后台 service/task_polling.go 同期轮询所有未完成任务 → 触发 PostConsumeQuota（最终结算）
```

### 2.3 关键复用清单

| 层 | 文件 | 复用方式 |
|---|---|---|
| 状态/存储模式 | `web/src/components/playground/configStorage.js` | 抽取通用 storage helper，创作中心新建独立 namespace |
| 数据加载 | `web/src/hooks/playground/useDataLoader.js` | 直接复用（参数 group→models 拉取通用） |
| 调试面板 | `web/src/components/playground/DebugPanel.jsx`, `SSEViewer.jsx`, `CodeViewer.jsx` | 通过 props 传入新的 debugData 即可 |
| 配置导入导出 | `web/src/components/playground/ConfigManager.jsx` | 通过 props 接管 |
| 浮动按钮 | `web/src/components/playground/FloatingButtons.jsx` | 直接复用 |
| API 调用 | `web/src/helpers/api.js` | 复用 fetch helper、错误格式化 |
| 侧边栏 | `web/src/components/layout/SiderBar.jsx` | 增加菜单项 |
| 路由注册 | `web/src/App.jsx` | 增加 4 条路由 |
| 模块开关 | `web/src/hooks/common/useSidebar.js`（DEFAULT_ADMIN_CONFIG） | 增加 `creation_center: true` |

---

## 3. 前端模块结构

### 3.1 文件树（v1.0 完成态）

```
web/src/
├── pages/
│   └── Creation/
│       ├── index.jsx                    入口路由组件，Tab 容器 + 子路由
│       ├── ImageTab.jsx                 图像生成页
│       ├── VideoTab.jsx                 视频生成页
│       ├── GalleryTab.jsx               作品库页（v1 走 localStorage）
│       └── TaskDetail.jsx               任务详情 Drawer
│
├── components/creation/
│   ├── ModelPicker.jsx                  模型卡片选择器
│   ├── ModelCard.jsx                    单个模型卡片
│   ├── PromptComposer.jsx               提示词输入 + 字数 + ✨优化 + 示例
│   ├── ImageSlot.jsx                    单个图片上传槽（拖/粘/URL）
│   ├── ImageSlotGroup.jsx               多槽容器（reference / keyframes）
│   ├── ParamPanel.jsx                   动态参数面板容器
│   ├── ParamFieldRenderer.jsx           按 schema 渲染单个字段
│   ├── CameraControl.jsx                Kling 镜头控制控件
│   ├── ModeTabs.jsx                     T2V/I2V/Keyframes/Reference Pill
│   ├── SubmitBar.jsx                    底部提交按钮 + 估价
│   ├── TaskQueuePanel.jsx               右侧任务队列
│   ├── AssetCard.jsx                    单个产物卡片（图/视频通用）
│   ├── AssetGrid.jsx                    产物网格容器
│   ├── VideoPlayer.jsx                  视频播放器（封装 HTML5 + 错误兜底）
│   ├── EstimateBadge.jsx                费用预估徽标
│   └── EmptyState.jsx                   空态/错误态共用组件
│
├── hooks/creation/
│   ├── useCreationState.js              基础状态：当前模型/参数/历史
│   ├── useImageGenerate.js              图像同步生成（POST /v1/images/generations）
│   ├── useVideoSubmit.js                视频任务提交
│   ├── useVideoTaskPolling.js           单任务轮询（指数退避）
│   ├── useTaskQueue.js                  本会话任务队列管理
│   ├── useAssetStore.js                 本地作品库（localStorage v1）
│   ├── useUnifiedDebug.js               填充 DebugPanel 需要的 debugData
│   └── usePromptEnhance.js              ✨ 提示词优化
│
├── services/creation/
│   ├── normalizer.js                    UnifiedParams → 各上游 payload
│   ├── endpointResolver.js              根据 model+mode 选 endpoint
│   ├── pricingEstimator.js              客户端估价（schema.pricing.estimate）
│   ├── pollingScheduler.js              指数退避计算工具
│   ├── imageEncoder.js                  本地文件 → base64 / 尺寸校验
│   └── creationStorage.js               localStorage 抽象（namespace = 'creation'）
│
├── constants/creation/
│   ├── index.js                         汇总导出
│   ├── modes.js                         子模式定义
│   ├── video-models/
│   │   ├── kling.js
│   │   ├── sora.js
│   │   ├── doubao.js
│   │   ├── hailuo.js          (v1.1)
│   │   ├── vidu.js            (v1.1)
│   │   └── jimeng.js
│   ├── image-models/
│   │   ├── openai.js
│   │   ├── doubao.js
│   │   ├── jimeng.js
│   │   └── mj.js              (v1.1)
│   └── prompt-examples.js
│
└── i18n/locales/zh-CN.json                追加 ~120 个 key
```

### 3.2 路由

`web/src/App.jsx` 在 `<Route path='/console/playground' .../>` 下方新增：

```jsx
<Route path='/creation' element={<Creation />}>
  <Route index element={<Navigate to='image' replace />} />
  <Route path='image' element={<ImageTab />} />
  <Route path='video' element={<VideoTab />} />
  <Route path='gallery' element={<GalleryTab />} />
</Route>
```

**不做 lazy load**——与 Playground 一致（项目惯例：直接 import）。整个 Creation 模块 gzip 后 ≈ 60-80 KB，可接受。

URL 参数支持：
- `?model=kling-v1-6` → 默认选中模型（Marketplace 跳转用）
- `?mode=i2v` → 默认选中子模式
- `?prompt=...` → 预填提示词

### 3.3 侧边栏

`web/src/hooks/common/useSidebar.js` 的 `DEFAULT_ADMIN_CONFIG`：

```js
const DEFAULT_ADMIN_CONFIG = {
  chat: {
    enabled: true,
    playground: true,
    creation_center: true,   // 新增
    chat: true,
  },
  // ...
};
```

`web/src/components/layout/SiderBar.jsx` 第 248-269 行的 `chatMenuItems`：

```jsx
const items = [
  { text: t('操练场'), itemKey: 'playground', to: '/playground' },
  { text: t('创作中心'), itemKey: 'creation_center', to: '/creation' },  // 新增
  { text: t('聊天'), itemKey: 'chat', items: chatItems },
];
```

`routerMap` 加 `creation_center: '/creation'`（line 54 附近）。

---

## 4. 核心数据结构

### 4.1 UnifiedVideoParams（前端唯一参数源）

```ts
// web/src/types/creation.d.ts (TypeScript 注释，纯文档作用)

export type CreationModality = 'image' | 'video' | 'audio';

export type VideoMode =
  | 't2v' | 'i2v' | 'keyframes'
  | 'reference' | 'subject' | 'remix';

export interface UnifiedVideoParams {
  model: string;
  mode: VideoMode;

  prompt: string;
  negative_prompt?: string;

  image_first?: string;        // URL 或 data:image/...;base64,...
  image_last?: string;
  images_ref?: string[];
  subject_image?: string;
  remix_from_task_id?: string;

  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  size?: string;
  seed?: number;
  n?: number;
  fps?: number;
  frames?: number;

  mode_quality?: 'std' | 'pro';
  cfg_scale?: number;
  motion_strength?: 'auto' | 'small' | 'medium' | 'large';
  camera_preset?: string;
  camera_advanced?: {
    horizontal?: number; vertical?: number;
    pan?: number; tilt?: number; roll?: number; zoom?: number;
  };

  prompt_optimizer?: boolean;
  fast_pretreatment?: boolean;
  generate_audio?: boolean;
  watermark?: boolean;

  callback_url?: string;
}
```

### 4.2 CreationModelSchema

```ts
export interface CreationModelSchema {
  modelName: string;
  displayName: string;
  vendor: string;
  icon: string;                  // 路径
  modality: CreationModality;
  modes: VideoMode[];            // 视频专用
  protocol:
    | 'openai-image' | 'openai-video' | 'mj'
    | 'kling' | 'jimeng' | 'replicate';
  endpointMap: Record<string, string>;     // mode → URL path
  fields: Record<string, ParamFieldSchema>;
  pricing: {
    unit: '张' | '秒' | '次';
    estimate: (params: UnifiedVideoParams) => number;  // 返回点数
  };
  imageInput?: {
    maxSizeMB: number;
    formats: string[];           // ['jpg', 'png', 'webp']
    minDimension?: number;
    maxDimension?: number;
    acceptedRatios?: string[];   // 用于上传后自动建议
  };
  exampleType: 'creative' | 'product' | 'cinematic'; // 示例库映射
}

export interface ParamFieldSchema {
  type: 'segmented' | 'select' | 'slider' | 'switch'
       | 'textarea' | 'number' | 'seed' | 'ratio' | 'camera';
  options?: any[];
  default?: any;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  group?: 'basic' | 'advanced' | 'camera' | 'webhook';
  visible?: (params: UnifiedVideoParams) => boolean;  // 联动显隐
}
```

### 4.3 LocalAsset（v1 作品库）

存储在 `localStorage`，key = `creation:assets:v1`。结构：

```ts
export interface LocalAsset {
  id: string;                   // 前端生成 nanoid
  modality: CreationModality;
  modelName: string;
  prompt: string;
  params: UnifiedVideoParams;
  status: 'success' | 'failed';
  taskId?: string;              // 视频/异步任务的上游 ID
  assetUrl: string;             // 主资源
  thumbnailUrl?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  estimatedQuota?: number;
  actualQuota?: number;
  errorMessage?: string;
  createdAt: number;            // ms
  favorite: boolean;
  note?: string;
}
```

**容量管理**：localStorage 5-10 MB 上限，每个 asset 不存图片/视频本体，只存 URL ≈ 1 KB；可保留 ≈ 5000 条。超过 1000 条时按时间裁剪并提示「升级到云端作品库」（v1.5 引导）。

### 4.4 v1.5：creation_assets 表

```go
// model/creation_asset.go (v1.5)
type CreationAsset struct {
    Id              int    `gorm:"primaryKey;autoIncrement"`
    UserId          int    `gorm:"index;not null"`
    TaskId          string `gorm:"index;type:varchar(191)"`     // 关联 Task.task_id
    Modality        string `gorm:"type:varchar(16);index;not null"`
    ModelName       string `gorm:"type:varchar(64);index"`
    Prompt          string `gorm:"type:text"`
    NegativePrompt  string `gorm:"type:text"`
    Params          string `gorm:"type:text"`                   // 序列化后的 UnifiedVideoParams
    AssetUrl        string `gorm:"type:text"`                   // 上游主资源 URL
    ProxyUrl        string `gorm:"type:text"`                   // 我方代理 URL（v2 落 OSS 后）
    ThumbnailUrl    string `gorm:"type:text"`
    Format          string `gorm:"type:varchar(16)"`            // mp4 / png / webp
    DurationSec     float64
    Width           int
    Height          int
    Quota           int                                          // 实际扣费
    Status          string `gorm:"type:varchar(16);index"`      // success / failed
    Favorite        bool   `gorm:"index;default:false"`
    Note            string `gorm:"type:text"`
    CreatedAt       int64  `gorm:"autoCreateTime;index"`
    UpdatedAt       int64  `gorm:"autoUpdateTime"`
}
```

**跨库兼容**（CLAUDE.md Rule 2）：
- JSON 用 `text` 而非 `JSONB`（PostgreSQL 也用 text，避免 SQLite 不支持）
- 时间戳用 `int64` Unix（避免不同方言时区问题）
- 索引在 `UserId + CreatedAt` 复合，`UserId + Favorite` 复合（高频查询）
- `Migrate()` 走 GORM AutoMigrate，无原生 SQL

---

## 5. 协议适配层（normalizer）

### 5.1 接口

```js
// web/src/services/creation/normalizer.js

export function normalize(params: UnifiedVideoParams, schema: CreationModelSchema)
  : { url: string; method: 'POST'; headers: object; body: any }
```

### 5.2 入口分发

```js
export function normalize(params, schema) {
  switch (schema.protocol) {
    case 'openai-video':  return toOpenAIVideo(params, schema);
    case 'kling':         return toKling(params, schema);
    case 'jimeng':        return toJimeng(params, schema);
    case 'openai-image':  return toOpenAIImage(params, schema);
    case 'mj':            return toMidjourney(params, schema);
    default:
      throw new CreationError('UNSUPPORTED_PROTOCOL', schema.protocol);
  }
}
```

### 5.3 关键转换示例

#### 5.3.1 Kling

```js
function toKling(p, schema) {
  const url = schema.endpointMap[p.mode] ?? schema.endpointMap.t2v;
  const body = {
    model_name: p.model,
    prompt: p.prompt,
    duration: String(p.duration ?? 5),       // Kling 接 string
    aspect_ratio: p.aspect_ratio ?? '16:9',
    mode: p.mode_quality ?? 'std',
    cfg_scale: p.cfg_scale,
    negative_prompt: p.negative_prompt,
  };
  if (p.mode === 'i2v' || p.mode === 'keyframes') body.image = p.image_first;
  if (p.mode === 'keyframes')                     body.image_tail = p.image_last;

  if (p.camera_preset || p.camera_advanced) {
    body.camera_control = p.camera_advanced
      ? { type: 'simple', config: p.camera_advanced }
      : { type: p.camera_preset };
  }
  if (p.callback_url) body.callback_url = p.callback_url;
  if (p.seed != null && p.seed >= 0) body.seed = p.seed;

  return { url, method: 'POST', headers: defaultHeaders(), body };
}
```

#### 5.3.2 Sora

```js
function toOpenAIVideo(p, schema) {
  // Sora、Doubao、Hailuo、Vidu 都走 /v1/video/generations
  const body = {
    model: p.model,
    prompt: p.prompt,
  };

  if (p.duration != null) body.duration = p.duration;
  if (p.size) body.size = p.size;
  else if (p.aspect_ratio && p.resolution) body.size = ratioToSize(p.aspect_ratio, p.resolution);
  if (p.seed != null && p.seed >= 0) body.seed = p.seed;
  if (p.n) body.n = p.n;
  if (p.fps) body.fps = p.fps;
  if (p.image_first) body.image = p.image_first;

  // 收纳到 metadata 让后端 adaptor 自取
  body.metadata = stripUndefined({
    negative_prompt: p.negative_prompt,
    cfg_scale: p.cfg_scale,
    mode: p.mode_quality,
    motion_strength: p.motion_strength,
    camera_fixed: p.camera_preset === 'fixed',
    generate_audio: p.generate_audio,
    watermark: p.watermark,
    prompt_optimizer: p.prompt_optimizer,
    fast_pretreatment: p.fast_pretreatment,
    image_last: p.image_last,
    images_ref: p.images_ref,
    subject_image: p.subject_image,
  });

  return {
    url: p.mode === 'remix'
      ? `/v1/videos/${p.remix_from_task_id}/remix`
      : '/v1/video/generations',
    method: 'POST', headers: defaultHeaders(), body,
  };
}
```

> 注：后端各 adaptor 已经在 `BuildRequestBody` 阶段从 `dto.VideoRequest.Metadata` 取自定义字段。这里**完全不修改后端**。

#### 5.3.3 OpenAI Image

```js
function toOpenAIImage(p, schema) {
  const body = {
    model: p.model,
    prompt: p.prompt,
    n: p.n ?? 1,
    size: p.size ?? '1024x1024',
  };
  if (p.image_first) {
    return { url: '/v1/images/edits', method: 'POST',
             headers: defaultHeaders(), body: { ...body, image: p.image_first } };
  }
  return { url: '/v1/images/generations', method: 'POST', headers: defaultHeaders(), body };
}
```

### 5.4 校验

```js
export function validate(params, schema) {
  const errs = [];
  if (!params.prompt?.trim()) errs.push({ field: 'prompt', msg: 'PROMPT_REQUIRED' });
  if (params.mode === 'i2v' && !params.image_first)
    errs.push({ field: 'image_first', msg: 'IMAGE_FIRST_REQUIRED' });
  if (params.mode === 'keyframes' && !params.image_last)
    errs.push({ field: 'image_last', msg: 'IMAGE_LAST_REQUIRED' });
  if (params.duration != null && schema.fields.duration?.options
      && !schema.fields.duration.options.includes(params.duration))
    errs.push({ field: 'duration', msg: 'DURATION_NOT_SUPPORTED' });
  // ... 字段级别校验
  return errs;
}
```

---

## 6. 异步任务轮询（前端）

### 6.1 设计

后端有 15 s 全局后台轮询（`service/task_polling.go:90`），但**用户在线**时这个粒度太粗。前端实现**每任务**的指数退避轮询，覆盖在线场景；用户离开页面后回退到后端轮询补漏。

### 6.2 退避表

| 阶段 | 间隔 | 持续 | 说明 |
|---|---|---|---|
| 0-30 s | 3 s | 10 次 | 任务启动初期，状态变化快 |
| 30 s-90 s | 10 s | 6 次 | 上游进入排队/计算 |
| 90 s-15 min | 30 s | ~28 次 | 长视频（Sora 12s 视频可能 8-12 min） |
| ≥15 min | 停止 | – | 提示「任务仍在处理，可在『任务队列』查看」，落入后端补漏 |

### 6.3 实现

```js
// web/src/hooks/creation/useVideoTaskPolling.js
export function useVideoTaskPolling(taskId, { onUpdate, onTerminal }) {
  const timerRef = useRef(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`/v1/video/generations/${encodeURIComponent(taskId)}`, {
          headers: { 'New-Api-User': getUserId() }
        });
        const data = await res.json();
        if (cancelled) return;
        onUpdate?.(data);
        if (['completed', 'failed', 'expired', 'canceled'].includes(data.status)) {
          onTerminal?.(data);
          return;
        }
      } catch (e) {
        // 网络错误：拉长间隔，重试
      }
      const elapsed = Date.now() - startedAt.current;
      if (elapsed > 15 * 60_000) { onTerminal?.({ status: 'timeout' }); return; }
      const delay =
        elapsed < 30_000  ? 3_000  :
        elapsed < 90_000  ? 10_000 :
                            30_000;
      timerRef.current = setTimeout(tick, delay);
    };

    tick();
    return () => { cancelled = true; clearTimeout(timerRef.current); };
  }, [taskId]);
}
```

### 6.4 多任务并发

`useTaskQueue` 内部维护 `Map<taskId, TaskState>`，每个任务独立 hook 实例。同时进行最多 8 个轮询（超过则只展示，不开新计时器，等下一次后端补漏拉数据）。

### 6.5 页面切换/刷新恢复

任务 ID 写入 `localStorage:creation:active_tasks:v1` JSON 数组。进入页面时拉取，对未结束的任务恢复轮询。这样用户刷新或导航离开后回来，能看到任务卡片继续转。

---

## 7. 提交与计费

### 7.1 估价（前端）

```js
// web/src/services/creation/pricingEstimator.js
export function estimateCost(params, schema, pricingMap) {
  const localPoints = schema.pricing.estimate(params);
  const modelPrice = pricingMap[schema.modelName]?.ModelPrice;
  if (modelPrice) {
    return { points: localPoints, yuan: localPoints * 0.005 /* 用户配额→元，从全局配置读 */ };
  }
  return { points: localPoints, yuan: null };
}
```

`pricingMap` 来自 `GET /api/pricing` 的 `data[]`（已包含 `ModelPrice` / `ModelRatio` / `SupportedEndpointTypes`）。

### 7.2 后端预扣

后端 `service/billing_session.go:144` 在任务提交阶段强制预扣（`ForcePreConsume=true`，line 197）。前端无需做事，但要处理两类响应：

- **HTTP 200 + 任务 ID** → 已扣费成功，进入轮询
- **HTTP 402 / 403 + 错误码 `INSUFFICIENT_QUOTA`** → 弹「配额不足」Modal，深链「去充值」

### 7.3 最终结算

后端在 `task_polling.go` 检测到任务终态时调用 `PostConsumeQuota` 进行差额结算 / 失败退款。前端不参与；只在轮询返回中读 `metadata.quota` 字段更新作品卡片显示「实际扣费」。

---

## 8. 图像上传

### 8.1 v1.0：base64 内联 + 严格预检

无后端图床。前端 `services/creation/imageEncoder.js`：

```js
export async function encodeImage(file, schema) {
  if (file.size > schema.imageInput.maxSizeMB * 1024 * 1024)
    throw new CreationError('IMAGE_TOO_LARGE');
  if (!schema.imageInput.formats.includes(file.type.replace('image/','')))
    throw new CreationError('IMAGE_FORMAT_UNSUPPORTED');
  const dim = await readDimensions(file);
  if (schema.imageInput.minDimension && Math.min(dim.w, dim.h) < schema.imageInput.minDimension)
    throw new CreationError('IMAGE_TOO_SMALL');
  return {
    dataUrl: await toDataURL(file),
    width: dim.w, height: dim.h, sizeBytes: file.size, mime: file.type,
  };
}
```

适配器侧的兼容性已确认：
- **Jimeng**：`adaptor.go:396` 已经做 `if HasPrefix(image, "http")` 自动分流 URL/base64。✓
- **Kling / Doubao / Hailuo / Vidu**：直接把字符串 pass-through 到上游；上游各家**均接受 data URI 或 base64**（在 v1 接入时按模型实测确认）。
- **Sora**：上游通过 multipart 接收文件，后端 adaptor 已实现转换；前端继续传 base64 即可。

**用户体验保护**：
- 单张 ≤ 5 MB（schema 内可调小，如 Jimeng 4.7 MB）
- 总请求体 ≤ 12 MB（对应 nginx 默认上限）
- 超出时给「请压缩或提供 URL」按钮

### 8.2 v1.5：内置图床

新增 `POST /api/upload/image`：

```go
// controller/upload.go (新增)
func UploadImage(c *gin.Context) {
    file, err := c.FormFile("file")
    // 校验大小 / mime / 用户配额
    // 落本地磁盘 /var/lib/new-api/uploads/{user_id}/{nanoid}.{ext}
    // 或 S3/OSS（按全局 setting 决定）
    // 返回 { url: "/api/upload/file/{nanoid}", expires_at: <ts> }
}
```

路由：

```go
// router/api-router.go (新增)
uploadGroup := router.Group("/api/upload")
uploadGroup.Use(middleware.UserAuth())
{
    uploadGroup.POST("/image", controller.UploadImage)
    uploadGroup.GET("/file/:id", controller.ServeUploadedFile)  // 不带 auth，凭 nanoid 鉴权
}
```

存储：默认 `local`；`setting/system_setting` 增加：

```yaml
upload:
  driver: local | s3
  local_path: /var/lib/new-api/uploads
  ttl_days: 7              # 7 天后清理
  s3:
    bucket, region, ...    # v1.5 可选
```

清理：复用现有定时任务框架（`service/cron.go`）增加每日清理过期文件。

---

## 9. 提示词优化（✨ 按钮）

### 9.1 流程

```
用户点 ✨ 优化
  ↓
前端 hooks/creation/usePromptEnhance:
  POST /pg/chat/completions (沿用 Playground 调用栈)
    body: {
      model: <用户配置的优化模型，默认 gpt-4o-mini>,
      messages: [
        { role: 'system', content: <PROMPT_OPTIMIZE_SYSTEM_PROMPT> },
        { role: 'user', content: <原 prompt> + 当前模型/模态信息 }
      ],
      stream: false
    }
  ↓
返回优化后的 prompt → 弹双 Tab「原文 / 优化」让用户选择
```

### 9.2 系统提示词（保存在 `constants/creation/prompt-templates.js`）

```js
export const PROMPT_OPTIMIZE_SYSTEM = `
You are a Prompt Engineer for {modality} generation. Rewrite the user's prompt so it:
- adds visual specifics (lighting, lens, composition, color palette)
- aligns with {modelName}'s known strengths and limitations
- stays under {maxLength} characters
- preserves the user's original intent and language
Return only the rewritten prompt, no explanation.
`;
```

### 9.3 模型选择

按以下优先级取模型：
1. 用户在创作中心设置中显式指定的「Prompt 优化模型」
2. 全局默认 `gpt-4o-mini`
3. 上面都不可用 → 取当前用户在 `/api/user/models` 中**最便宜**的 chat 模型
4. 全无 → 隐藏 ✨ 按钮，控件 tooltip「请配置可用 Chat 模型」

---

## 10. 调试面板复用

### 10.1 数据结构

复用 Playground 的 `DebugPanel` 接口：

```js
const debugData = {
  previewRequest: '...JSON string of unified params + normalized payload',
  previewTimestamp: 1714530000,
  request: '...实际发出的 body',
  response: '...上游响应',
  curl: 'curl -X POST ...',
  sseMessages: [],         // 创作中心同步图像可能空
  errorInfo: null,
};
```

### 10.2 cURL 生成

```js
// services/creation/curlBuilder.js
export function toCurl(req, token) {
  return [
    `curl -X POST '${location.origin}${req.url}' \\`,
    `  -H 'Authorization: Bearer ${token}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${JSON.stringify(req.body, null, 2)}'`,
  ].join('\n');
}
```

`token` 取当前选中的 Token 值（用户在 Token 页面保存的，前端已有 `getCurrentToken()` helper）。如果没有选择 Token，按钮 tooltip「请先在 Token 页面创建/选择 Token」。

---

## 11. 状态管理

### 11.1 useCreationState

```js
// web/src/hooks/creation/useCreationState.js
export function useCreationState(modality /* 'image' | 'video' */) {
  const [model, setModel]     = usePersisted(`creation:${modality}:model`, defaultModelOf(modality));
  const [mode, setMode]       = usePersisted(`creation:${modality}:mode`, 't2v');
  const [params, setParams]   = usePersisted(`creation:${modality}:params`, defaultParams(model, mode));
  const [history, setHistory] = useLocalAssetStore();   // 共享作品库

  const schema = useMemo(() => getModelSchema(model), [model]);

  // 模型切换：保留兼容字段，剥离不支持字段
  const switchModel = useCallback((next) => {
    const nextSchema = getModelSchema(next);
    setParams(filterByFields(params, nextSchema));
    setModel(next);
  }, [params]);

  return { model, schema, mode, params, history, setParams, switchModel, setMode };
}
```

### 11.2 持久化 Hook

```js
// web/src/hooks/creation/usePersisted.js
export function usePersisted(key, initialValue) {
  const [value, setValue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? initialValue; }
    catch { return initialValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue];
}
```

### 11.3 Context（最小化）

只用于 ImageSlot 的剪贴板事件冒泡，避免 props drilling：

```jsx
// web/src/contexts/CreationContext.jsx
export const CreationContext = createContext({
  onPasteImage: (slotName, dataUrl) => {},
  activeImageSlot: null,
  setActiveImageSlot: () => {},
});
```

不把核心状态放 context（避免大范围 re-render）。

---

## 12. API 契约

### 12.1 复用既有（v1.0 不新增）

| 用途 | Method + Path | Auth | 入参/响应 |
|---|---|---|---|
| 文生图 | `POST /v1/images/generations` | TokenAuth | OpenAI 标准 |
| 图生图 | `POST /v1/images/edits` | TokenAuth | multipart |
| 视频提交（OpenAI 兼容） | `POST /v1/video/generations` | TokenAuth | `dto.VideoRequest` |
| Sora 视频提交 | `POST /v1/videos` | TokenAuth | multipart 或 JSON |
| Sora Remix | `POST /v1/videos/:video_id/remix` | TokenAuth | `{ prompt }` |
| 视频任务查询 | `GET /v1/video/generations/:task_id` | TokenAuth | `dto.OpenAIVideo` |
| 视频代理播放 | `GET /v1/videos/:task_id/content` | TokenOrUserAuth | binary stream |
| Kling | `POST /kling/v1/videos/text2video`, `image2video` | TokenAuth + KlingRequestConvert | Kling 官方 schema |
| Jimeng | `POST /jimeng` | TokenAuth + JimengRequestConvert | Jimeng 官方 schema |
| MJ | `POST /mj/submit/imagine` 等 | TokenAuth | MJ proxy schema |
| 模型列表 | `GET /api/user/models?group=` | UserAuth (Cookie) | `{ data: string[] }` |
| 用户分组 | `GET /api/user/self/groups` | UserAuth | `{ data: object }` |
| 模型定价 | `GET /api/pricing` | 公开 | `{ data: Pricing[], group_ratio, supported_endpoint }` |

### 12.2 v1.5 新增

```
POST   /api/upload/image                  (上传图片，返回 URL)
GET    /api/upload/file/:id               (拉取上传的文件)

POST   /api/creation/asset                (作品入库)
GET    /api/creation/assets               (列表 + 筛选 + 分页)
PATCH  /api/creation/asset/:id            (更新备注/收藏)
DELETE /api/creation/asset/:id            (删除作品记录)
```

详细字段：

#### POST /api/creation/asset
```json
Request:
{
  "modality": "video",
  "model_name": "kling-v1-6",
  "task_id": "task_xxx",
  "asset_url": "https://...",
  "thumbnail_url": "https://...",
  "prompt": "...",
  "params": "{...}",                 // 序列化的 UnifiedVideoParams
  "format": "mp4",
  "width": 1280, "height": 720,
  "duration_sec": 5.0,
  "quota": 14
}

Response:
{ "success": true, "data": { "id": 123, ... } }
```

#### GET /api/creation/assets
```
Query: ?modality=&model_name=&favorite=&keyword=&page=1&page_size=24
Response: { "success": true, "data": { "items": [...], "total": 230 } }
```

---

## 13. 安全与权限

### 13.1 鉴权矩阵

| 场景 | 走的鉴权 | 来源 |
|---|---|---|
| 列模型 / 拉分组 | UserAuth (Cookie) | 现有 dashboard 鉴权 |
| 创作中心调上游 | TokenAuth (Bearer + 用户在 Token 页面创建的 sk-xxx) | 现有 |
| 视频代理播放 | TokenOrUserAuth | 现有 |
| 上传图片 (v1.5) | UserAuth | 新增（仅登录用户可上传） |
| 作品库 CRUD (v1.5) | UserAuth | 新增 |

> ⚠ **关键约束**：创作中心提交生成请求时**必须使用一个有效 Token**。原因：上游计费走 token 通道（`middleware.TokenAuth` 设置 `token_id` / `token_quota` 后，`PreConsume` 才能正确扣费）。

**实现**：进入创作中心时，前端检查用户是否已选 Token。若无：
1. 弹窗「使用创作中心需要先创建并选择一个 Token」
2. 提供「快速创建」按钮 → 调 `/api/token/` 创建一个 1000 刀额度的默认 Token（命名 `creation-default`），自动选中
3. 或跳转到 `/console/token` 让用户手动管理

把选中的 Token Key 缓存到 `localStorage:creation:active_token`（按用户 ID 隔离），所有请求 `Authorization: Bearer <key>`。

### 13.2 上传安全（v1.5）

- 文件类型白名单：`image/jpeg|png|webp`
- 文件大小：单文件 ≤ 10 MB；用户每日上传 ≤ 200 MB（写入 `model/usedata`）
- 文件名：抛弃用户原始文件名，统一 `nanoid().ext`
- 存储路径：`{root}/{user_id}/{nanoid}.{ext}`，不落用户名
- 返回 URL：`/api/upload/file/:id`，不暴露磁盘路径
- ServeUploadedFile：检查文件存在、ttl 未过、不允许目录穿越；不强校验 user_id（任何拥有 URL 的人可访问，与图床惯例一致）。隐私敏感的图后续考虑加签名

### 13.3 输入校验

- Prompt 长度上限 10000 字符（前后端各一道）
- URL 字段：仅允许 `http://`, `https://`, `data:image/`, `/api/upload/file/` 前缀；防 SSRF（`file://`, `gopher://` 等拒绝）
- callback_url：必须 `https://`，且不允许内网 IP（后端已有 `service/safe_url.go`）

---

## 14. 性能与扩容

### 14.1 前端

- 模型 schema **静态导入**，启动期全部加载（每个 schema ≈ 1 KB，总 ≈ 30 KB）
- `pricingMap` 全局缓存 60 s
- 视频卡片用 `IntersectionObserver` 懒加载 `<video preload>` 属性，列表多时不一次性 buffer
- 作品库（v1）按时间分页渲染，每页 24 条
- 图片上传 base64 不直接放 React state（diff 性能差）；存到 `useRef`，只在提交时取出

### 14.2 后端

v1.0 无变更——任务提交、查询、扣费走原链路；后台轮询不变（仍 15 s）。

v1.5 新增表的预计写入量：
- 单用户日活生成 50 次 → 50 行/天
- 1000 DAU → 50K 行/天 → 1.5M 行/月
- `creation_assets` 表预估 1 年 18M 行；`UserId + CreatedAt` 复合索引足以满足列表分页

需要时（>5M 行）按 `created_at` 月份分区（PostgreSQL）或归档（MySQL）。v1.5 不做。

### 14.3 轮询负载

每用户在线时，并发任务数 ≤ 3（前端约束 + 上游单 Token 限流）。每个任务前 30 s @ 3 s/次 = 10 次请求 + 后续 ≈ 15 次 = 25 次/任务/15 min。1000 DAU × 3 任务 = 75000 请求/15min ≈ 83 QPS。控制器层（`controller.RelayTaskFetch`）单机轻松承载。

---

## 15. 可观测性

### 15.1 后端

复用 `setting/sentry`：异常自动上报。新增的 v1.5 controller 沿用 `gin.Logger()` 中间件。

新增打点（v1.5）：
- `creation.asset.created` (modality, model_name, status)
- `creation.upload.size` (用户每日累计上传量直方图)

### 15.2 前端

复用现有的 Sentry/前端监控（如果已配置）。新增三个事件：
- `creation_submit_total` (modality, model)
- `creation_task_succeed` / `creation_task_failed` (附 duration_ms)
- `creation_estimate_vs_actual` (估价点数 vs 实际扣费，用于校准 schema.pricing.estimate)

---

## 16. 国际化

### 16.1 文案登记

按 CLAUDE.md：所有中文文案进入 `web/src/i18n/locales/zh-CN.json`。

新增 ≈ 120 个 key。命名空间统一前缀**避免冲突**：
- `创作中心` (3 处), `图像生成`, `视频生成`, `作品库` (顶层导航)
- `子模式_文生视频`, `子模式_图生视频`, `子模式_首尾帧`, ...
- `参数_时长`, `参数_宽高比`, `参数_分辨率`, `参数_随机种子`, `参数_负向提示词`, ...
- `提示_配额不足`, `提示_请先选择Token`, `提示_文件过大`, ...

> 项目 i18n 使用「中文做 key」的扁平结构（`web/src/i18n/locales/zh-CN.json`），所以这些 key **本身就是中文**；其他语言通过 `bun run i18n:extract` + `bun run i18n:sync` 工具翻译。

### 16.2 工具命令

```bash
cd web
bun run i18n:extract   # 扫码新出现的 t('xxx') 调用，写入 zh-CN.json
bun run i18n:sync      # 同步到 en.json / fr.json / ru.json / ja.json / vi.json
bun run i18n:lint      # 检查未翻译/孤儿 key
```

v1.0 至少完成 `zh-CN.json` + `en.json`；v1.1 补齐其余 4 种语言。

---

## 17. 测试策略

### 17.1 单元测试（前端）

| 模块 | 重点 |
|---|---|
| `services/creation/normalizer.js` | 每个 protocol 各 5+ 用例：必填字段、可选字段、模式切换、camera_control |
| `services/creation/pricingEstimator.js` | 各模型 schema 估价：边界值、null 兼容 |
| `services/creation/pollingScheduler.js` | 间隔表正确性、超时退出 |
| `services/creation/imageEncoder.js` | 大小/格式/尺寸预检、各种异常 |
| `hooks/creation/usePersisted.js` | localStorage 损坏、quota 满恢复 |

测试框架：项目现有 vitest（`web/vitest.config.js`，如不存在则首版引入）。目标覆盖率 ≥ 70%。

### 17.2 集成测试

- **Mock 上游**：前端层用 MSW 模拟 `/v1/video/generations`、`/v1/video/generations/:id` 各种状态序列（queued → in_progress → completed / failed / timeout），验证 UI 正确响应
- **多任务并发**：同时提交 3 个，验证轮询独立、不互相阻塞

### 17.3 后端测试（仅 v1.5）

- `controller/upload_test.go`：文件大小 / mime 校验 / 用户配额
- `controller/creation_test.go`：CRUD + 用户隔离（A 用户不能读/删 B 的 asset）
- `model/creation_asset_test.go`：跨 SQLite / MySQL / PostgreSQL 三库 AutoMigrate

### 17.4 手工 e2e（每次发版）

按 `docs/pm/creation-center.md §10.1` 验收指标走一遍 happy path：
- [ ] 提交一个 Sora 视频，等到完成、播放、下载
- [ ] 切换到 Kling，I2V 上传一张图，Keyframes 模式，提交，验证两图都到上游
- [ ] 故意填一个超大上传文件，验证拦截
- [ ] 删一个 Token，验证创作中心正确提示「无可用 Token」
- [ ] 切换到 zh / en / ja，验证文案

---

## 18. 工程任务拆分（实施排期）

### v1.0（M1，~2.5 周，1 前端 + 0.2 后端）

```
W1
├─ T01 [前端] 路由 / 菜单 / Tab 容器 / Empty 状态                    1d
├─ T02 [前端] useCreationState + usePersisted + 默认 schema 加载    1d
├─ T03 [前端] ModelPicker + ModelCard + 按 SupportedEndpointTypes  1.5d
├─ T04 [前端] PromptComposer + 字数计 + 示例库                      0.5d
├─ T05 [前端] ParamPanel + ParamFieldRenderer + 折叠分组            1.5d
W2
├─ T06 [前端] services/creation/normalizer.js（OpenAI Image / Sora / 通用 video）  1.5d
├─ T07 [前端] useImageGenerate（同步图像）+ AssetCard 图渲染           1d
├─ T08 [前端] useVideoSubmit + useVideoTaskPolling + 任务卡片         2d
├─ T09 [前端] DebugPanel 复用 + curlBuilder                          0.5d
W3
├─ T10 [前端] EstimateBadge + 计费拉取                              0.5d
├─ T11 [前端] Token 选择守卫 + 创建快捷入口                          0.5d
├─ T12 [前端] 作品库（localStorage）+ 搜索 + 收藏                    1d
├─ T13 [前端] zh-CN + en 文案                                       0.5d
├─ T14 [QA]   手工 e2e 三机型 + 移动端                              1d
├─ T15 [前端] Bug 修复 buffer                                        1d
```

### v1.1（M2，~2 周）

```
├─ T16 [前端] Kling normalizer + 镜头控制 UI + 测试                  2d
├─ T17 [前端] Jimeng/Vidu/Hailuo normalizer + schema                 2d
├─ T18 [前端] ImageSlot + base64 编码 + 多槽 / 拖拽 / 粘贴          1.5d
├─ T19 [前端] MJ 接入（Imagine / Variation / Upscale）              2d
├─ T20 [前端] 提示词优化 ✨ 按钮 + Modal                            1d
├─ T21 [前端] 全语种 i18n 同步 + lint                                0.5d
├─ T22 [QA]   多模型多模式 e2e                                      1d
```

### v1.5（M3，~2 周，1 前端 + 1 后端）

```
后端
├─ T23 [后] model/creation_asset.go + AutoMigrate（三库验证）       1d
├─ T24 [后] controller/creation.go（4 接口）+ 测试                  1.5d
├─ T25 [后] controller/upload.go + 路由 + 配额 + 清理 cron         2d
├─ T26 [后] safe_url 增强 + 鉴权矩阵复核                            0.5d

前端
├─ T27 [前] 作品库切换到云端 + 数据迁移（localStorage → 后端）       1.5d
├─ T28 [前] ImageSlot 切换走 /api/upload/image                      0.5d
├─ T29 [前] 旧 Midjourney 页面下线 + 路由 redirect                  0.5d
├─ T30 [前] Suno / TTS 音频 Tab                                    1.5d
├─ T31 [QA]  e2e 全量回归                                          1d
```

---

## 19. 上线与回滚

### 19.1 灰度

通过 `useSidebar` 的 admin 开关（`isModuleVisible('chat', 'creation_center')`）控制。

阶段：
1. **内测（D-7）**：仅管理员账户可见。
2. **小流量（D0）**：开放给所有用户，但在 Marketplace 模型卡上不显示「去创作」按钮。监测错误率、平均完成时间。
3. **全量（D+7）**：Marketplace 增加深链入口。
4. **替换 MJ 页面（D+30）**：旧路由 `/console/midjourney` 301 跳 `/creation/image`。

### 19.2 回滚

后端 v1.0 零改动 → 任何时候关掉前端模块开关即可。
v1.5 新增的接口/表通过 feature flag `setting.system.EnableCreationCloudGallery` 控制；关闭后前端自动回退到 localStorage 模式，老数据保留。

### 19.3 数据库迁移（v1.5）

`model/creation_asset.go` 通过 GORM `AutoMigrate` 在启动时自动建表。SQLite/MySQL/PostgreSQL 都走 GORM 抽象，避免方言差异（CLAUDE.md Rule 2）。

不写「降级 SQL」——因为新表不影响存量数据，回滚只需关 feature flag。如真要清理，提供独立脚本 `scripts/drop_creation_tables.sql`（手动执行）。

---

## 20. 风险与对策（技术层）

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| 上游模型变更字段，schema 不同步 | 中 | 中 | normalizer 在 catch 内尝试 fallback；Sentry 上报「unknown_field」事件；schema 改动列入接入新模型的 PR checklist |
| base64 体积撑爆请求 | 中 | 中 | 前端预检 5/10/12 MB 三道阈值；`/api/upload/image` v1.5 一定上 |
| 用户同时跑 10+ 任务，前端轮询风暴 | 低 | 低 | 并发上限 8；超出则只展示，不轮询 |
| `RelayTaskFetch` 上游失败导致任务卡 in_progress | 中 | 高 | 后端 `task_polling.go` 已有 `sweepTimedOutTasks`，超时自动失败 + 退款；前端 15 min 超时仅 UI 提示 |
| 用户 Token 突然被禁用 → 中途 401 | 低 | 中 | 检测到 401 弹「请重新选择 Token」，已提交任务后端会自然失败退款 |
| localStorage 容量溢出 | 中 | 低 | 滚动裁剪 + 「升级到云端作品库」引导（v1.5） |
| Camera control 与新版 Kling 协议不兼容 | 低 | 中 | normalizer 走 `try { ... } catch` 兜底，把高级字段降为简单预设 |
| 旧 MJ 页面用户不知道新入口 | 中 | 低 | v1.0-v1.5 期并存；下线时 Toast「已迁移到创作中心，详情见…」 |

---

## 21. Open Questions for Tech Review

1. **Token 守卫**：v1 走「检测无 Token 时弹窗 + 快速创建」是否会让初次进入体验割裂？是否应在用户首次注册时就自动建一个默认 Token？
2. **base64 vs 强制 URL**：v1 不上图床，让 80% 不会写 URL 的轻度用户走 base64，是否会让 nginx / Gin 配置（`client_max_body_size` / `MaxMultipartMemory`）需要先调整？默认 1 MB / 32 MB，需要确认。
3. **Schema 后端化时机**：v1.5 还是更晚？后端化的好处是运营加新模型不用发版，坏处是要设计一套 schema CRUD 后台。建议 v2 评估。
4. **MJ 接入位置**：MJ 协议跟 OpenAI Image 差异大（异步 + 多步交互 imagine→variation→upscale）。是放进图像 Tab 用「子模式」分支，还是单独一个「MJ」次级 Tab？建议前者，但视交互复杂度可能拆。
5. **Sora 必须 multipart 提交**：现有 `videoV1Router.POST("/videos", controller.RelayTask)` 走 multipart 还是 JSON？需在实现前确认 `relay_task.go` 的 `ValidateMultipartDirect` 行为，确保前端可以走 JSON。
6. **图床方案**：v1.5 默认 local 磁盘，还是直接强制 S3/OSS？多机部署用户用 local 会数据漂移。建议默认 local，文档强调多机部署需配 S3。
7. **创作中心是否进入「免费试用」入口**：未登录用户能不能跑 1 次免费体验？这涉及到无 Token 鉴权链路改造，**建议 v1 暂不做**。

---

## 22. 附录

### A. 关键文件 file:line 引用

| 用途 | 路径 | 行 |
|---|---|---|
| 视频提交路由 | `router/video-router.go` | 23 |
| RelayTask 入口 | `controller/relay.go` | 487-501 |
| 任务提交主流程 | `relay/relay_task.go` | 144-215 |
| 任务表定义 | `model/task.go` | 44-66 |
| 任务后台轮询 | `service/task_polling.go` | 90-138 |
| 预扣费 | `service/billing_session.go` | 144-191 |
| Pricing 接口 | `controller/pricing.go` | 12-63 |
| 模型列表接口 | `controller/user.go` | 575-646 |
| TokenAuth | `middleware/auth.go` | 260-382 |
| TokenOrUserAuth | `middleware/auth.go` | 187-201 |
| Kling adaptor | `relay/channel/task/kling/adaptor.go` | 121-188 |
| Jimeng base64 自动识别 | `relay/channel/task/jimeng/adaptor.go` | 396 |
| Playground 入口 | `web/src/pages/Playground/index.jsx` | 1-565 |
| usePlaygroundState | `web/src/hooks/playground/usePlaygroundState.js` | 37 |
| useApiRequest（fetch + sse.js） | `web/src/hooks/playground/useApiRequest.jsx` | 35 |
| useDataLoader（拉模型/分组） | `web/src/hooks/playground/useDataLoader.js` | 31-139 |
| configStorage（localStorage） | `web/src/components/playground/configStorage.js` | 全 |
| useSidebar / DEFAULT_ADMIN_CONFIG | `web/src/hooks/common/useSidebar.js` | 28-60, 277-283 |
| SiderBar 操练场菜单 | `web/src/components/layout/SiderBar.jsx` | 248-269 |
| 路由注册 | `web/src/App.jsx` | 51, 176-179 |
| i18n 入口 | `web/src/i18n/i18n.js` | 20-55 |
| zh-CN 翻译 | `web/src/i18n/locales/zh-CN.json` | – |

### B. 配置项（settings.json）

v1.5 新增系统设置（`setting/system_setting/`）：

```yaml
creation_center:
  enabled: true                        # 全局开关
  cloud_gallery_enabled: false         # v1.5 默认关，灰度后开
  upload:
    driver: local                      # local | s3
    local_path: /var/lib/new-api/uploads
    max_file_mb: 10
    daily_quota_mb: 200
    ttl_days: 7
  default_prompt_optimizer_model: gpt-4o-mini
  polling:
    max_minutes: 15
```

### C. 协议字段映射表（详见 PM 文档 §6.2，本文不重复）
