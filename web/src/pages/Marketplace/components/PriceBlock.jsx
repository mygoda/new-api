/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { Card, Tag, Table } from '@douyinfe/semi-ui';

const formatPrice = (val) => {
  if (val == null) return '-';
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val >= 0.01) return `$${val.toFixed(3)}`;
  return `$${val.toFixed(4)}`;
};

const PriceBlock = ({ model, t }) => {
  if (model.quota_type === 1) {
    return (
      <Card className='!rounded-2xl' bodyStyle={{ padding: 20 }}>
        <div className='text-sm text-gray-500 mb-1'>{t('按次计费')}</div>
        <div className='text-3xl font-semibold text-orange-600'>
          {formatPrice(model.price_per_request)}
          <span className='text-sm text-gray-500 ml-2 font-normal'>
            / {t('次')}
          </span>
        </div>
      </Card>
    );
  }

  const rows = [
    {
      key: 'input',
      label: t('输入'),
      value: formatPrice(model.input_price),
    },
    {
      key: 'output',
      label: t('输出'),
      value: formatPrice(model.output_price),
    },
  ];
  if (model.cached_price != null) {
    rows.push({
      key: 'cached',
      label: t('缓存读'),
      value: formatPrice(model.cached_price),
    });
  }
  if (model.cache_create_price != null) {
    rows.push({
      key: 'cache_create',
      label: t('缓存写'),
      value: formatPrice(model.cache_create_price),
    });
  }

  return (
    <Card className='!rounded-2xl' bodyStyle={{ padding: 20 }}>
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
        {rows.map((r) => (
          <div key={r.key}>
            <div className='text-xs text-gray-500 mb-1'>{r.label}</div>
            <div className='text-xl font-semibold text-orange-600'>
              {r.value}
              <span className='text-xs text-gray-500 ml-1 font-normal'>
                / 1M
              </span>
            </div>
          </div>
        ))}
      </div>

      {model.tiers && model.tiers.length > 0 && (
        <div className='mt-5 pt-5 border-t border-gray-100'>
          <div className='text-sm font-medium mb-2'>{t('阶梯计费')}</div>
          <Table
            size='small'
            pagination={false}
            dataSource={model.tiers.map((tier, idx) => ({
              key: idx,
              ...tier,
            }))}
            columns={[
              {
                title: t('档位 (prompt tokens)'),
                dataIndex: 'threshold',
                render: (v, _r, idx) => {
                  if (idx === 0) return `≤ ${v}`;
                  const prev = model.tiers[idx - 1].threshold;
                  if (v === 0 || v == null) return `> ${prev}`;
                  return `${prev + 1} ~ ${v}`;
                },
              },
              {
                title: t('输入'),
                dataIndex: 'input_price',
                render: (v) => `${formatPrice(v)} / 1M`,
              },
              {
                title: t('输出'),
                dataIndex: 'output_price',
                render: (v) => `${formatPrice(v)} / 1M`,
              },
              {
                title: t('缓存读'),
                dataIndex: 'cached_price',
                render: (v) => (v != null ? `${formatPrice(v)} / 1M` : '-'),
              },
            ]}
          />
        </div>
      )}
    </Card>
  );
};

export default PriceBlock;
