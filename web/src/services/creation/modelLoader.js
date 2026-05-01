// services/creation/modelLoader.js
//
// 从 /api/pricing 加载模型并按模态过滤
// 图像生成: supported_endpoint_types 包含 image-generation
// 视频生成: supported_endpoint_types 包含 openai-video

import { API } from '../../helpers/api';

const ENDPOINT_TYPE_MAP = {
  image: ['image-generation'],
  video: ['openai-video'],
};

// MJ 等特殊模型的识别规则（不依赖 endpoint_types）
const SPECIAL_MODEL_PATTERNS = {
  image: [/midjourney/i, /^mj-/i],
  video: [/^kling/i, /^sora/i, /seedance/i, /jimeng-video/i, /hailuo/i, /vidu/i],
};

let pricingCache = null;
let lastFetchTime = 0;
const CACHE_TTL = 60 * 1000; // 60s

async function fetchPricing() {
  const now = Date.now();
  if (pricingCache && now - lastFetchTime < CACHE_TTL) {
    return pricingCache;
  }
  try {
    const res = await API.get('/api/pricing');
    if (res?.data?.success) {
      pricingCache = res.data.data || [];
      lastFetchTime = now;
      return pricingCache;
    }
  } catch (e) {
    console.error('[creation] fetch pricing failed', e);
  }
  return pricingCache || [];
}

// 厂商识别（基于 owner_by 或模型名称前缀）
function detectVendor(model) {
  const owner = (model.owner_by || '').toLowerCase();
  const name = (model.model_name || '').toLowerCase();

  if (owner.includes('openai') || name.includes('gpt') || name.includes('dall-e')) return 'openai';
  if (owner.includes('anthropic') || name.includes('claude')) return 'anthropic';
  if (owner.includes('google') || name.includes('gemini') || name.includes('imagen')) return 'google';
  if (owner.includes('midjourney') || name.includes('midjourney') || name.match(/^mj-/)) return 'midjourney';
  if (owner.includes('stability') || name.includes('stable-')) return 'stability';
  if (owner.includes('doubao') || name.includes('doubao') || name.includes('seedance') || name.includes('seedream')) return 'doubao';
  if (owner.includes('jimeng') || name.includes('jimeng')) return 'jimeng';
  if (owner.includes('kling') || name.includes('kling')) return 'kling';
  if (owner.includes('hailuo') || name.includes('hailuo') || name.includes('minimax')) return 'hailuo';
  if (owner.includes('vidu') || name.includes('vidu')) return 'vidu';
  return owner || 'other';
}

/**
 * 加载指定模态的可用模型列表
 * @param {'image' | 'video'} modality
 * @returns {Promise<Array>} 模型列表，已转换成 { modelName, displayName, vendor, modality, ... }
 */
export async function loadModelsForModality(modality) {
  const pricing = await fetchPricing();
  if (!Array.isArray(pricing)) return [];

  const targetEndpoints = ENDPOINT_TYPE_MAP[modality] || [];
  const specialPatterns = SPECIAL_MODEL_PATTERNS[modality] || [];

  const filtered = pricing.filter((m) => {
    // 1. 按 endpoint_types 过滤
    const types = m.supported_endpoint_types || [];
    if (types.some((t) => targetEndpoints.includes(t))) return true;
    // 2. 按特殊模型名匹配
    return specialPatterns.some((re) => re.test(m.model_name || ''));
  });

  return filtered.map((m) => ({
    modelName: m.model_name,
    displayName: m.model_name,
    vendor: detectVendor(m),
    modality,
    icon: m.icon || '',
    description: m.description || '',
    quotaType: m.quota_type, // 0=按 token / 1=按次
    modelPrice: m.model_price,
    modelRatio: m.model_ratio,
    enableGroups: m.enable_groups || [],
    tags: m.tags || '',
    raw: m, // 保留原始数据
  }));
}

export function clearPricingCache() {
  pricingCache = null;
  lastFetchTime = 0;
}
