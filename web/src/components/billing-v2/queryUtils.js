/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

/**
 * 把 plain object 序列化成 query string,数组字段展开为重复参数。
 *   { period: 'month', model_name: ['a','b'] }
 *   → "period=month&model_name=a&model_name=b"
 *
 * 后端用 c.QueryArray("model_name") 解析。
 *
 * 跳过 null / undefined / 空字符串,避免传无意义参数。
 */
export function buildQueryString(params) {
  const sp = new URLSearchParams();
  if (!params) return '';
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const x of v) {
        if (x == null || x === '') continue;
        sp.append(k, String(x));
      }
    } else if (v !== '') {
      sp.set(k, String(v));
    }
  }
  return sp.toString();
}
