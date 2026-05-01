/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React from 'react';
import {
  Slider,
  Switch,
  InputNumber,
  Select,
  Input,
  Typography,
  Button,
  Tooltip,
} from '@douyinfe/semi-ui';
import { Dices } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FIELD } from '../../constants/creation/models';
import CameraControl from './CameraControl';

const { Text } = Typography;

// 单个字段的渲染器，按 ParamFieldSchema.type 派发
const FieldRow = ({ field, name, value, onChange }) => {
  const { t } = useTranslation();
  const label = field.label ? t(field.label) : name;

  const renderControl = () => {
    switch (field.type) {
      case FIELD.segmented:
      case FIELD.ratio:
        return (
          <div className='flex flex-wrap gap-1.5'>
            {field.options.map((opt) => {
              const active =
                value === opt || (value == null && opt === field.default);
              return (
                <button
                  key={String(opt)}
                  type='button'
                  onClick={() => onChange(opt)}
                  className={[
                    'px-3 py-1 text-xs rounded-md border transition-colors',
                    active
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
                  ].join(' ')}
                >
                  {String(opt)}
                </button>
              );
            })}
          </div>
        );

      case FIELD.select:
        return (
          <Select
            value={value ?? field.default}
            onChange={onChange}
            optionList={field.options.map((o) => ({
              label: String(o),
              value: o,
            }))}
            style={{ width: '100%' }}
            className='!rounded-lg'
          />
        );

      case FIELD.slider:
        return (
          <div className='flex items-center gap-2'>
            <Slider
              min={field.min}
              max={field.max}
              step={field.step ?? 0.1}
              value={value ?? field.default}
              onChange={onChange}
              style={{ flex: 1 }}
            />
            <span className='text-xs text-gray-500 w-10 text-right'>
              {Number(value ?? field.default).toFixed(1)}
            </span>
          </div>
        );

      case FIELD.switch:
        return (
          <Switch
            checked={value ?? field.default}
            onChange={onChange}
            size='small'
          />
        );

      case FIELD.number:
        return (
          <InputNumber
            min={field.min}
            max={field.max}
            value={value ?? field.default}
            onChange={onChange}
            style={{ width: '100%' }}
            className='!rounded-lg'
          />
        );

      case FIELD.seed:
        return (
          <div className='flex items-center gap-2'>
            <InputNumber
              value={value ?? field.default}
              onChange={onChange}
              min={-1}
              style={{ flex: 1 }}
              className='!rounded-lg'
            />
            <Tooltip content={t('随机')}>
              <Button
                type='tertiary'
                size='small'
                icon={<Dices size={14} />}
                onClick={() => onChange(Math.floor(Math.random() * 1_000_000_000))}
              />
            </Tooltip>
          </div>
        );

      case FIELD.textarea:
        return (
          <Input
            placeholder={field.placeholder}
            value={value ?? ''}
            onChange={onChange}
            className='!rounded-lg'
          />
        );

      case 'camera':
        return (
          <CameraControl value={value} onChange={onChange} />
        );

      default:
        return null;
    }
  };

  return (
    <div className='space-y-1.5'>
      {field.type !== 'camera' && (
        <div className='flex items-center justify-between'>
          <Text strong className='!text-xs'>{label}</Text>
        </div>
      )}
      {renderControl()}
    </div>
  );
};

const ParamPanel = ({ schema, params, onParamChange }) => {
  const { t } = useTranslation();
  if (!schema) return null;

  const groups = { basic: [], advanced: [] };
  Object.entries(schema.fields || {}).forEach(([name, field]) => {
    const g = field.group || 'basic';
    (groups[g] || (groups[g] = [])).push([name, field]);
  });

  const renderGroup = (key, title) => {
    const list = groups[key] || [];
    if (!list.length) return null;
    return (
      <div className='space-y-3'>
        <Text type='tertiary' className='!text-xs uppercase tracking-wide'>
          {title}
        </Text>
        {list.map(([name, field]) => (
          <FieldRow
            key={name}
            name={name}
            field={field}
            value={params[name]}
            onChange={(v) => onParamChange(name, v)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className='space-y-5'>
      {renderGroup('basic', t('基础参数'))}
      {renderGroup('advanced', t('高级参数'))}
    </div>
  );
};

export default ParamPanel;
