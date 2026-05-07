// hooks/creation/useDynamicModels.js
//
// 加载指定模态可用的模型列表（仅来自「模型管理」/api/creation/models）
//
// 行为：
//   - 完全依赖后端模型管理表
//   - 不再有硬编码 fallback：模型管理里没启用的就不显示
//   - 通过 inferModelSchema 为每个模型推导参数 schema

import { useEffect, useState, useMemo } from 'react';
import { loadModelsForModality, clearModelsCache } from '../../services/creation/modelLoader';
import { inferModelSchema } from '../../constants/creation/models';

export function useDynamicModels(modality) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // 用户切到创作中心 tab 时主动清缓存,确保拿到最新的 creation_target 等设置。
    // 否则 admin 改完后,即便强刷页面,还会命中 in-memory 缓存最长 15 秒。
    clearModelsCache();

    loadModelsForModality(modality)
      .then((list) => {
        if (cancelled) return;
        setModels(list || []);
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

  // 根据模型名拿到对应的 schema
  const getSchemaFor = useMemo(
    () => (modelName) => {
      const modelInfo = models.find((m) => m.modelName === modelName);
      if (!modelInfo) return null;
      return inferModelSchema(modelInfo);
    },
    [models],
  );

  return { models, loading, error, getSchemaFor };
}
