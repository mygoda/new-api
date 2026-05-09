/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useState } from 'react';
import { Card, Spin, Empty, Table, Tag } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

import { API, showError } from '../../../helpers';
import { renderQuota } from '../../../helpers/render';
import { vendorOf } from '../../../constants/billing/vendor-groups';

/**
 * 「流水明细」Tab。
 *
 * 后端字段已严格 strip channel,前端只展示模型 / 厂商(由前端正则推导)/
 * Token / 输入输出 / 消费 / 状态。
 */
export default function DetailsTab({ queryParams }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          ...queryParams,
          page: String(page),
          page_size: String(pageSize),
        }).toString();
        const res = await API.get(`/api/billing/v2/details?${qs}`);
        if (!alive) return;
        if (res.data?.success) {
          setData(res.data.data);
        } else {
          showError(res.data?.message || t('加载明细失败'));
        }
      } catch (e) {
        if (alive) showError(e?.message || t('加载明细失败'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // 用 JSON.stringify 稳定 object 依赖,避免引用变化触发死循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(queryParams), page, pageSize]);

  const items = data?.items || [];
  const total = data?.total || 0;

  const columns = [
    { title: t('时间'), dataIndex: 'created_at', width: 170 },
    {
      title: t('模型'),
      dataIndex: 'model_name',
      render: (model) => {
        const v = vendorOf(model);
        return (
          <div className='flex items-center gap-2'>
            <span className='font-medium'>{model}</span>
            <Tag size='small' color='violet' shape='circle'>
              {v.label}
            </Tag>
          </div>
        );
      },
    },
    { title: 'Token', dataIndex: 'token_name', width: 130, render: (n) => n || 'default' },
    {
      title: t('输入/输出'),
      width: 130,
      render: (_, r) => (
        <span className='tabular-nums text-xs'>
          {Number(r.prompt_tokens).toLocaleString()} / {Number(r.completion_tokens).toLocaleString()}
        </span>
      ),
    },
    {
      title: t('消费'),
      dataIndex: 'quota',
      width: 110,
      render: (q) => <span className='font-semibold tabular-nums'>{renderQuota(q, 4)}</span>,
    },
    {
      title: t('耗时'),
      dataIndex: 'use_time_ms',
      width: 80,
      render: (ms) => (ms ? `${(ms / 1000).toFixed(2)}s` : '—'),
    },
    {
      title: t('状态'),
      dataIndex: 'is_success',
      width: 80,
      render: (s) =>
        s ? (
          <Tag size='small' color='green' shape='circle'>{t('成功')}</Tag>
        ) : (
          <Tag size='small' color='red' shape='circle'>{t('失败')}</Tag>
        ),
    },
  ];

  if (loading && !data) {
    return <div className='py-12 flex justify-center'><Spin size='large' /></div>;
  }
  if (!loading && !items.length) {
    return <Card className='!rounded-2xl border-0' shadows='hover'><Empty description={t('当前周期无消费记录')} /></Card>;
  }

  return (
    <Card className='!rounded-2xl border-0' shadows='hover'>
      <div className='mb-2 text-sm font-medium flex items-center justify-between'>
        <span>
          {t('明细流水')} ·{' '}
          <span className='text-slate-400 font-normal'>
            {t('共')} {total.toLocaleString()} {t('条')}
          </span>
        </span>
      </div>
      <Spin spinning={loading} size='middle'>
        <Table
          dataSource={items}
          columns={columns}
          rowKey='request_id'
          size='middle'
          pagination={{
            currentPage: page,
            pageSize: pageSize,
            total: total,
            pageSizeOpts: [20, 50, 100, 200],
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Spin>
    </Card>
  );
}
