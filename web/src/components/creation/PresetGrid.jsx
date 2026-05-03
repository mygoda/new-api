/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPresets } from '../../constants/creation/presets';

const { Text, Title } = Typography;

/**
 * 空状态推荐 preset
 *
 * 解决用户首次进入「不知道写什么」的焦虑：
 * - 4-6 张优质示范作品
 * - 点击直接填入 prompt + 推荐模型 + 参数
 * - 5 秒内体验首个生成
 */
const PresetGrid = ({ modality, availableModels, onApply }) => {
  const { t } = useTranslation();
  const presets = getPresets(modality);

  // 从 preset 的偏好模型中挑选当前可用的（按顺序找第一个匹配）
  const pickModel = (preset) => {
    const modelNames = (availableModels || []).map((m) => m.modelName);
    for (const pref of preset.preferModels || []) {
      if (modelNames.includes(pref)) return pref;
    }
    return modelNames[0] || null;
  };

  return (
    <div className='max-w-5xl mx-auto px-4'>
      <div className='text-center mb-6'>
        <div className='inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 mb-3'>
          <Sparkles size={13} className='text-blue-500' />
          <Text className='!text-xs !text-blue-700 font-medium'>
            {t('试试这些热门玩法')}
          </Text>
        </div>
        <Title heading={5} className='!mb-1 !text-gray-800'>
          {t('一键开始创作')}
        </Title>
        <Text type='tertiary' className='!text-xs'>
          {t('点击下方任意卡片，自动填入提示词与推荐参数')}
        </Text>
      </div>

      <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
        {presets.map((preset) => {
          const targetModel = pickModel(preset);
          const disabled = !targetModel;
          return (
            <button
              key={preset.id}
              type='button'
              disabled={disabled}
              onClick={() =>
                onApply?.({
                  prompt: preset.prompt,
                  model: targetModel,
                  params: preset.suggestParams || {},
                })
              }
              className={[
                'group text-left rounded-lg border bg-white overflow-hidden transition-all',
                disabled
                  ? 'border-gray-200 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5',
              ].join(' ')}
            >
              {/* 封面 */}
              <div
                className='aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 bg-cover bg-center relative'
                style={{ backgroundImage: `url(${preset.cover})` }}
              >
                <div className='absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent' />
                <div className='absolute bottom-2 left-2.5 right-2.5'>
                  <Text strong className='!text-white !text-sm drop-shadow'>
                    {preset.title}
                  </Text>
                </div>
              </div>

              {/* 信息条 */}
              <div className='px-3 py-2 flex items-center justify-between'>
                <Text type='tertiary' className='!text-[11px] truncate'>
                  {disabled
                    ? t('暂无可用模型')
                    : targetModel}
                </Text>
                {!disabled && (
                  <ArrowRight
                    size={13}
                    className='text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0'
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PresetGrid;
