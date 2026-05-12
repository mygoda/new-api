/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useMemo, useState } from 'react';
import { Typography, Input, Spin, Popover } from '@douyinfe/semi-ui';
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
      {/* 搜索框 */}
      {models.length > 6 && (
        <Input
          prefix={<Search size={13} className='text-gray-400 ml-2' />}
          placeholder={t('搜索模型')}
          value={keyword}
          onChange={setKeyword}
          showClear
          size='small'
          className='!rounded-md'
        />
      )}

      {/* 模型列表 */}
      <div className='space-y-0.5 max-h-[320px] overflow-y-auto -mx-1 px-1'>
        {list.length === 0 ? (
          <div className='py-4 text-center'>
            <Text type='tertiary' size='small'>
              {t('未找到匹配的模型')}
            </Text>
          </div>
        ) : (
          list.map((m) => {
            const active = m.modelName === value;
            const hasPreview = m.styleTags?.length > 0 || m.previewImage || m.description;

            const button = (
              <button
                key={m.modelName}
                type='button'
                onClick={() => onChange?.(m.modelName)}
                className={[
                  'group relative w-full text-left rounded-md px-2 py-1.5 transition-colors',
                  active
                    ? 'bg-gray-900 text-white'
                    : 'hover:bg-gray-100',
                ].join(' ')}
              >
                <div className='flex items-center gap-2'>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-1.5'>
                      <Text
                        className={[
                          '!text-[12.5px] truncate',
                          active ? '!text-white !font-medium' : '!text-gray-800',
                        ].join(' ')}
                      >
                        {m.displayName || m.modelName}
                      </Text>
                    </div>
                    {m.vendor && m.vendor !== 'other' && (
                      <Text
                        className={[
                          '!text-[10px] truncate block',
                          active ? '!text-white/70' : '!text-gray-500',
                        ].join(' ')}
                      >
                        {m.vendor}
                      </Text>
                    )}
                  </div>
                  {active && (
                    <Check size={13} className='text-white flex-shrink-0' strokeWidth={3} />
                  )}
                </div>
              </button>
            );

            if (!hasPreview) return button;

            return (
              <Popover
                key={m.modelName}
                content={
                  <div className='w-64 p-2'>
                    {m.previewImage && (
                      <img src={m.previewImage} className='w-full rounded mb-2' alt={m.modelName} />
                    )}
                    {m.styleTags && m.styleTags.length > 0 && (
                      <div className='flex flex-wrap gap-1 mb-2'>
                        {m.styleTags.map((tag) => (
                          <span key={tag} className='px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded'>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.description && (
                      <Text type='tertiary' className='!text-[11px]'>
                        {m.description}
                      </Text>
                    )}
                  </div>
                }
                position='right'
                trigger='hover'
                showArrow
              >
                {button}
              </Popover>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ModelPicker;
