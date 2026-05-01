/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useMemo, useState } from 'react';
import { Typography, Input, Spin } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Search, Check } from 'lucide-react';

const { Text } = Typography;

/**
 * 模型选择器
 *
 * 设计：
 * - 与 Playground 风格统一：中性灰色 + 清晰边框 + 极简
 * - 支持搜索（模型多时实用）
 * - 列表式展示（不用大卡片，节省空间）
 * - 选中态：左侧蓝色竖条 + 浅灰背景
 */
const ModelPicker = ({ models, value, onChange, loading = false }) => {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');

  const list = useMemo(() => {
    const arr = models || [];
    if (!keyword.trim()) return arr;
    const k = keyword.toLowerCase();
    return arr.filter(
      (m) =>
        (m.modelName || '').toLowerCase().includes(k) ||
        (m.displayName || '').toLowerCase().includes(k) ||
        (m.vendor || '').toLowerCase().includes(k),
    );
  }, [models, keyword]);

  if (loading) {
    return (
      <div className='py-8 flex justify-center'>
        <Spin size='middle' />
      </div>
    );
  }

  if (!models || models.length === 0) {
    return (
      <div className='py-6 px-3 text-center bg-gray-50 rounded-md border border-dashed border-gray-200'>
        <Text type='tertiary' size='small' className='block mb-1'>
          {t('暂无可用模型')}
        </Text>
        <Text type='tertiary' className='!text-[11px] !text-gray-400'>
          {t('请在「模型管理」中启用相关模型')}
        </Text>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      {/* 搜索框 - 仅当模型超过 6 个时显示 */}
      {models.length > 6 && (
        <Input
          prefix={<Search size={14} className='text-gray-400 ml-2' />}
          placeholder={t('搜索模型')}
          value={keyword}
          onChange={setKeyword}
          showClear
          size='small'
          className='!rounded-md'
        />
      )}

      {/* 模型列表 */}
      <div className='space-y-1 max-h-[420px] overflow-y-auto pr-1 -mr-1'>
        {list.length === 0 ? (
          <div className='py-4 text-center'>
            <Text type='tertiary' size='small'>
              {t('未找到匹配的模型')}
            </Text>
          </div>
        ) : (
          list.map((m) => {
            const active = m.modelName === value;
            return (
              <button
                key={m.modelName}
                type='button'
                onClick={() => onChange?.(m.modelName)}
                className={[
                  'group relative w-full text-left rounded-md px-2.5 py-2 transition-colors',
                  active
                    ? 'bg-blue-50 border border-blue-200'
                    : 'border border-transparent hover:bg-gray-50',
                ].join(' ')}
              >
                {/* 左侧选中指示条 */}
                {active && (
                  <span className='absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-r' />
                )}

                <div className='flex items-center gap-2 pl-1.5'>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2'>
                      <Text
                        className={`!text-sm truncate ${
                          active ? '!text-blue-700 font-medium' : '!text-gray-800'
                        }`}
                      >
                        {m.displayName || m.modelName}
                      </Text>
                      {m.vendor && m.vendor !== 'other' && (
                        <Text
                          type='tertiary'
                          className='!text-[10px] !text-gray-400 uppercase tracking-wide flex-shrink-0'
                        >
                          {m.vendor}
                        </Text>
                      )}
                    </div>
                    {m.description && (
                      <Text
                        type='tertiary'
                        className='!text-[11px] !text-gray-400 truncate block'
                      >
                        {m.description}
                      </Text>
                    )}
                  </div>
                  {active && (
                    <Check
                      size={14}
                      className='text-blue-500 flex-shrink-0'
                      strokeWidth={2.5}
                    />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ModelPicker;
