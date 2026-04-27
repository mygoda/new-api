/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { useState, useCallback, useMemo } from 'react';
import { API, showError } from '../../helpers';

const DAY_SECONDS = 86400;

// 默认起始 = 今天 00:00 - (days-1) 天；结束 = 现在
const initialRange = (days) => {
  const end = Math.floor(Date.now() / 1000);
  const todayStart = Math.floor(end / DAY_SECONDS) * DAY_SECONDS;
  const start = todayStart - (days - 1) * DAY_SECONDS;
  return { start, end };
};

/**
 * useTokenAnalysis
 * 拉取当前用户每个令牌按 (日期 × 模型) 的 token 消耗。
 *
 * @param {boolean} isAdminUser  是否管理员（影响默认/最大区间）
 */
export const useTokenAnalysis = (isAdminUser) => {
  const maxDays = isAdminUser ? 30 : 7;
  const defaultDays = 7;

  const [range, setRangeState] = useState(() => initialRange(defaultDays));
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const setRange = useCallback((next) => {
    if (!next) return;
    let { start, end } = next;
    if (!start || !end || end <= start) return;
    if (end - start > maxDays * DAY_SECONDS) {
      start = end - maxDays * DAY_SECONDS;
    }
    setRangeState({ start, end });
  }, [maxDays]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = range;
      const res = await API.get(
        `/api/data/dashboard/token_daily_model?start_timestamp=${start}&end_timestamp=${end}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setRawRows(data || []);
      } else {
        showError(message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [range]);

  // 按 token 分组：{ tokenId, tokenName, totalTokens, dayLabels[], rows[{date,model_name,total_tokens}] }
  const tokenGroups = useMemo(() => {
    if (!rawRows || rawRows.length === 0) return [];

    const map = new Map();
    for (const r of rawRows) {
      const key = r.token_id;
      if (!map.has(key)) {
        map.set(key, {
          tokenId: r.token_id,
          tokenName: r.token_name || `#${r.token_id}`,
          totalTokens: 0,
          rows: [],
        });
      }
      const g = map.get(key);
      g.totalTokens += Number(r.total_tokens) || 0;
      g.rows.push(r);
    }

    // 把每天补齐成连续的 day labels（即使某天某模型没有消耗也不画就行；空天也显示一根 0 高的柱以示日期连续）
    const start = Math.floor(range.start / DAY_SECONDS) * DAY_SECONDS;
    const end = Math.floor(range.end / DAY_SECONDS) * DAY_SECONDS;
    const dayLabels = [];
    for (let d = start; d <= end; d += DAY_SECONDS) {
      dayLabels.push(d);
    }

    return Array.from(map.values())
      .map((g) => ({
        ...g,
        dayLabels,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }, [rawRows, range]);

  return {
    range,
    setRange,
    maxDays,
    rawRows,
    tokenGroups,
    load,
    loading,
  };
};
