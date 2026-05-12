// utils/creation/progressNarrative.js
//
// 给生成中状态加叙事感：根据已运行时间推断阶段 + 给出"剩余预估"
//
// 关键设计：
// 1. 三个阶段：构思 → 渲染 → 润色，文案带 emoji 减少冰冷感
// 2. 剩余时间基于"模型经验值"（每个模态默认时长）+ 用户已等待时间
// 3. 进度条始终保持"会动"的感觉（即使后端没返回 progress）

const STAGES = [
  { key: 'thinking', icon: '🌊', text: '正在构思画面' },
  { key: 'rendering', icon: '✨', text: '渲染镜头中' },
  { key: 'polishing', icon: '💎', text: '最后润色' },
  { key: 'finalizing', icon: '🎬', text: '即将完成' },
];

// 模型类型 -> 期望时长范围（秒）
const EXPECTED_DURATION = {
  image: { min: 10, max: 30 },
  video: { min: 60, max: 120 },
  default: { min: 15, max: 45 },
};

/**
 * 根据已运行时间推断阶段、合成进度、剩余时间
 * @param {object} asset
 *   - createdAt   提交时间戳（ms）
 *   - modality    image / video
 *   - progress    后端真实进度 (可选)
 * @returns {object} { stage, progress, etaSec, narrative }
 */
export function getProgressNarrative(asset) {
  const now = Date.now();
  const elapsed = Math.max(0, (now - (asset.createdAt || now)) / 1000);
  const expected = EXPECTED_DURATION[asset.modality] || EXPECTED_DURATION.default;
  const avgExpected = (expected.min + expected.max) / 2;

  // 1. 进度优先用后端真实值；没有则按时间合成
  let progress = asset.progress;
  if (progress == null || progress <= 0) {
    // 时间合成：缓启动 + 渐近 95%
    const ratio = Math.min(1, elapsed / avgExpected);
    progress = Math.round(95 * (1 - Math.pow(1 - ratio, 2)));
  }
  progress = Math.min(99, Math.max(0, progress));

  // 2. 阶段：按进度分桶
  let stage;
  if (progress < 25) stage = STAGES[0];
  else if (progress < 70) stage = STAGES[1];
  else if (progress < 90) stage = STAGES[2];
  else stage = STAGES[3];

  // 3. 剩余预估：初始阶段显示范围，后续显示具体时间
  let etaText;
  if (progress < 25) {
    etaText = `预计 ${expected.min}-${expected.max}s`;
  } else {
    const remaining = Math.max(0, avgExpected - elapsed);
    if (remaining > 60) {
      etaText = `约 ${Math.ceil(remaining / 60)} 分钟`;
    } else if (remaining > 10) {
      etaText = `约 ${Math.ceil(remaining / 10) * 10} 秒`;
    } else {
      etaText = '即将完成';
    }
  }

  return {
    stage: stage.key,
    icon: stage.icon,
    text: stage.text,
    progress,
    etaText,
  };
}
