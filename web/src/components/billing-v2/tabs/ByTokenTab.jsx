/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React from 'react';
import { Card, Spin, Empty, Table } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

import { useBillingV2Fetch } from '../useBillingV2Fetch';
import { renderQuota } from '../../../helpers/render';

/**
 * 「按 Token」Tab。
 * 简单表格:Token Name / 调用次数 / 消费 / 占比。
 * 没有 Token Name 的请求归到 "default"(后端处理)。
 */
export default function ByTokenTab({ queryParams }) {
  const { t } = useTranslation();
  const { data, loading } = useBillingV2Fetch('breakdown', { ...queryParams, dim: 'token' });

  const items = data?.items || [];
  const total = data?.total_quota || 0;

  if (loading) {
    return <div className='py-12 flex justify-center'><Spin size='large' /></div>;
  }
  if (!items.length) {
    return <Card className='!rounded-2xl border-0' shadows='hover'><Empty description={t('当前周期无消费数据')} /></Card>;
  }

  const columns = [
    { title: '#', width: 50, render: (_, __, i) => i + 1 },
    {
      title: t('Token 名称'),
      dataIndex: 'label',
      render: (label) => <span className='font-medium'>{label || 'default'}</span>,
    },
    { title: t('调用次数'), dataIndex: 'request_count', width: 110, render: (n) => Number(n).toLocaleString() },
    { title: t('Token'), dataIndex: 'total_tokens', width: 110, render: (n) => Number(n).toLocaleString() },
    { title: t('消费'), dataIndex: 'quota', width: 130, render: (q) => <span className='font-semibold tabular-nums'>{renderQuota(q, 2)}</span> },
    {
      title: t('占比'),
      dataIndex: 'percent',
      width: 220,
      render: (p) => (
        <div className='flex items-center gap-2'>
          <div className='flex-1 h-1.5 rounded bg-slate-100 overflow-hidden'>
            <div
              className='h-full bg-gradient-to-r from-indigo-500 to-pink-500'
              style={{ width: `${Math.min(p || 0, 100)}%` }}
            />
          </div>
          <span className='text-xs text-slate-500 w-12 text-right'>{(p || 0).toFixed(1)}%</span>
        </div>
      ),
    },
  ];

  return (
    <Card className='!rounded-2xl border-0' shadows='hover'>
      <div className='mb-2 text-sm font-medium'>
        {t('按 Token 聚合')} · {t('总计')} {renderQuota(total, 2)}
      </div>
      <Table dataSource={items} columns={columns} rowKey='key' pagination={false} size='middle' />
    </Card>
  );
}
