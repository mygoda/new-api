/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useState } from 'react';
import { Card, Spin, Empty, Table, Tag, Switch } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

import { API, showError } from '../../../helpers';
import { renderQuota } from '../../../helpers/render';
import { vendorOf } from '../../../constants/billing/vendor-groups';
import { buildQueryString } from '../queryUtils';

// 后端 created_at 是 UTC 的 ISO 8601(如 "2026-05-11T08:37:29Z");这里转成
// 浏览器本地时区显示。Doris 存的是 UTC,即使字符串没带 Z,后端落库前已用
// time.Now().UTC() 格式化,所以这里按 UTC 解析是正确的。
function formatLocalTime(s) {
  if (!s) return '—';
  // 已经带时区(Z 或 ±HH:MM)的 ISO 串,new Date 直接能解析为正确的瞬时;
  // 没带时区的(如 "2026-05-11 08:37:29")按 UTC 解释,避免被当成本地时间。
  let d;
  if (/Z|[+-]\d{2}:?\d{2}$/.test(s)) {
    d = new Date(s);
  } else {
    // 把 "YYYY-MM-DD HH:mm:ss" 转成 "YYYY-MM-DDTHH:mm:ssZ" 当作 UTC 解析
    d = new Date(s.replace(' ', 'T') + 'Z');
  }
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

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
  // 默认仅展示成功计费记录;切换开关后通过 include_failures=true 请求后端把失败请求也带回来。
  const [includeFailures, setIncludeFailures] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const qs = buildQueryString({
          ...queryParams,
          page: String(page),
          page_size: String(pageSize),
          ...(includeFailures ? { include_failures: 'true' } : {}),
        });
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
  }, [JSON.stringify(queryParams), page, pageSize, includeFailures]);

  const items = data?.items || [];
  const total = data?.total || 0;

  const columns = [
    {
      title: t('时间'),
      dataIndex: 'created_at',
      width: 170,
      render: (v) => (
        <span className='tabular-nums text-xs'>{formatLocalTime(v)}</span>
      ),
    },
    {
      title: t('模型'),
      dataIndex: 'model_name',
      render: (model) => {
        const v = vendorOf(model);
        return (
          <div className='min-w-0'>
            <div className='font-medium text-sm break-all leading-tight'>
              {model}
            </div>
            <div className='mt-0.5'>
              <Tag size='small' color='violet' shape='circle'>
                {v.label}
              </Tag>
            </div>
          </div>
        );
      },
    },
    {
      title: t('令牌'),
      dataIndex: 'token_name',
      width: 130,
      render: (n) => n || 'default',
    },
    {
      title: t('输入/输出'),
      width: 130,
      render: (_, r) => (
        <span className='tabular-nums text-xs'>
          {Number(r.prompt_tokens).toLocaleString()} /{' '}
          {Number(r.completion_tokens).toLocaleString()}
        </span>
      ),
    },
    {
      title: t('缓存读/写'),
      width: 130,
      render: (_, r) => {
        const read = Number(r.cache_tokens || 0);
        const write = Number(r.cache_creation_tokens || 0);
        if (!read && !write) {
          return <span className='tabular-nums text-xs text-slate-400'>—</span>;
        }
        return (
          <span className='tabular-nums text-xs'>
            <span className={read ? '' : 'text-slate-400'}>
              {read.toLocaleString()}
            </span>
            {' / '}
            <span className={write ? '' : 'text-slate-400'}>
              {write.toLocaleString()}
            </span>
          </span>
        );
      },
    },
    {
      title: t('消费'),
      dataIndex: 'quota',
      width: 110,
      render: (q) => (
        <span className='font-semibold tabular-nums'>{renderQuota(q, 4)}</span>
      ),
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
          <Tag size='small' color='green' shape='circle'>
            {t('成功')}
          </Tag>
        ) : (
          <Tag size='small' color='red' shape='circle'>
            {t('失败')}
          </Tag>
        ),
    },
  ];

  if (loading && !data) {
    return (
      <div className='py-12 flex justify-center'>
        <Spin size='large' />
      </div>
    );
  }

  const headerControls = (
    <div className='flex items-center gap-2 text-xs text-slate-500'>
      <span>{t('显示失败请求')}</span>
      <Switch
        size='small'
        checked={includeFailures}
        onChange={(v) => {
          setIncludeFailures(v);
          setPage(1);
        }}
      />
    </div>
  );

  if (!loading && !items.length) {
    return (
      <Card className='!rounded-2xl border-0' shadows='hover'>
        <div className='mb-2 text-sm font-medium flex items-center justify-between'>
          <span>{t('明细流水')}</span>
          {headerControls}
        </div>
        <Empty description={t('当前周期无消费记录')} />
      </Card>
    );
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
        {headerControls}
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
