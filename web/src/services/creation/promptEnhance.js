// services/creation/promptEnhance.js
//
// 用账户内的 Chat 模型把用户的提示词重写得更具镜头语言、更详细。
//
// 模型来源：必须由用户在前端"AI 优化"齿轮中显式配置；
// 不再使用硬编码 fallback——避免猜错模型名导致默认走 404。
//
// 持久化：localStorage:creation:enhancer_model

import { API } from '../../helpers/api';

const STORAGE_KEY = 'creation:enhancer_model';

export function getEnhancerModel() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setEnhancerModel(name) {
  try {
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

const SYSTEM_TPL = (modality, modelName) => `You are a Prompt Engineer for ${modality} generation.
Rewrite the user's prompt so it:
- adds visual specifics (lighting, lens, composition, color palette)
- aligns with ${modelName}'s known strengths and limitations
- preserves the user's original intent and language (do NOT translate)
- stays under 500 characters
Return only the rewritten prompt, no explanation, no surrounding quotes.`;

async function callChat(model, modality, targetModel, prompt) {
  const res = await API.post('/pg/chat/completions', {
    model,
    stream: false,
    messages: [
      { role: 'system', content: SYSTEM_TPL(modality, targetModel) },
      { role: 'user', content: prompt },
    ],
  });
  const data = res?.data;
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : null;
}

// 主入口
export async function enhancePrompt(modality, targetModel, prompt) {
  const model = getEnhancerModel();
  if (!model) {
    return {
      success: false,
      error: '尚未配置「AI 优化」模型，请点击 AI 优化按钮旁的齿轮选择一个 Chat 模型',
    };
  }
  try {
    const out = await callChat(model, modality, targetModel, prompt);
    if (out) return { success: true, prompt: out, modelUsed: model };
    return { success: false, error: '模型返回为空，换一个 Chat 模型试试' };
  } catch (e) {
    const msg =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      '请求失败';
    return { success: false, error: msg };
  }
}
