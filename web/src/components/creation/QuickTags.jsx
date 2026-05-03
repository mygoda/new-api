/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useMemo } from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { getQuickTags } from '../../constants/creation/presets';

const { Text } = Typography;

/**
 * 提示词快速标签
 *
 * 解决：
 * - 新手不知道用哪些"画笔语言"（电影感、景深、光线...）
 * - 老手希望快速插入风格 token，免输入
 *
 * 行为：
 * - 点击标签 → 追加到 prompt 末尾（用 ", " 分隔）
 * - 已包含的标签会高亮，再次点击移除
 */
const QuickTags = ({ modality, value, onChange }) => {
  const { t } = useTranslation();
  const groups = getQuickTags(modality);

  // 检测当前 prompt 中已包含哪些标签
  const includedSet = useMemo(() => {
    const lower = (value || '').toLowerCase();
    const set = new Set();
    for (const g of groups) {
      for (const tag of g.items) {
        if (lower.includes(tag.toLowerCase())) set.add(tag);
      }
    }
    return set;
  }, [value, groups]);

  const toggleTag = (tag) => {
    const cur = value || '';
    if (includedSet.has(tag)) {
      // 移除：先尝试 ", tag" / "，tag" / "tag"
      const patterns = [
        new RegExp(`[,，]\\s*${escape(tag)}`, 'g'),
        new RegExp(`${escape(tag)}\\s*[,，]\\s*`, 'g'),
        new RegExp(escape(tag), 'g'),
      ];
      let next = cur;
      for (const p of patterns) {
        if (p.test(next)) {
          next = next.replace(p, '');
          break;
        }
      }
      onChange(next.trim().replace(/^[,，]\s*/, '').replace(/\s+/g, ' '));
    } else {
      // 追加
      const sep = cur.trim() ? '，' : '';
      onChange(cur + sep + tag);
    }
  };

  return (
    <div className='space-y-1.5'>
      {groups.map((g) => (
        <div key={g.group} className='flex items-start gap-2'>
          <Text className='!text-[11px] !text-gray-400 mt-1.5 flex-shrink-0 w-14'>
            {t(g.group)}
          </Text>
          <div className='flex flex-wrap gap-1 flex-1'>
            {g.items.map((tag) => {
              const active = includedSet.has(tag);
              return (
                <button
                  key={tag}
                  type='button'
                  onClick={() => toggleTag(tag)}
                  className={[
                    'px-2 py-0.5 text-[11px] rounded transition-colors',
                    active
                      ? 'bg-blue-500 text-white border border-blue-500 hover:bg-blue-600'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 hover:border-gray-300',
                  ].join(' ')}
                >
                  {t(tag)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default QuickTags;
