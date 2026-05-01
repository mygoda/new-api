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

import React, { useMemo } from 'react';
import { Typography, Tag } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Sparkles, Check } from 'lucide-react';

const { Text } = Typography;

// 厂商颜色映射
const VENDOR_COLORS = {
  openai: { bg: 'from-emerald-500 to-teal-600', light: 'bg-emerald-50 text-emerald-700' },
  anthropic: { bg: 'from-orange-500 to-amber-600', light: 'bg-orange-50 text-orange-700' },
  google: { bg: 'from-blue-500 to-indigo-600', light: 'bg-blue-50 text-blue-700' },
  midjourney: { bg: 'from-purple-500 to-pink-600', light: 'bg-purple-50 text-purple-700' },
  stability: { bg: 'from-cyan-500 to-blue-600', light: 'bg-cyan-50 text-cyan-700' },
  doubao: { bg: 'from-red-500 to-pink-600', light: 'bg-red-50 text-red-700' },
  jimeng: { bg: 'from-pink-500 to-rose-600', light: 'bg-pink-50 text-pink-700' },
  kling: { bg: 'from-indigo-500 to-purple-600', light: 'bg-indigo-50 text-indigo-700' },
  hailuo: { bg: 'from-violet-500 to-purple-600', light: 'bg-violet-50 text-violet-700' },
  vidu: { bg: 'from-teal-500 to-cyan-600', light: 'bg-teal-50 text-teal-700' },
  default: { bg: 'from-gray-500 to-gray-600', light: 'bg-gray-50 text-gray-700' },
};

const getVendorStyle = (vendor) => {
  const v = (vendor || '').toLowerCase();
  return VENDOR_COLORS[v] || VENDOR_COLORS.default;
};

// 模型卡片选择器：网格展示，单选高亮
const ModelPicker = ({ models, value, onChange }) => {
  const { t } = useTranslation();
  const list = useMemo(() => models || [], [models]);

  if (!list.length) {
    return (
      <div className='rounded-xl bg-gray-50 border border-dashed border-gray-200'>
        <div className='py-8 text-center'>
          <div className='w-12 h-12 rounded-full bg-gray-100 mx-auto mb-3 flex items-center justify-center'>
            <Sparkles size={20} className='text-gray-400' />
          </div>
          <Text type='tertiary' className='!text-sm'>{t('暂无可用模型')}</Text>
        </div>
      </div>
    );
  }

  return (
    <div className='grid grid-cols-1 gap-2.5'>
      {list.map((m) => {
        const active = m.modelName === value;
        const vStyle = getVendorStyle(m.vendor);
        return (
          <button
            key={m.modelName}
            type='button'
            onClick={() => onChange?.(m.modelName)}
            className={[
              'group relative text-left rounded-xl transition-all duration-200 px-3.5 py-3 overflow-hidden',
              active
                ? 'bg-gradient-to-br from-blue-50 via-white to-purple-50 ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/10'
                : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md hover:-translate-y-0.5',
            ].join(' ')}
          >
            {/* 选中状态指示器 */}
            {active && (
              <div className='absolute top-2 right-2 w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg'>
                <Check size={12} className='text-white' strokeWidth={3} />
              </div>
            )}

            <div className='flex items-start gap-3'>
              {/* 厂商图标 */}
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${vStyle.bg} flex items-center justify-center shadow-md`}
              >
                <Sparkles size={18} className='text-white' strokeWidth={2.5} />
              </div>

              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-1.5 mb-0.5'>
                  <Text
                    strong
                    className={`!text-sm truncate ${
                      active ? '!text-gray-900' : '!text-gray-800'
                    }`}
                  >
                    {m.displayName || m.modelName}
                  </Text>
                </div>
                <div className='flex items-center gap-1.5'>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${vStyle.light}`}
                  >
                    {m.vendor}
                  </span>
                  <Text type='tertiary' className='!text-[11px] truncate'>
                    {m.modality === 'video' ? t('视频生成') : t('图像生成')}
                  </Text>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default ModelPicker;
