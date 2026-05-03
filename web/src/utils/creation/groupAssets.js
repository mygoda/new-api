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
