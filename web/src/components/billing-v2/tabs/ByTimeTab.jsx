/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useMemo } from 'react';
import { Card, Spin, Empty } from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { useTranslation } from 'react-i18next';

import { useBillingV2Fetch } from '../useBillingV2Fetch';
import { renderQuota } from '../../../helpers/render';

/**
 * 「按时间」Tab。双轴线图:消费 + 调用次数。
 * 粒度由后端根据 period 长度自动选(<48h 用 hour,否则 day)。
 */
export default function ByTimeTab({ queryParams }) {
  const { t } = useTranslation();
  const { data, loading } = useBillingV2Fetch('timeseries', queryParams);

  const points = data?.points || [];

  const lineSpec = useMemo(() => {
    if (!points.length) return null;
    // 双 series:消费(¥)+ 调用次数,共享 x 轴
    return {
      type: 'common',
      data: [
        {
          id: 'quota',
          values: points.map((p) => ({ x: p.date, y: p.quota, type: '消费' })),
        },
        {
          id: 'count',
          values: points.map((p) => ({ x: p.date, y: p.request_count, type: '调用次数' })),
        },
      ],
      series: [
        {
          type: 'line',
          dataIndex: 0,
          xField: 'x',
          yField: 'y',
          seriesField: 'type',
          point: { visible: true },
          line: { style: { strokeWidth: 2 } },
        },
        {
          type: 'line',
          dataIndex: 1,
          xField: 'x',
          yField: 'y',
          seriesField: 'type',
          point: { visible: true },
          line: { style: { strokeWidth: 2, lineDash: [4, 4] } },
        },
      ],
      axes: [
        { orient: 'bottom', type: 'band', label: { autoLimit: true, autoEllipsis: { suffix: '...' } } },
        {
          orient: 'left',
          seriesIndex: [0],
          title: { visible: true, text: t('消费') },
          label: { formatMethod: (v) => renderQuota(v, 0) },
        },
        {
          orient: 'right',
          seriesIndex: [1],
          title: { visible: true, text: t('调用次数') },
          grid: { visible: false },
        },
      ],
      legends: { visible: true, orient: 'top' },
      tooltip: {
        dimension: { visible: true },
      },
    };
  }, [points, t]);

  if (loading) {
    return <div className='py-12 flex justify-center'><Spin size='large' /></div>;
  }
  if (!points.length) {
    return <Card className='!rounded-2xl border-0' shadows='hover'><Empty description={t('当前周期无消费数据')} /></Card>;
  }

  // 简单总计
  const totalQuota = points.reduce((acc, p) => acc + (p.quota || 0), 0);
  const totalCount = points.reduce((acc, p) => acc + (p.request_count || 0), 0);

  return (
    <Card className='!rounded-2xl border-0' shadows='hover'>
      <div className='mb-2 text-sm font-medium flex items-center gap-4'>
        <span>{t('消费走势')}</span>
        <span className='text-xs text-slate-400'>
          {t('粒度')}: {data?.granularity === 'hour' ? t('小时') : t('天')} ·{' '}
          {t('总计')} {renderQuota(totalQuota, 2)} · {t('调用')} {totalCount.toLocaleString()}
        </span>
      </div>
      <div style={{ height: 420 }}>
        <VChart spec={lineSpec} />
      </div>
    </Card>
  );
}
