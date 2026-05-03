/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { ArrowRight } from 'lucide-react';
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
    <div className='max-w-5xl mx-auto px-6 py-12'>
      <div className='text-center mb-8'>
        <Title heading={4} className='!mb-2 !text-gray-900 !font-medium'>
          {t('开始你的创作')}
        </Title>
        <Text type='tertiary' className='!text-sm'>
          {t('点击下方任意场景，自动填入提示词与推荐参数')}
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
                'group text-left rounded-xl bg-white overflow-hidden transition-all duration-200',
                disabled
                  ? 'opacity-40 cursor-not-allowed border border-gray-200'
                  : 'border border-gray-200 hover:border-gray-900 hover:shadow-lg hover:-translate-y-1',
              ].join(' ')}
            >
              {/* 封面 */}
              <div
                className='aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 bg-cover bg-center relative overflow-hidden'
                style={{ backgroundImage: `url(${preset.cover})` }}
              >
                <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent' />
                <div className='absolute bottom-3 left-3 right-3'>
                  <Text strong className='!text-white !text-base drop-shadow-sm'>
                    {preset.title}
                  </Text>
                </div>
              </div>

              {/* 信息条 */}
              <div className='px-3 py-2.5 flex items-center justify-between border-t border-gray-100'>
                <Text
                  type='tertiary'
                  className='!text-[11px] !text-gray-500 truncate font-mono'
                >
                  {disabled ? t('暂无可用模型') : targetModel}
                </Text>
                {!disabled && (
                  <ArrowRight
                    size={13}
                    className='text-gray-300 group-hover:text-gray-900 group-hover:translate-x-0.5 transition-all flex-shrink-0'
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
