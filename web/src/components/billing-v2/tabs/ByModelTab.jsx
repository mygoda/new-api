/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useMemo } from 'react';
import { Card, Spin, Empty, Table, Tag } from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { useTranslation } from 'react-i18next';

import { useBillingV2Fetch } from '../useBillingV2Fetch';
import { renderQuota } from '../../../helpers/render';
import { vendorOf } from '../../../constants/billing/vendor-groups';

/**
 * 「按模型」Tab。
 * 左侧饼图 + 右侧 Top 10 表格。点击行可以钻取(后续实现)。
 */
export default function ByModelTab({ queryParams }) {
  const { t } = useTranslation();
  const { data, loading } = useBillingV2Fetch('breakdown', { ...queryParams, dim: 'model' });

  const items = data?.items || [];
  const total = data?.total_quota || 0;

  // 饼图 spec
  const pieSpec = useMemo(() => {
    if (!items.length) {
      return null;
    }
    return {
      type: 'pie',
      data: [{ id: 'model', values: items.map((i) => ({ type: i.label, value: i.quota })) }],
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
      label: { visible: true, formatMethod: (text, datum) => datum?.type || '' },
      tooltip: {
        mark: {
          content: [
            { key: (d) => d.type, value: (d) => renderQuota(d.value, 2) },
          ],
        },
      },
    };
  }, [items]);

  if (loading) {
    return (
      <div className='py-12 flex justify-center'>
        <Spin size='large' />
      </div>
    );
  }

  if (!items.length) {
    return (
      <Card className='!rounded-2xl border-0' shadows='hover'>
        <Empty description={t('当前周期无消费数据')} />
      </Card>
    );
  }

  const columns = [
    {
      title: '#',
      width: 50,
      render: (_, __, idx) => idx + 1,
    },
    {
      title: t('模型'),
      dataIndex: 'label',
      render: (label) => {
        const v = vendorOf(label);
        return (
          <div className='flex items-center gap-2'>
            <span className='font-medium'>{label}</span>
            <Tag size='small' color='violet' shape='circle'>
              {v.label}
            </Tag>
          </div>
        );
      },
    },
    {
      title: t('调用次数'),
      dataIndex: 'request_count',
      width: 100,
      render: (n) => Number(n).toLocaleString(),
    },
    {
      title: 'Tokens',
      dataIndex: 'total_tokens',
      width: 100,
      render: (n) => Number(n).toLocaleString(),
    },
    {
      title: t('消费'),
      dataIndex: 'quota',
      width: 110,
      render: (q) => <span className='font-semibold tabular-nums'>{renderQuota(q, 2)}</span>,
    },
    {
      title: t('占比'),
      dataIndex: 'percent',
      width: 90,
      render: (p) => `${(p || 0).toFixed(1)}%`,
    },
  ];

  return (
    <div className='grid lg:grid-cols-5 gap-4'>
      <Card className='!rounded-2xl border-0 lg:col-span-2' shadows='hover'>
        <div className='mb-2 text-sm font-medium'>
          {t('模型消费分布')} · {t('总计')} {renderQuota(total, 2)}
        </div>
        <div style={{ height: 380 }}>
          {pieSpec && <VChart spec={pieSpec} />}
        </div>
      </Card>
      <Card className='!rounded-2xl border-0 lg:col-span-3' shadows='hover'>
        <div className='mb-2 text-sm font-medium'>
          {t('Top 模型')}
        </div>
        <Table
          dataSource={items}
          columns={columns}
          rowKey='key'
          pagination={false}
          size='middle'
        />
      </Card>
    </div>
  );
}
