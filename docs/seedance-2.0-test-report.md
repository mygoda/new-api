# doubao-seedance-2.0 视频生成 — 测试报告

| 项目 | 内容 |
|---|---|
| 被测模型 | `doubao-seedance-2.0`（视频生成，异步任务） |
| 测试入口 | `https://lovetoken.cc`（公网回源 huoshan-web `115.190.160.25`，经 volc ALB） |
| 上游渠道 | #24 豆包-【cubicspaces】，type 54，base_url `https://www.cubicspace.cn`（兼容网关，透传模式） |
| 测试日期 | 2026-06-16 |
| 鉴权 | `Authorization: Bearer sk-****`（已脱敏） |
| 测试范围 | 功能场景 + 计费四档验证 + 真人专项流程 + 异常/边界 |
| 结论 | 功能与计费全部通过；真人图须走「审核→生成」两步流程（已验证闭环） |

---

## 1. 接口契约

| 动作 | 方法 / 路径 |
|---|---|
| 提交视频任务 | `POST /v1/video/generations` |
| 轮询任务结果 | `GET /v1/video/generations/{task_id}` |
| 图片审核入库（真人/入库素材） | `POST /v1/images/moderations`（别名 `/v1/assets/moderations`） |

**请求体字段**：`model`、`prompt`、`images[]` + `image_roles[]`（`first_frame`/`last_frame`/`reference_image`）、`videos[]`（参考视频）、`audios[]`（参考音频）；
`resolution`/`ratio`/`duration`/`generate_audio`/`watermark`/`tools` 等放入 `metadata`。

---

## 2. 测试流程（方法论）

每个用例统一按以下流程执行，并对结果做双重校验（功能 + 计费）：

```
①  POST /v1/video/generations            提交任务，拿 task_id
        │
②  GET  /v1/video/generations/{task_id}   每 6s 轮询，直到 queued→in_progress→completed/failed
        │
③  校验功能：completed 且返回可访问的 video_url（火山 TOS mp4）
        │
④  校验计费：查 huoshan MySQL（172.16.0.224）logs 表该 task 的消费记录(type=2)，
            读 other 字段的「命中规则 / 条件分价 / 请求维度」，比对期望单价
```

**真人/入库图片素材**额外需要前置审核（见第 5 节）：

```
①  POST /v1/images/moderations  {model, image_url:<公网URL>, asset_type:"Image"}
        │  上游(cubicspace/火山 ark)拉取图片 → 校验 → 入库
②  返回 data.items[].asset_url = "asset://<id>"   (status:approved)
③  用 asset://<id> 作为 images[] 提交视频生成（第 2 节流程）
```

**计费引擎说明（条件分价 v2）**：option `ConditionalRatiosV2` 按维度 `resolution` + `has_video_input` 命中规则，
将基准倍率（3.665 ≈ 53.51 元/百万token）下调到目标单价。注意：

- `resolution` 仅在请求显式传入时进入维度快照；**不传 resolution 不会命中 1080p 档**，自动回退到 720p 档。
- `has_video_input` 取决于最终上游请求体的 `content[]` 是否含 `video_url` 项（即是否传 `videos[]`）。
- 规则按「条件最具体」匹配：1080p 请求命中 2 条件规则，720p/480p 命中 1 条件规则。

---

## 3. 测试场景与结果汇总

| # | 场景 | 输入要点 | 功能 | 计费命中 |
|---|---|---|---|---|
| 1 | 文生视频 1080p | prompt + `metadata.resolution=1080p` | ✅ 出视频 | 51 元/M ✅ |
| 2 | 文生视频 720p | prompt + `resolution=720p` | ✅ | 46 元/M ✅ |
| 3 | 文生视频 不传分辨率 | prompt（无 resolution） | ✅ | 回退 46 元/M ✅ |
| 4 | 图生视频·首帧（非真人/logo） | `images:[logo]`,`image_roles:[first_frame]` | ✅ | 46 元/M ✅ |
| 5 | 图生视频·首帧/参考（真人**直传**） | `images:[真人base64]` | ❌ 上游隐私拦截 | —（预期，须走审核） |
| 6 | **真人·审核→参考图生成** | `images:[asset://...]`,`image_roles:[reference_image]` | ✅ **出视频** | 46 元/M ✅ |
| 7 | 参考视频 1080p（有视频输入） | `videos:[mp4]`,`resolution=1080p` | ✅ | 31 元/M ✅ |
| 8 | 参考视频 720p（有视频输入） | `videos:[mp4]`,`resolution=720p` | ✅ | 28 元/M ✅ |
| 9 | 缺 prompt 且无图 | 仅 model | ✅ 正确 400 | —（`prompt is required`） |

**任务凭证（部分）**：

| 场景 | task_id | 实扣 quota |
|---|---|---|
| 文生 720p | task_U8N7vSMmSGDt1QCCIT5hGnPdZs2990um | 342,680 |
| 文生 1080p | task_NB0b21a5CduAMKqagEth91EA5v7QbQtL | 380,404 |
| 文生 不传分辨率 | task_AclCzrkWfKl1H4gfrR0JfIcQSjPiLq5V | 343,109 |
| 非真人首帧 720p | task_23oIZSypeKwz7yB7MLSXwazEWb7VRWTZ | 343,109 |
| 参考视频 720p | task_pj5TXpJ1hIBrdKQ0l0MQW1xiFlIWoi7M | 415,972 |
| 参考视频 1080p | task_aGVl6MYV8JckoXuzKU6bAm0lvF8wARlz | 460,541 |
| **真人参考图生成** | task_V8v5axHPzZtn5arpi6hkJYszHRPSQKaR | 345,270 |

---

## 4. 计费验证矩阵

条件分价四档 + 回退档，全部与配置精确一致：

| 分辨率 | 带视频输入 | 命中规则 | 实际单价 | 期望 | 结果 |
|---|---|---|---|---|---|
| 1080p | 否 | 1080P 无视频输入 | 51.00 元/M | 51 | ✅ |
| 1080p | 是 | 1080P 有视频输入 | 31.00 元/M | 31 | ✅ |
| 480P/720P | 否 | 480P/720P 无视频输入 | 46.00 元/M | 46 | ✅ |
| 480P/720P | 是 | 480P/720P 有视频输入 | 28.00 元/M | 28 | ✅ |
| 不传 | 否 | （回退）480P/720P 无视频输入 | 46.00 元/M | 46 | ✅ |

> 基准：模型倍率 3.665 = 53.51 元/百万token；条件分价按规则下调。日志 `other` 逐条记录了命中规则、目标单价、乘子、请求维度快照，可追溯。

**计费日志样例（真人参考图生成）**：

```json
{
  "actual_quota": 345270,
  "task_id": "task_V8v5axHPzZtn5arpi6hkJYszHRPSQKaR",
  "命中规则": "480P/720P 无视频输入",
  "条件分价": "输入包含视频=否 → 46.00 元/百万token (乘子 0.8597)",
  "计费基准": "53.51 元/百万token (倍率 3.6650)",
  "请求维度": "输入包含音频=否, 输入包含视频=否, 输出分辨率=720p"
}
```

---

## 5. 真人功能专项（核心结论）

**真人图不能直接传入**：直传（base64 / 普通 URL）会被上游火山方舟拒绝：

```
InputImageSensitiveContentDetected.PrivacyInformation:
The request failed because the input image may contain real person.
```

这是**火山 ark 的隐私合规策略**，非网关问题 —— 同一 `first_frame` 用非真人图（logo）可正常出视频。

**正确流程：先审核入库，再用 asset:// 生成**

**第 1 步 — 审核入库**
```http
POST /v1/images/moderations
{ "model":"doubao-seedance-2.0", "image_url":"https://<公网图片URL>.jpg", "asset_type":"Image" }
```
成功响应：
```json
{ "code":"success","data":{ "status":"approved",
  "items":[{ "asset_url":"asset://asset-20260616174026-pn6k9", "passed":true }] } }
```

**第 2 步 — 用 asset:// 生成**
```http
POST /v1/video/generations
{ "model":"doubao-seedance-2.0", "images":["asset://asset-20260616174026-pn6k9"],
  "image_roles":["reference_image"], "prompt":"这个人在咖啡馆里转头看向镜头，自然微笑",
  "metadata":{ "resolution":"720p", "duration":5 } }
```
→ 任务 completed，输出真实真人视频，计费命中 46 元/M ✅

**约束与注意**：
- 审核为**上游拉图**，`image_url` 必须**公网可达**；
- 火山 ark 要求图片**宽 300–6000px**（logo 180px 被拒 `Width must be between 300px and 6000px`，zhenren 1440px 通过）；
- 同一批次只提交同一种素材类型，图片审核固定 `asset_type:"Image"`；
- 入库 asset 默认 **7 天有效**；真人/授权素材也可用 `asset://<id>` 引用。
- 本次测试真人图通过临时图床（litterbox，1 小时自动过期）提供公网 URL，测试后自动失效。

---

## 6. 异常 / 边界

| 用例 | 预期 | 实际 | 结果 |
|---|---|---|---|
| 缺 prompt 且无 image | 400 报错 | `400 {"code":"invalid_request","message":"prompt is required"}` | ✅ |
| 真人图直传 | 上游拒绝并透传错误 | `400 InputImageSensitiveContentDetected.PrivacyInformation` | ✅（网关正确透传） |
| 不传 resolution | 不误命中 1080p 档 | 回退 480P/720P 档（46 元/M） | ✅ |
| 参考视频 URL 截断 | 下载失败 | `invalid_video_url / 403`（换完整签名 URL 后正常） | ✅（测试脚本问题，非接口） |

---

## 7. 结论与建议

1. **功能**：文生视频、图生视频（首帧/参考图）、视频生视频（参考视频）、真人参考图生成，均验证通过；异常路径报错正确。
2. **计费**：条件分价四档（51/31/46/28）+ 回退档全部精确命中，日志可追溯。
3. **真人功能**：必须走「`/v1/images/moderations` 审核入库 → `asset://` → 生成」两步流程；直传真人图被上游隐私策略拦截（属预期）。**建议在面向客户的文档/SDK 中显著标注此流程**，避免客户直传被拒后误判为故障。
4. **成本**：本次共成功生成 7 条 5s 视频，累计约 **$5.3 ≈ 39 元**；3 个真人直传用例提交即被拒、未扣费。

---

## 8. 未覆盖项（需素材）

| 子能力 | 说明 | 所需素材 |
|---|---|---|
| `reference_audio` 参考音频 | `audios:[wav]`，role 固定 `reference_audio` | 公网音频 URL |
| `generate_audio` 有声视频 | `metadata.generate_audio=true` | — |
| `tools:[{type:web_search}]` | Seedance 2.0 联网搜索 | — |
| 首尾帧 `last_frame`、多图参考 | 需第二张素材图 | 第二张图 |

---

## 附录 A：请求样例

**文生视频（1080p）**
```json
POST /v1/video/generations
{ "model":"doubao-seedance-2.0", "prompt":"海浪拍打礁石，黄昏，电影感",
  "metadata":{ "resolution":"1080p", "ratio":"16:9", "duration":5 } }
```

**参考视频（720p，有视频输入档）**
```json
POST /v1/video/generations
{ "model":"doubao-seedance-2.0", "prompt":"延续这段镜头，镜头缓慢拉远",
  "videos":["https://<可下载的mp4 URL>"],
  "metadata":{ "resolution":"720p", "duration":5 } }
```

**轮询**
```http
GET /v1/video/generations/{task_id}
Authorization: Bearer sk-****
```

## 附录 B：计费维度（条件分价 v2 可观测维度）

| 维度 key | 含义 | 取值 |
|---|---|---|
| `resolution` | 输出分辨率 | 480p / 720p / 1080p |
| `has_video_input` | content 是否含 video_url | true / false |
| `has_audio_input` | content 是否含 audio_url | true / false |
| `generate_audio` | 是否生成原生音频 | true / false |
| `draft` | 样片模式（Seedance 1.5 pro） | true / false |
| `watermark` | 是否加水印 | true / false |
| `aspect_ratio` | 输出宽高比 | 16:9 / 9:16 / 1:1 / adaptive … |
