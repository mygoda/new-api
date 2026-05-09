/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React from 'react';
import { Card, Spin, Empty, Table, Tag, Banner } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

import { useBillingV2Fetch } from '../useBillingV2Fetch';
import { renderQuota } from '../../../helpers/render';

/**
 * 「异常请求」Tab。
 * P0 只识别 high_cost(单次消费 > 用户在窗口内 P99 × 2)。
 * 后续会加 long_context / failed / retries 等类型。
 */
const TYPE_META = {
  high_cost: { label: '高消耗', icon: '🔥', color: 'red' },
  long_context: { label: '超长上下文', icon: '📜', color: 'amber' },
  failed: { label: '失败计费', icon: '✕', color: 'grey' },
  retries: { label: '频繁重试', icon: '♻️', color: 'orange' },
};

const SEVERITY_COLOR = {
  high: 'red',
  medium: 'orange',
  low: 'grey',
};

export default function AnomaliesTab({ queryParams }) {
  const { t } = useTranslation();
  const { data, loading } = useBillingV2Fetch('anomalies', queryParams);

  const items = data?.items || [];

  if (loading) {
    return <div className='py-12 flex justify-center'><Spin size='large' /></div>;
  }

  const columns = [
    { title: t('时间'), dataIndex: 'created_at', width: 180 },
    {
      title: t('类型'),
      dataIndex: 'type',
      width: 130,
      render: (type, row) => {
        const m = TYPE_META[type] || { label: type, icon: '⚠', color: 'grey' };
        return (
          <Tag size='small' color={m.color} shape='circle'>
            {m.icon} {t(m.label)}
          </Tag>
        );
      },
    },
    {
      title: t('严重程度'),
      dataIndex: 'severity',
      width: 90,
      render: (s) => (
        <Tag size='small' color={SEVERITY_COLOR[s] || 'grey'} shape='circle'>
          {t(s === 'high' ? '高' : s === 'medium' ? '中' : '低')}
        </Tag>
      ),
    },
    { title: t('模型'), dataIndex: 'model_name' },
    { title: 'Token', dataIndex: 'token_name', width: 120 },
    { title: t('Prompt Tokens'), dataIndex: 'prompt_tokens', width: 120, render: (n) => Number(n).toLocaleString() },
    { title: t('消费'), dataIndex: 'quota', width: 110, render: (q) => <span className='font-semibold tabular-nums'>{renderQuota(q, 2)}</span> },
    {
      title: t('提示'),
      dataIndex: 'hint_message',
      ellipsis: { showTitle: true },
    },
  ];

  return (
    <div className='space-y-3'>
      <Banner
        type='info'
        fullMode={false}
        closeIcon={null}
        description={t(
          '目前仅识别「高消耗」一类(单次消费 > 你在该周期内 P99 × 2)。其他类别(超长上下文 / 失败计费 / 频繁重试)在后续版本提供。',
        )}
      />
      {items.length === 0 ? (
        <Card className='!rounded-2xl border-0' shadows='hover'>
          <Empty description={t('当前周期未识别到异常请求')} />
        </Card>
      ) : (
        <Card className='!rounded-2xl border-0' shadows='hover'>
          <div className='mb-2 text-sm font-medium'>
            {t('共识别')} <span className='text-rose-500'>{data?.total || items.length}</span>{' '}
            {t('条异常,展示 Top')} {items.length}
          </div>
          <Table dataSource={items} columns={columns} rowKey='request_id' pagination={false} size='middle' />
        </Card>
      )}
    </div>
  );
}
