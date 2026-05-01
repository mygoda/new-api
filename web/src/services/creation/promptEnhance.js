// services/creation/promptEnhance.js
//
// 用账户内的 Chat 模型把用户的提示词重写得更具镜头语言、更详细。
// 默认模型：localStorage:creation:enhancer_model || 'gpt-4o-mini'
//
// 不抛错：如果所有候选模型都不可用，返回 null 让调用方静默隐藏按钮。

import { API } from '../../helpers/api';

const STORAGE_KEY = 'creation:enhancer_model';
const FALLBACK_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo', 'claude-3-5-haiku', 'glm-4-flash'];

export function getEnhancerModel() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'gpt-4o-mini';
  } catch {
    return 'gpt-4o-mini';
  }
}

export function setEnhancerModel(name) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {}
}

const SYSTEM_TPL = (modality, modelName) => `You are a Prompt Engineer for ${modality} generation.
Rewrite the user's prompt so it:
- adds visual specifics (lighting, lens, composition, color palette)
- aligns with ${modelName}'s known strengths and limitations
- preserves the user's original intent and language (do NOT translate)
- stays under 500 characters
Return only the rewritten prompt, no explanation, no surrounding quotes.`;

async function tryEnhance(model, modality, targetModel, prompt) {
  const res = await API.post('/pg/chat/completions', {
    model,
    stream: false,
    messages: [
      { role: 'system', content: SYSTEM_TPL(modality, targetModel) },
      { role: 'user', content: prompt },
    ],
  });
  // 兼容 OpenAI 标准响应
  const data = res?.data;
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : null;
}

// 主入口；按优先级尝试多个模型
export async function enhancePrompt(modality, targetModel, prompt) {
  const candidates = [getEnhancerModel(), ...FALLBACK_MODELS];
  const seen = new Set();
  let lastErr = null;
  for (const m of candidates) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    try {
      const out = await tryEnhance(m, modality, targetModel, prompt);
      if (out) {
        return { success: true, prompt: out, modelUsed: m };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  return { success: false, error: lastErr?.message || '没有可用的 Chat 模型' };
}
