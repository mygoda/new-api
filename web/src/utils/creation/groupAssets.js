// utils/creation/groupAssets.js
//
// 按 groupId 聚合 assets：
// - 同一次提交（同 prompt + 同模型 + 同参数 + 时间窗内）归到一个 group
// - 单独存的 asset 自动构成单元素 group

export function groupAssets(assets) {
  const groups = new Map();
  const order = [];

  for (const a of assets || []) {
    const gid = a.groupId || a.id;
    if (!groups.has(gid)) {
      groups.set(gid, {
        id: gid,
        modality: a.modality,
        modelName: a.modelName,
        prompt: a.prompt,
        params: a.params,
        status: a.status,
        createdAt: a.createdAt,
        // 失败/进行中：使用第一个 asset 的状态
        errorMessage: a.errorMessage,
        progress: a.progress,
        taskId: a.taskId,
        batchId: a.batchId,
        items: [],
      });
      order.push(gid);
    }
    const g = groups.get(gid);
    g.items.push(a);
    // 取最新 createdAt
    if ((a.createdAt || 0) > (g.createdAt || 0)) g.createdAt = a.createdAt;
  }

  return order.map((id) => groups.get(id));
}

// 进一步：把 batchId 相同的若干 group 聚合成一个 batch 行
// 返回 [{ kind: 'batch' | 'group', ... }]
export function combineWithBatches(groups) {
  const out = [];
  const batchMap = new Map();
  for (const g of groups || []) {
    if (g.batchId) {
      if (!batchMap.has(g.batchId)) {
        const batch = {
          kind: 'batch',
          id: g.batchId,
          batchId: g.batchId,
          modality: g.modality,
          prompt: g.prompt,
          params: g.params,
          createdAt: g.createdAt,
          items: [],
          _idx: out.length,
        };
        batchMap.set(g.batchId, batch);
        out.push(batch);
      }
      const b = batchMap.get(g.batchId);
      // 一个 group 可能含多张图，但 batch 模式下我们强制 n=1，
      // 因此取该 group 第一个 asset 即可
      const first = (g.items || [])[0];
      if (first) b.items.push(first);
      if ((g.createdAt || 0) > (b.createdAt || 0)) b.createdAt = g.createdAt;
    } else {
      out.push({ kind: 'group', ...g });
    }
  }
  return out;
}
