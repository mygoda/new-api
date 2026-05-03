// services/creation/modelLoader.js
//
// 从「模型管理」（GET /api/creation/models）加载模型并按模态过滤
//
// 后端 endpoints 字段（model_meta.endpoints，逗号分隔字符串）的可能值：
//   - chat / image / video / audio / embedding / rerank ...
//   - 或者更细粒度的 endpoint type：image-generation / openai-video 等
//
// 我们同时支持这两种命名约定，确保兼容
//
// 不再使用硬编码 fallback：模型管理里没启用的就不显示

import { API } from '../../helpers/api';

// 模态对应的 endpoint 关键字
const ENDPOINT_KEYWORDS = {
  image: ['image', 'image-generation', 'images', 'midjourney', 'mj'],
  video: ['video', 'openai-video', 'kling', 'sora', 'jimeng-video', 'hailuo', 'vidu'],
  chat: ['chat', 'chat-completions', 'completions', 'messages', 'responses'],
};

let modelsCache = null;
let lastFetchTime = 0;
const CACHE_TTL = 60 * 1000; // 60s

async function fetchModels() {
  const now = Date.now();
  if (modelsCache && now - lastFetchTime < CACHE_TTL) {
    return modelsCache;
  }
  try {
    const res = await API.get('/api/creation/models');
    if (res?.data?.success) {
      modelsCache = res.data.data || [];
      lastFetchTime = now;
      return modelsCache;
    }
  } catch (e) {
    console.error('[creation] fetch models failed', e);
  }
  return modelsCache || [];
}

// 厂商识别（基于 vendor_name 或模型名前缀）
function detectVendor(model) {
  const vendor = (model.vendor_name || '').toLowerCase();
  if (vendor) return vendor;

  const name = (model.model_name || '').toLowerCase();
  if (name.includes('gpt') || name.includes('dall-e') || name.includes('o1')) return 'openai';
  if (name.includes('claude')) return 'anthropic';
  if (name.includes('gemini') || name.includes('imagen')) return 'google';
  if (name.match(/midjourney|^mj-/)) return 'midjourney';
  if (name.includes('stable-')) return 'stability';
  if (name.includes('doubao') || name.includes('seedance') || name.includes('seedream')) return 'doubao';
  if (name.includes('jimeng')) return 'jimeng';
  if (name.includes('kling')) return 'kling';
  if (name.includes('hailuo') || name.includes('minimax')) return 'hailuo';
  if (name.includes('vidu')) return 'vidu';
  if (name.includes('sora')) return 'openai';
  return 'other';
}

// 判断模型是否支持目标模态
function matchModality(model, modality) {
  const keywords = ENDPOINT_KEYWORDS[modality] || [];
  const endpoints = (model.endpoints || []).map((e) => e.toLowerCase());
  const tags = (model.tags || '').toLowerCase();
  const name = (model.model_name || '').toLowerCase();

  // 1. endpoints 字段精确匹配
  if (endpoints.some((e) => keywords.includes(e))) return true;

  // 2. tags 字段包含模态关键字
  if (keywords.some((k) => tags.includes(k))) return true;

  // 3. 模型名包含模态特征（兜底，针对未配置 endpoints 的旧模型）
  if (modality === 'video') {
    if (/sora|kling|seedance|jimeng-video|hailuo|vidu|veo/.test(name)) return true;
  }
  if (modality === 'image') {
    if (/dall-e|midjourney|^mj-|imagen|stable-diffusion|gpt-image|seedream|jimeng-img/.test(name)) return true;
  }
  if (modality === 'chat') {
    // 仅靠模型名兜底：常见 chat 系列
    if (/gpt-[0-9]|^o[0-9]|claude|gemini-(pro|flash)|qwen|glm|deepseek|moonshot|yi-|llama/.test(name)) return true;
  }

  return false;
}

/**
 * 加载指定模态的可用模型列表
 * @param {'image' | 'video'} modality
 * @returns {Promise<Array>} 模型列表
 */
export async function loadModelsForModality(modality) {
  const all = await fetchModels();
  if (!Array.isArray(all)) return [];

  const filtered = all.filter((m) => matchModality(m, modality));

  return filtered.map((m) => ({
    modelName: m.model_name,
    displayName: m.model_name,
    vendor: detectVendor(m),
    modality,
    icon: m.icon || '',
    description: m.description || '',
    tags: m.tags || '',
    endpoints: m.endpoints || [],
    capabilities: m.capabilities || [],
    raw: m,
  }));
}

export function clearModelsCache() {
  modelsCache = null;
  lastFetchTime = 0;
}

// 加载可用 Chat 模型（供"AI 优化提示词"使用）。
// 用户需显式在前端选一个；没有候选时返回空数组。
export async function loadChatModels() {
  const all = await fetchModels();
  if (!Array.isArray(all)) return [];

  const filtered = all.filter((m) => matchModality(m, 'chat'));
  return filtered.map((m) => ({
    modelName: m.model_name,
    vendor: detectVendor(m),
    description: m.description || '',
    endpoints: m.endpoints || [],
  }));
}
