import React, { useEffect, useState, useRef } from 'react';
import { Button, Select, InputNumber, Typography, Space } from '@douyinfe/semi-ui';
import { IconDelete, IconPlus } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../helpers';

const { Text } = Typography;

const parseValue = (value) => {
  if (!value) return [];
  try {
    const obj = typeof value === 'string' ? JSON.parse(value) : value;
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).map(([model, ratio]) => ({
      model,
      ratio: Number(ratio) || 0,
    }));
  } catch (e) {
    return [];
  }
};

const serializeRows = (rows) => {
  const obj = {};
  rows.forEach((row) => {
    if (row.model && row.ratio > 0) {
      obj[row.model] = row.ratio;
    }
  });
  if (Object.keys(obj).length === 0) return '';
  return JSON.stringify(obj);
};

const ModelRatioEditor = ({ value, onChange, modelsEndpoint = '/api/models' }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState(() => parseValue(value));
  const [modelOptions, setModelOptions] = useState([]);
  const lastValueRef = useRef(value || '');

  useEffect(() => {
    if ((value || '') === lastValueRef.current) return;
    lastValueRef.current = value || '';
    setRows(parseValue(value));
  }, [value]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await API.get(modelsEndpoint);
        const body = res.data;
        if (!body) return;
        let list = body.data;
        if (list && !Array.isArray(list) && list.data) list = list.data;
        if (!Array.isArray(list)) return;
        const names = list
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              return item.model_name || item.name || item.id || '';
            }
            return '';
          })
          .filter(Boolean);
        const unique = Array.from(new Set(names)).sort();
        setModelOptions(unique.map((m) => ({ label: m, value: m })));
      } catch (e) {
        showError(e.message || t('获取模型列表失败'));
      }
    };
    load();
  }, [modelsEndpoint]);

  const emitChange = (next) => {
    const json = serializeRows(next);
    lastValueRef.current = json;
    if (onChange) onChange(json);
  };

  const updateRow = (idx, patch) => {
    const next = rows.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    setRows(next);
    emitChange(next);
  };

  const removeRow = (idx) => {
    const next = rows.filter((_, i) => i !== idx);
    setRows(next);
    emitChange(next);
  };

  const addRow = () => {
    const next = [...rows, { model: '', ratio: 1 }];
    setRows(next);
  };

  return (
    <div className='space-y-2'>
      {rows.length === 0 && (
        <Text type='tertiary' size='small'>
          {t('未设置模型级倍率；请点击下方"添加"为特定模型配置倍率。')}
        </Text>
      )}
      {rows.map((row, idx) => (
        <Space key={idx} align='center' style={{ width: '100%' }}>
          <Select
            style={{ width: 260 }}
            placeholder={t('选择模型')}
            optionList={modelOptions}
            value={row.model || undefined}
            onChange={(val) => updateRow(idx, { model: val || '' })}
            filter
            showClear
            allowCreate
            defaultActiveFirstOption
          />
          <InputNumber
            style={{ width: 140 }}
            value={row.ratio}
            min={0.0001}
            step={0.1}
            precision={4}
            onChange={(val) => updateRow(idx, { ratio: Number(val) || 0 })}
          />
          <Button
            type='tertiary'
            theme='borderless'
            icon={<IconDelete />}
            onClick={() => removeRow(idx)}
          />
        </Space>
      ))}
      <Button
        type='primary'
        theme='light'
        icon={<IconPlus />}
        onClick={addRow}
        size='small'
      >
        {t('添加')}
      </Button>
    </div>
  );
};

export default ModelRatioEditor;
