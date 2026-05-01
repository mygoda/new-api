/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React from 'react';
import { Slider, Typography, Button } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

// 镜头预设：Kling 官方支持的 type 字符串
// 参考 https://app.klingai.com/cn/dev/document-api
const PRESETS = [
  { key: 'simple', label: '高级（手动调）' },
  { key: 'down_back', label: 'Down-Back' },
  { key: 'forward_up', label: 'Forward-Up' },
  { key: 'right_turn_forward', label: 'Right-Turn-Forward' },
  { key: 'left_turn_forward', label: 'Left-Turn-Forward' },
];

const SLIDERS = [
  { key: 'horizontal', label: '水平' },
  { key: 'vertical', label: '垂直' },
  { key: 'pan', label: 'Pan' },
  { key: 'tilt', label: 'Tilt' },
  { key: 'roll', label: 'Roll' },
  { key: 'zoom', label: 'Zoom' },
];

// 受控组件：value = { preset, advanced: { horizontal, vertical, pan, tilt, roll, zoom } }
const CameraControl = ({ value, onChange }) => {
  const { t } = useTranslation();
  const v = value || { preset: '', advanced: {} };
  const isAdvanced = v.preset === 'simple';

  const setPreset = (preset) => {
    onChange?.({ preset, advanced: preset === 'simple' ? (v.advanced || {}) : {} });
  };

  const setAdv = (k, val) => {
    onChange?.({
      preset: 'simple',
      advanced: { ...(v.advanced || {}), [k]: val },
    });
  };

  return (
    <div className='space-y-2.5'>
      <Text strong className='!text-xs'>
        {t('镜头控制')}
      </Text>

      <div className='flex flex-wrap gap-1.5'>
        <button
          type='button'
          onClick={() => setPreset('')}
          className={[
            'px-2.5 py-1 text-xs rounded border',
            !v.preset
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-700 border-gray-200',
          ].join(' ')}
        >
          {t('固定')}
        </button>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type='button'
            onClick={() => setPreset(p.key)}
            className={[
              'px-2.5 py-1 text-xs rounded border',
              v.preset === p.key
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-700 border-gray-200',
            ].join(' ')}
          >
            {t(p.label)}
          </button>
        ))}
      </div>

      {isAdvanced && (
        <div className='pt-1 border-l-2 border-blue-200 pl-2.5 space-y-2'>
          {SLIDERS.map(({ key, label }) => (
            <div key={key} className='flex items-center gap-2'>
              <Text className='!text-xs w-14 flex-shrink-0'>{t(label)}</Text>
              <Slider
                min={-10}
                max={10}
                step={0.5}
                value={v.advanced?.[key] ?? 0}
                onChange={(val) => setAdv(key, val)}
                style={{ flex: 1 }}
              />
              <span className='text-xs text-gray-500 w-8 text-right'>
                {Number(v.advanced?.[key] ?? 0).toFixed(1)}
              </span>
            </div>
          ))}
          <Button
            size='small'
            theme='borderless'
            onClick={() =>
              onChange?.({ preset: 'simple', advanced: {} })
            }
          >
            {t('清空所有滑块')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CameraControl;
