// services/creation/cloudGallery.js
//
// 云端作品库 API 封装 + localStorage 迁移逻辑
//
// 后端接口：
//   GET    /api/creation/assets?page=1&size=50&modality=image&status=success
//   POST   /api/creation/assets
//   PUT    /api/creation/assets/:id
//   DELETE /api/creation/assets/:id

import { API } from '../../helpers/api';

const MIGRATED_FLAG = 'creation:cloud_migrated';

export async function isCloudEnabled() {
  try {
    const res = await API.get('/api/option/');
    if (!res?.data?.success) return false;
    const opts = res.data.data || [];
    const item = opts.find((o) => o.key === 'creation_setting.cloud_gallery_enabled');
    return item?.value === 'true';
  } catch {
    return false;
  }
}

export async function listCloudAssets({ page = 1, size = 50, modality, status } = {}) {
  const params = new URLSearchParams({ page, size });
  if (modality) params.append('modality', modality);
  if (status) params.append('status', status);
  const res = await API.get(`/api/creation/assets?${params}`);
  if (!res?.data?.success) throw new Error(res?.data?.message || 'Failed to load');
  return res.data.data; // { items, total, page, size }
}

export async function createCloudAsset(asset) {
  const payload = {
    modality: asset.modality,
    model_name: asset.modelName,
    prompt: asset.prompt,
    asset_url: asset.assetUrl || '',
    status: asset.status || 'success',
    task_id: asset.taskId || '',
    params: JSON.stringify(asset.params || {}),
  };
  const res = await API.post('/api/creation/assets', payload);
  if (!res?.data?.success) throw new Error(res?.data?.message || 'Failed to create');
  return res.data.data;
}

export async function updateCloudAsset(id, updates) {
  const payload = {
    asset_url: updates.assetUrl,
    status: updates.status,
    task_id: updates.taskId,
  };
  const res = await API.put(`/api/creation/assets/${id}`, payload);
  if (!res?.data?.success) throw new Error(res?.data?.message || 'Failed to update');
}

export async function deleteCloudAsset(id) {
  const res = await API.delete(`/api/creation/assets/${id}`);
  if (!res?.data?.success) throw new Error(res?.data?.message || 'Failed to delete');
}

// findCloudAssetByTaskId 按 task_id 在云端查找对应作品(避免重复创建)。
// 返回 null 表示未找到。
export async function findCloudAssetByTaskId(taskId) {
  if (!taskId) return null;
  try {
    const data = await listCloudAssets({ size: 200 });
    const items = data?.items || [];
    return items.find((it) => it.task_id === taskId) || null;
  } catch {
    return null;
  }
}

// upsertCloudAssetByTaskId 按 task_id 插入或更新云端作品。
// 第一次提交任务时调用 (status=in_progress, taskId 已知,assetUrl 空);
// 后续轮询更新时再次调用 (status=success, assetUrl 已知),自动走 update。
//
// 返回 cloud asset 记录(含自增 id)。失败抛错。
export async function upsertCloudAssetByTaskId(asset) {
  if (!asset.taskId) {
    // 没有 taskId 的同步任务直接 create
    return createCloudAsset(asset);
  }
  const existing = await findCloudAssetByTaskId(asset.taskId);
  if (existing) {
    await updateCloudAsset(existing.id, asset);
    return { ...existing, ...asset, id: existing.id };
  }
  return createCloudAsset(asset);
}

// 一次性迁移：把 localStorage 里的作品批量上传到云端
export async function migrateLocalToCloud() {
  try {
    const flag = localStorage.getItem(MIGRATED_FLAG);
    if (flag === 'done') return { migrated: 0 };
  } catch {
    return { migrated: 0 };
  }

  let local = [];
  try {
    const raw = localStorage.getItem('creation:assets:v1');
    if (raw) local = JSON.parse(raw);
  } catch {
    local = [];
  }

  if (!local.length) {
    try {
      localStorage.setItem(MIGRATED_FLAG, 'done');
    } catch {}
    return { migrated: 0 };
  }

  // 只迁移 success 状态的
  const toMigrate = local.filter((a) => a.status === 'success' && a.assetUrl);
  let count = 0;
  for (const a of toMigrate) {
    try {
      await createCloudAsset(a);
      count++;
    } catch (e) {
      console.warn('[creation] migrate failed for', a.id, e?.message);
    }
  }

  try {
    localStorage.setItem(MIGRATED_FLAG, 'done');
  } catch {}
  return { migrated: count };
}
