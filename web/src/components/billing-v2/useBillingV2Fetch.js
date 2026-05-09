/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { useEffect, useState } from 'react';
import { API, showError } from '../../helpers';
import { buildQueryString } from './queryUtils';

/**
 * 共享 fetch hook,负责调 /api/billing/v2/{path} 接口。
 *
 * 依赖处理:queryParams 是对象,调用方常用 `{ ...filter, dim: 'model' }`
 * 写法导致每次 render 都是新引用,直接放进 useEffect 依赖会死循环。
 * 这里用 JSON 序列化做稳定的 string key,调用方不必关心。
 *
 * 数组字段(model_name / token_name 多选)由 buildQueryString 自动展开成
 * 重复参数 ?model_name=a&model_name=b。
 */
export function useBillingV2Fetch(path, queryParams) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // 把 object 序列化成 string 作为稳定依赖。
  const paramsKey = JSON.stringify(queryParams || {});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const qs = buildQueryString(JSON.parse(paramsKey));
        const res = await API.get(`/api/billing/v2/${path}?${qs}`);
        if (!alive) return;
        if (res.data?.success) {
          setData(res.data.data);
        } else {
          showError(res.data?.message || '加载失败');
        }
      } catch (e) {
        if (alive) showError(e?.message || '加载失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [path, paramsKey]);

  return { data, loading };
}
