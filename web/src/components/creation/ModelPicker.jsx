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
import { Card, Typography, Tag } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';

const { Text, Title } = Typography;

// 模型卡片选择器：网格展示，单选高亮
const ModelPicker = ({ models, value, onChange }) => {
  const { t } = useTranslation();
  const list = useMemo(() => models || [], [models]);

  if (!list.length) {
    return (
      <Card bordered={false} className='!bg-gray-50'>
        <div className='py-6 text-center'>
          <Sparkles size={20} className='text-gray-400 mx-auto mb-2' />
          <Text type='tertiary'>{t('暂无可用模型')}</Text>
        </div>
      </Card>
    );
  }

  return (
    <div className='grid grid-cols-1 gap-2'>
      {list.map((m) => {
        const active = m.modelName === value;
        return (
          <button
            key={m.modelName}
            type='button'
            onClick={() => onChange?.(m.modelName)}
            className={[
              'text-left rounded-lg border-2 transition-all px-3 py-2.5',
              active
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 bg-white',
            ].join(' ')}
          >
            <div className='flex items-center justify-between mb-1'>
              <Title heading={6} className='!mb-0 !text-sm'>
                {m.displayName || m.modelName}
              </Title>
              <Tag size='small' color={active ? 'blue' : 'grey'}>
                {m.vendor}
              </Tag>
            </div>
            <Text type='tertiary' size='small' className='!text-xs'>
              {m.modality === 'video' ? t('视频生成') : t('图像生成')} ·{' '}
              {m.modelName}
            </Text>
          </button>
        );
      })}
    </div>
  );
};

export default ModelPicker;
