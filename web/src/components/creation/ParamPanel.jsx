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
import { Dices, HelpCircle } from 'lucide-react';
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
              // 容错比较：数字与字符串可比；undefined 时退化到 default
              const cur = value !== undefined && value !== null ? value : field.default;
              const active = String(cur) === String(opt);
              return (
                <button
                  key={String(opt)}
                  type='button'
                  onClick={() => onChange(opt)}
                  className={[
                    'relative px-3.5 py-1.5 text-xs rounded-md border transition-all',
                    active
                      ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-[0_2px_6px_rgba(37,99,235,0.35)] ring-2 ring-blue-200 ring-offset-1 scale-[1.02]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/60',
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
            className='!rounded-md'
            size='small'
          />
        );

      case FIELD.slider:
        return (
          <div className='flex items-center gap-3 px-1'>
            <Slider
              min={field.min}
              max={field.max}
              step={field.step ?? 0.1}
              value={value ?? field.default}
              onChange={onChange}
              style={{ flex: 1 }}
            />
            <span className='text-xs text-gray-700 w-9 text-right tabular-nums font-medium'>
              {Number(value ?? field.default).toFixed(1)}
            </span>
          </div>
        );

      case FIELD.switch:
        return (
          <div className='flex justify-end'>
            <Switch
              checked={value ?? field.default}
              onChange={onChange}
              size='small'
            />
          </div>
        );

      case FIELD.number:
        return (
          <InputNumber
            min={field.min}
            max={field.max}
            value={value ?? field.default}
            placeholder={field.default !== undefined ? String(field.default) : ''}
            onChange={onChange}
            style={{ width: '100%' }}
            className='!rounded-md !border !border-gray-300'
            size='small'
          />
        );

      case FIELD.seed:
        return (
          <div className='flex items-center gap-1.5'>
            <InputNumber
              value={value ?? field.default}
              onChange={onChange}
              min={-1}
              style={{ flex: 1 }}
              className='!rounded-md !border !border-gray-300'
              size='small'
              placeholder='-1 表示随机'
            />
            <Tooltip content={t('随机')}>
              <Button
                theme='light'
                type='tertiary'
                size='small'
                icon={<Dices size={13} />}
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
            className='!rounded-md'
            size='small'
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

  // 整段视觉：左侧 label（固定宽度）+ 右侧控件（弹性）
  // 例外：camera / textarea / segmented 这种内容多的，仍然上下布局
  const isStackLayout =
    field.type === 'camera' ||
    field.type === 'textarea' ||
    field.type === FIELD.segmented ||
    field.type === FIELD.ratio ||
    field.type === FIELD.slider;

  if (isStackLayout) {
    return (
      <div className='space-y-1.5'>
        {field.type !== 'camera' && (
          <div className='flex items-center gap-1'>
            <Text className='!text-[11px] !text-gray-500 !leading-none'>
              {label}
            </Text>
            {field.help && (
              <Tooltip content={t(field.help)}>
                <HelpCircle size={11} className='text-gray-400 cursor-help' />
              </Tooltip>
            )}
          </div>
        )}
        {renderControl()}
      </div>
    );
  }

  // 行内布局：label 在左，控件在右
  return (
    <div className='flex items-center gap-3'>
      <div className='flex items-center gap-1 flex-shrink-0 w-16'>
        <Text className='!text-[11px] !text-gray-500'>{label}</Text>
        {field.help && (
          <Tooltip content={t(field.help)}>
            <HelpCircle size={11} className='text-gray-400 cursor-help' />
          </Tooltip>
        )}
      </div>
      <div className='flex-1 min-w-0'>{renderControl()}</div>
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

  const renderGroup = (key, title, isAdvanced = false) => {
    const list = groups[key] || [];
    if (!list.length) return null;
    return (
      <div className='space-y-3'>
        {isAdvanced ? (
          <div className='flex items-center gap-2'>
            <div className='h-px flex-1 bg-gray-200' />
            <Text type='tertiary' className='!text-[10px] !text-gray-500 uppercase tracking-wider'>
              {title}
            </Text>
            <div className='h-px flex-1 bg-gray-200' />
          </div>
        ) : (
          <Text type='tertiary' className='!text-[10px] !text-gray-400 uppercase tracking-wider'>
            {title}
          </Text>
        )}
        <div className='space-y-3'>
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
      </div>
    );
  };

  return (
    <div className='space-y-5'>
      {renderGroup('basic', t('基础参数'))}
      {renderGroup('advanced', t('高级参数'), true)}
    </div>
  );
};

export default ParamPanel;
