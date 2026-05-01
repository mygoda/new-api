// services/creation/tokens.js
//
// Token 列表 / 创建 / 取完整 key 的封装。
//
// 后端约定：
//   - GET  /api/token/?p={page}&size={n}     列表（key 已 mask）
//   - POST /api/token/                        创建（不返回 key）
//   - POST /api/token/{id}/key                取完整 key
//
// 选中的 token id 持久化到 localStorage:creation:active_token

import { API } from '../../helpers/api';

const ACTIVE_KEY = 'creation:active_token';

export function loadActiveToken() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveActiveToken(token) {
  if (!token) {
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    return;
  }
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(token));
  } catch {}
}

export async function listTokens(page = 1, size = 50) {
  const res = await API.get(`/api/token/?p=${page}&size=${size}`);
  if (!res?.data?.success) throw new Error(res?.data?.message || '加载 Token 失败');
  // 兼容 PageInfo / 直接数组两种返回
  const data = res.data.data;
  const items = Array.isArray(data) ? data : (data?.items || []);
  return items;
}

export async function createToken(payload) {
  const body = {
    name: payload.name || 'creation-default',
    expired_time: payload.expired_time ?? -1,
    remain_quota: payload.remain_quota ?? 1_000_000_000, // 1B 默认配额
    unlimited_quota: payload.unlimited_quota ?? true,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    group: payload.group || '',
    cross_group_retry: false,
  };
  const res = await API.post('/api/token/', body);
  if (!res?.data?.success) throw new Error(res?.data?.message || '创建 Token 失败');
  return res.data.data; // 后端返回 token id 等
}

export async function fetchTokenKey(id) {
  const res = await API.post(`/api/token/${id}/key`);
  if (!res?.data?.success) throw new Error(res?.data?.message || '获取 Token Key 失败');
  return res.data.data?.key || res.data.data; // 兼容两种返回
}

// 一站式：创建 + 拿 key + 持久化为 active token
export async function quickCreateAndActivate(name = 'creation-default') {
  // 先尝试列表里找同名的
  try {
    const tokens = await listTokens();
    const existing = tokens.find((t) => t.name === name);
    if (existing) {
      const key = await fetchTokenKey(existing.id);
      const tok = { id: existing.id, name: existing.name, key };
      saveActiveToken(tok);
      return tok;
    }
  } catch {
    // 列表失败也继续创建
  }
  const created = await createToken({ name });
  // 创建接口可能不直接返回 id，重新拉一次列表找最新一条
  let id = created?.id;
  if (!id) {
    const tokens = await listTokens();
    const latest = tokens.find((t) => t.name === name);
    if (!latest) throw new Error('刚创建的 Token 找不到');
    id = latest.id;
  }
  const key = await fetchTokenKey(id);
  const tok = { id, name, key };
  saveActiveToken(tok);
  return tok;
}
