# 模型渠道配置与交叉统计

## 概述

本功能提供两个核心能力：

1. **模型渠道交叉统计** — 在数据看板中，按"模型 × 渠道"维度查看每个渠道对每个模型的性能表现（错误率、延迟、吞吐量等）
2. **模型渠道配置（Ability 管理）** — 支持对同一渠道的不同模型设置不同的优先级和权重，实现精细化流量分配

---

## 背景

此前系统的统计和配置存在以下局限：

| 维度 | 原有能力 | 局限 |
|------|----------|------|
| 渠道统计 | 按渠道聚合所有模型的统计 | 无法区分同一渠道上不同模型的表现 |
| 模型统计 | 按模型聚合所有渠道的统计 | 无法区分同一模型在不同渠道的表现 |
| 优先级/权重 | 在渠道级别统一配置 | 同一渠道的所有模型共享相同的优先级和权重 |

**举例**：渠道 A 同时提供 `gpt-4` 和 `gpt-3.5-turbo`，其中 `gpt-4` 错误率很高但 `gpt-3.5-turbo` 表现良好。此前无法单独查看或调整。

---

## 功能一：模型渠道交叉统计

### 入口

管理员登录后，进入 **数据看板** → **渠道/模型分析面板** → 点击 **「模型渠道交叉分析」** 标签页。

### 功能说明

- 展示每个"模型 + 渠道"组合的统计指标
- 支持按模型名称筛选（AutoComplete 输入框）
- 统计指标包含：

| 指标 | 说明 |
|------|------|
| 请求次数 | 该模型在该渠道上的成功请求数 |
| 错误次数 | 该模型在该渠道上的错误请求数 |
| 错误率 | 错误请求 / (成功 + 错误) |
| 平均延迟 | 请求的平均响应时间 |
| P50 / P90 / P95 | 延迟分位数 |
| 最大延迟 | 最大响应时间 |
| Stream 占比 | 流式请求占比 |
| 每请求 Tokens | 平均每次请求消耗的 Token 数 |
| 消耗额度 | 该组合的总消耗额度 |
| 总 Tokens | 该组合消耗的总 Token 数 |

### API

```
GET /api/data/dashboard/model_channel?start_timestamp={ts}&end_timestamp={ts}&model_name={optional}
```

- 权限：管理员
- 参数：
  - `start_timestamp` / `end_timestamp`：Unix 时间戳（秒）
  - `model_name`（可选）：按模型名称过滤
- 返回：`ModelChannelCrossStats[]`

---

## 功能二：模型渠道配置（Ability 管理）

### 入口

管理员登录后，在侧边栏点击 **「模型渠道配置」** 进入独立管理页面。

### 功能说明

Ability 表记录了每个"分组 × 模型 × 渠道"的路由配置，包含优先级和权重。此前这些值从渠道配置中统一继承，现在支持**独立调整**。

#### 筛选

- 模型名（AutoComplete）
- 分组
- 渠道 ID
- 关键词（模型名或渠道名模糊匹配）

#### 表格字段

| 字段 | 说明 | 可编辑 |
|------|------|--------|
| 模型 | 模型名称 | 否 |
| 分组 | 所属分组 | 否 |
| 渠道 | 渠道名称（ID） | 否 |
| 状态 | 启用/禁用 | 否 |
| 优先级 | 路由优先级（数值越高越优先） | **是（行内编辑）** |
| 权重 | 同优先级内的流量权重（权重越高，被选中概率越大） | **是（行内编辑）** |
| 标签 | 渠道标签 | 否 |

#### 路由逻辑

当一个请求到达时，系统按以下逻辑选择渠道：

```
1. 根据 (分组, 模型) 查找所有可用的 Ability 记录
2. 按优先级从高到低分层
3. 第一次尝试使用最高优先级的渠道组
4. 在同优先级内，按权重随机选择一个渠道
5. 如果失败，降级到下一个优先级层级
6. 直到所有优先级用尽
```

**示例配置**：

| 模型 | 渠道 | 优先级 | 权重 | 效果 |
|------|------|--------|------|------|
| gpt-4 | 渠道A | 10 | 70 | 首选，70% 流量 |
| gpt-4 | 渠道B | 10 | 30 | 首选，30% 流量 |
| gpt-4 | 渠道C | 5 | 100 | A/B 都失败后备用 |
| gpt-3.5 | 渠道A | 10 | 50 | 首选，50% 流量 |
| gpt-3.5 | 渠道B | 10 | 50 | 首选，50% 流量 |

### API

**列表查询**

```
GET /api/channel/ability/list?model={}&group={}&channel_id={}&keyword={}&page={}&page_size={}
```

- 权限：管理员
- 返回：`{ items: AbilityListItem[], total: number }`

**更新优先级/权重**

```
PUT /api/channel/ability
Content-Type: application/json

{
  "group": "default",
  "model": "gpt-4",
  "channel_id": 1,
  "priority": 10,
  "weight": 70
}
```

- 权限：管理员
- `priority` 和 `weight` 至少提供一个
- 更新后自动刷新内存缓存

---

## 缓存机制说明

系统使用内存缓存加速渠道选择。Ability 的优先级和权重现在**直接存储在缓存中**（`CachedAbility` 结构），而非从 Channel 对象读取。这意味着：

- 在 Ability 管理页面修改优先级/权重后，缓存会**立即刷新**
- 不同模型可以有不同的优先级/权重，即使它们来自同一个渠道
- 通过渠道管理修改渠道的默认优先级/权重时，**仅影响新创建的 Ability 记录**，不会覆盖已独立调整过的记录

---

## 涉及的文件

### 后端

| 文件 | 变更 |
|------|------|
| `model/channel_cache.go` | 缓存重构：使用 `CachedAbility` 存储 per-ability 优先级/权重 |
| `model/channel_satisfy.go` | 适配新缓存结构 |
| `model/ability.go` | 新增 `GetAbilityList`、`UpdateAbilityPriorityWeight` |
| `model/log.go` | 新增 `GetModelChannelCrossStats` 交叉统计查询 |
| `controller/ability.go`（新） | Ability 管理的 API 处理函数 |
| `controller/usedata.go` | 新增交叉统计 API 处理函数 |
| `router/api-router.go` | 新增 3 个路由 |

### 前端

| 文件 | 变更 |
|------|------|
| `web/src/pages/Ability/index.jsx`（新） | Ability 管理独立页面 |
| `web/src/components/dashboard/ChannelAnalysisPanel.jsx` | 新增「模型渠道交叉分析」标签页 |
| `web/src/hooks/dashboard/useChannelAnalysis.js` | 新增交叉统计数据加载 |
| `web/src/components/dashboard/index.jsx` | 传递交叉统计 props |
| `web/src/App.jsx` | 新增 Ability 页面路由 |
| `web/src/components/layout/SiderBar.jsx` | 新增侧边栏菜单项 |
| `web/src/helpers/render.jsx` | 新增图标 |
| `web/src/hooks/common/useSidebar.js` | 新增侧边栏配置 |
| `web/src/i18n/locales/en.json` | 新增英文翻译 |
