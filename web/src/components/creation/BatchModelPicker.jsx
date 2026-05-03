/*
Copyright (C) 2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later

批量模型选择器：
- 用户可勾选 2-4 个模型，使用同一提示词并发生成，做横向对比
*/

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Typography, Tag, Toast } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Layers, Check } from 'lucide-react';

const { Text } = Typography;

const MAX_MODELS = 4;

const BatchModelPicker = ({
  visible,
  models,            // [{ modelName, vendor, ... }]
  initial = [],
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(initial);

  useEffect(() => {
    if (visible) setSelected(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggle = (name) => {
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= MAX_MODELS) {
        Toast.warning(t('最多同时选择 {{n}} 个模型', { n: MAX_MODELS }));
        return prev;
      }
      return [...prev, name];
    });
  };

  const handleConfirm = () => {
    if (selected.length < 2) {
      Toast.warning(t('请至少选择 2 个模型才能对比'));
      return;
    }
    onConfirm?.(selected);
  };

  const grouped = useMemo(() => {
    const map = new Map();
    for (const m of models || []) {
      const key = m.vendor || 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return Array.from(map.entries());
  }, [models]);

  return (
    <Modal
      title={
        <div className='flex items-center gap-2'>
          <Layers size={16} className='text-blue-500' />
          {t('批量对比 · 选择模型')}
          <Tag size='small' color='blue'>
            {selected.length} / {MAX_MODELS}
          </Tag>
        </div>
      }
      visible={visible}
      onCancel={onCancel}
      onOk={handleConfirm}
      okText={t('开始对比生成')}
      cancelText={t('取消')}
      width={560}
      okButtonProps={{ disabled: selected.length < 2 }}
    >
      <div className='space-y-3'>
        <Text type='tertiary' className='!text-xs !block'>
          {t('选择 2-{{n}} 个模型，使用当前提示词并发生成，便于横向对比效果。', { n: MAX_MODELS })}
        </Text>

        {grouped.length === 0 && (
          <div className='py-8 text-center text-sm text-gray-400'>
            {t('暂无可用模型')}
          </div>
        )}

        <div className='max-h-[420px] overflow-y-auto space-y-3 pr-1'>
          {grouped.map(([vendor, list]) => (
            <div key={vendor}>
              <Text className='!text-[10px] !text-gray-400 uppercase tracking-wider !block mb-1.5'>
                {vendor}
              </Text>
              <div className='grid grid-cols-2 gap-1.5'>
                {list.map((m) => {
                  const checked = selected.includes(m.modelName);
                  return (
                    <button
                      key={m.modelName}
                      type='button'
                      onClick={() => toggle(m.modelName)}
                      className={[
                        'relative text-left px-2.5 py-2 rounded-md border transition-all flex items-center gap-2',
                        checked
                          ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-200'
                          : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30',
                      ].join(' ')}
                    >
                      <div
                        className={[
                          'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                          checked
                            ? 'bg-blue-500 border-blue-500'
                            : 'bg-white border-gray-300',
                        ].join(' ')}
                      >
                        {checked && <Check size={10} className='text-white' strokeWidth={3} />}
                      </div>
                      <Text
                        strong={checked}
                        className='!text-[12px] !text-gray-800 truncate'
                      >
                        {m.modelName}
                      </Text>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default BatchModelPicker;
