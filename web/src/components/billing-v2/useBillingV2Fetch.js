/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { useEffect, useState } from 'react';
import { API, showError } from '../../helpers';

/**
 * 共享 fetch hook,负责调 /api/billing/v2/{path} 接口。
 * 负责 loading / error / abort。
 */
export function useBillingV2Fetch(path, queryParams) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams(queryParams).toString();
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
  }, [path, queryParams]);

  return { data, loading };
}
