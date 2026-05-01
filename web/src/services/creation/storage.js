// services/creation/storage.js
//
// 创作中心的本地缓存：
//   - 配置（当前模型/参数等）按 key 持久化到 localStorage
//   - 作品列表：creation:assets:v1 数组
//   - 活跃任务：creation:active_tasks:v1，刷新页面后恢复轮询

const PREFIX = 'creation:';

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 配额满或隐私模式 — 静默失败
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}

// === 配置 ===

export const loadConfig = (modality) =>
  safeGet(`${modality}:config`, null);

export const saveConfig = (modality, cfg) =>
  safeSet(`${modality}:config`, cfg);

// === 作品库 ===

const ASSETS_KEY = 'assets:v1';
const ASSETS_MAX = 1000;

export function loadAssets() {
  const list = safeGet(ASSETS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveAssets(list) {
  // 滚动裁剪
  const trimmed = list.slice(0, ASSETS_MAX);
  safeSet(ASSETS_KEY, trimmed);
}

export function appendAsset(asset) {
  const list = loadAssets();
  list.unshift(asset);
  saveAssets(list);
  return list;
}

export function removeAsset(id) {
  const list = loadAssets().filter((a) => a.id !== id);
  saveAssets(list);
  return list;
}

export function updateAsset(id, patch) {
  const list = loadAssets().map((a) => (a.id === id ? { ...a, ...patch } : a));
  saveAssets(list);
  return list;
}

// === 活跃任务（轮询恢复用） ===

const ACTIVE_TASKS_KEY = 'active_tasks:v1';

export function loadActiveTasks() {
  const list = safeGet(ACTIVE_TASKS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function trackActiveTask(task) {
  const existing = loadActiveTasks().filter((t) => t.taskId !== task.taskId);
  existing.push(task);
  safeSet(ACTIVE_TASKS_KEY, existing);
}

export function untrackActiveTask(taskId) {
  const filtered = loadActiveTasks().filter((t) => t.taskId !== taskId);
  if (filtered.length === 0) safeRemove(ACTIVE_TASKS_KEY);
  else safeSet(ACTIVE_TASKS_KEY, filtered);
}

// === ID 生成 ===

export function genId() {
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  );
}
