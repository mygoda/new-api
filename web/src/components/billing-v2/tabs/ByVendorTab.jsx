/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useMemo } from 'react';
import { Card, Spin, Empty, Table } from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { useTranslation } from 'react-i18next';

import { useBillingV2Fetch } from '../useBillingV2Fetch';
import { renderQuota } from '../../../helpers/render';
import { vendorOf, VENDOR_GROUPS } from '../../../constants/billing/vendor-groups';

/**
 * 「按厂商」Tab。
 *
 * 后端不提供按厂商聚合(channel.vendor 不可暴露,model.vendor 又是用户感知),
 * 所以前端拿「按模型」结果再做一次 group by vendorOf(modelName)。
 */
export default function ByVendorTab({ queryParams }) {
  const { t } = useTranslation();
  const { data, loading } = useBillingV2Fetch('breakdown', { ...queryParams, dim: 'model', top: 100 });

  const { vendorRows, totalQuota } = useMemo(() => {
    const items = data?.items || [];
    const total = items.reduce((acc, i) => acc + (i.quota || 0), 0);
    const groupMap = new Map();
    for (const it of items) {
      // others 不参与厂商分组(归到 Other)
      const v = it.key === '__others__' ? VENDOR_GROUPS[VENDOR_GROUPS.length - 1] : vendorOf(it.label);
      if (!groupMap.has(v.key)) {
        groupMap.set(v.key, {
          key: v.key,
          label: v.label,
          color: v.color,
          quota: 0,
          request_count: 0,
          total_tokens: 0,
        });
      }
      const r = groupMap.get(v.key);
      r.quota += it.quota || 0;
      r.request_count += it.request_count || 0;
      r.total_tokens += it.total_tokens || 0;
    }
    const rows = Array.from(groupMap.values())
      .map((r) => ({
        ...r,
        percent: total > 0 ? (r.quota * 100) / total : 0,
      }))
      .sort((a, b) => b.quota - a.quota);
    return { vendorRows: rows, totalQuota: total };
  }, [data]);

  const pieSpec = useMemo(() => {
    if (!vendorRows.length) return null;
    return {
      type: 'pie',
      data: [{ id: 'vendor', values: vendorRows.map((r) => ({ type: r.label, value: r.quota })) }],
      outerRadius: 0.85,
      innerRadius: 0.55,
      padAngle: 0.6,
      valueField: 'value',
      categoryField: 'type',
      pie: {
        style: { cornerRadius: 6 },
        state: { hover: { outerRadius: 0.9, stroke: '#000', lineWidth: 1 } },
      },
      legends: { visible: true, orient: 'right', position: 'middle' },
      label: { visible: true, formatMethod: (text, d) => d?.type || '' },
      tooltip: {
        mark: {
          content: [{ key: (d) => d.type, value: (d) => renderQuota(d.value, 2) }],
        },
      },
    };
  }, [vendorRows]);

  if (loading) {
    return <div className='py-12 flex justify-center'><Spin size='large' /></div>;
  }
  if (!vendorRows.length) {
    return <Card className='!rounded-2xl border-0' shadows='hover'><Empty description={t('当前周期无消费数据')} /></Card>;
  }

  const columns = [
    { title: '#', width: 50, render: (_, __, i) => i + 1 },
    {
      title: t('厂商'),
      dataIndex: 'label',
      render: (label, row) => (
        <div className='flex items-center gap-2'>
          <span
            className='inline-block w-3 h-3 rounded-full'
            style={{ background: row.color }}
          />
          <span className='font-medium'>{label}</span>
        </div>
      ),
    },
    { title: t('调用次数'), dataIndex: 'request_count', width: 110, render: (n) => Number(n).toLocaleString() },
    { title: 'Tokens', dataIndex: 'total_tokens', width: 110, render: (n) => Number(n).toLocaleString() },
    { title: t('消费'), dataIndex: 'quota', width: 120, render: (q) => <span className='font-semibold tabular-nums'>{renderQuota(q, 2)}</span> },
    { title: t('占比'), dataIndex: 'percent', width: 90, render: (p) => `${(p || 0).toFixed(1)}%` },
  ];

  return (
    <div className='grid lg:grid-cols-5 gap-4'>
      <Card className='!rounded-2xl border-0 lg:col-span-2' shadows='hover'>
        <div className='mb-2 text-sm font-medium'>
          {t('厂商消费分布')} · {t('总计')} {renderQuota(totalQuota, 2)}
        </div>
        <div style={{ height: 380 }}>{pieSpec && <VChart spec={pieSpec} />}</div>
      </Card>
      <Card className='!rounded-2xl border-0 lg:col-span-3' shadows='hover'>
        <div className='mb-2 text-sm font-medium'>{t('厂商列表')}</div>
        <Table dataSource={vendorRows} columns={columns} rowKey='key' pagination={false} size='middle' />
      </Card>
    </div>
  );
}
