// hooks/creation/useDynamicModels.js
//
// 加载指定模态可用的模型列表（从 /api/pricing），合并硬编码的默认模型作为后备
//
// 行为：
//   - 优先展示后端 /api/pricing 返回的、支持目标 endpoint_type 的模型
//   - 同时把硬编码列表里的模型作为补充（避免后端尚未配置时空白）
//   - 自动选中：上次使用的模型 > 第一个可用模型

import { useEffect, useState, useMemo } from 'react';
import { loadModelsForModality } from '../../services/creation/modelLoader';
import { getModelsForModality, inferModelSchema } from '../../constants/creation/models';

export function useDynamicModels(modality) {
  const [remoteModels, setRemoteModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 硬编码的默认模型作为后备
  const fallbackModels = useMemo(() => getModelsForModality(modality), [modality]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadModelsForModality(modality)
      .then((list) => {
        if (cancelled) return;
        setRemoteModels(list || []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modality]);

  // 合并：远程优先 + 本地补充（去重）
  const models = useMemo(() => {
    const seen = new Set();
    const merged = [];

    // 远程模型优先
    for (const m of remoteModels) {
      if (!m.modelName || seen.has(m.modelName)) continue;
      seen.add(m.modelName);
      merged.push(m);
    }

    // 本地 fallback 补齐
    for (const m of fallbackModels) {
      if (!m.modelName || seen.has(m.modelName)) continue;
      seen.add(m.modelName);
      merged.push({
        modelName: m.modelName,
        displayName: m.displayName,
        vendor: m.vendor,
        modality,
        description: '',
      });
    }

    return merged;
  }, [remoteModels, fallbackModels, modality]);

  // 根据模型名拿到对应的 schema（含动态推导）
  const getSchemaFor = (modelName) => {
    const modelInfo = models.find((m) => m.modelName === modelName);
    if (!modelInfo) return null;
    return inferModelSchema(modelInfo);
  };

  return { models, loading, error, getSchemaFor };
}
