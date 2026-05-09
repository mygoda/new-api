/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

// 模型 → 厂商品牌的分组映射(用户视角看到的厂商,与后端 channel.vendor 不同)。
// 用于「按厂商」Tab 的前端聚合,以及明细流水里展示的「厂商」列。
//
// 规则按顺序匹配,第一个命中的为准。新增厂商时,把更具体的规则放在更前面。
// 命中 Other 表示没有归类到已知品牌(自定义模型 / 不常见的)。

export const VENDOR_GROUPS = [
  {
    key: 'OpenAI',
    label: 'OpenAI',
    color: '#10a37f',
    test: (m) => /^(gpt-|o1-|o3-|o4-|chatgpt-|dall-e-|whisper-|tts-|text-embedding-|davinci-|babbage-|ada-)/i.test(m),
  },
  {
    key: 'Anthropic',
    label: 'Anthropic',
    color: '#d97757',
    test: (m) => /^claude-/i.test(m),
  },
  {
    key: 'Google',
    label: 'Google',
    color: '#4285f4',
    test: (m) => /^(gemini-|palm-|bison-|embeddings-gecko|imagen-|veo-)/i.test(m),
  },
  {
    key: 'ByteDance',
    label: '字节跳动',
    color: '#ff5e1f',
    test: (m) => /^(doubao-|seedance|seedream|skylark)/i.test(m),
  },
  {
    key: 'Alibaba',
    label: '阿里巴巴',
    color: '#ff6a00',
    test: (m) => /^(qwen-|qwen2|wanx-|dashscope-|embedding-v\d|tongyi)/i.test(m),
  },
  {
    key: 'DeepSeek',
    label: 'DeepSeek',
    color: '#5b8def',
    test: (m) => /^deepseek-/i.test(m),
  },
  {
    key: 'Moonshot',
    label: '月之暗面',
    color: '#0a4dba',
    test: (m) => /^(moonshot-|kimi)/i.test(m),
  },
  {
    key: 'ZhipuAI',
    label: '智谱',
    color: '#5045e8',
    test: (m) => /^(glm-|chatglm-|cogview-|cogvideox-)/i.test(m),
  },
  {
    key: 'Baichuan',
    label: '百川',
    color: '#7c3aed',
    test: (m) => /^baichuan/i.test(m),
  },
  {
    key: 'MiniMax',
    label: 'MiniMax',
    color: '#dc2626',
    test: (m) => /^(abab|minimax|MiniMax)/i.test(m),
  },
  {
    key: 'Other',
    label: '其他',
    color: '#94a3b8',
    test: () => true, // 兜底
  },
];

// vendorOf(modelName) → 厂商分组对象({key,label,color})
export function vendorOf(modelName) {
  const name = (modelName || '').trim();
  for (const g of VENDOR_GROUPS) {
    if (g.test(name)) return g;
  }
  return VENDOR_GROUPS[VENDOR_GROUPS.length - 1]; // Other 兜底
}

export function vendorLabelOf(modelName) {
  return vendorOf(modelName).label;
}
