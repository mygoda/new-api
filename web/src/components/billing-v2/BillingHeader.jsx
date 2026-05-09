/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Select, DatePicker, Spin, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

import { API, showError } from '../../helpers';
import { renderQuota } from '../../helpers/render';
import { buildQueryString } from './queryUtils';

const { Text } = Typography;

const PERIODS = [
  { value: 'today', label: '今日' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
  { value: 'month', label: '本月' },
  { value: 'custom', label: '自定义' },
];

/**
 * 顶部:筛选栏 + 4 张总览卡。
 *
 * 筛选支持模糊搜索 + 多选(模型 / 令牌),候选项来自用户最近 30 天用过的内容
 * (走 breakdown 接口取),Select 内置 client-side filter 做模糊匹配。
 *
 * 4 张卡数据来自 /api/billing/v2/overview,filter 变化时自动 refetch。
 */
export default function BillingHeader({ filter, setFilter, queryParams }) {
  const { t } = useTranslation();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);

  // 候选项(用过的模型 / 令牌列表),供 Select 的 optionList
  const [modelOptions, setModelOptions] = useState([]);
  const [tokenOptions, setTokenOptions] = useState([]);

  // 拉一次最近 30 天用过的模型 / 令牌列表作为 Select 候选
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [mRes, tRes] = await Promise.all([
          API.get('/api/billing/v2/breakdown?period=30d&dim=model&top=200'),
          API.get('/api/billing/v2/breakdown?period=30d&dim=token&top=200'),
        ]);
        if (!alive) return;
        const ms = (mRes.data?.data?.items || [])
          .filter((i) => i.key && i.key !== '__others__')
          .map((i) => ({ value: i.label, label: i.label }));
        const ts = (tRes.data?.data?.items || [])
          .filter((i) => i.key && i.key !== '__others__')
          .map((i) => ({ value: i.label, label: i.label || 'default' }));
        setModelOptions(ms);
        setTokenOptions(ts);
      } catch (e) {
        // 不阻塞总览数据加载
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const qs = buildQueryString(queryParams);
        const res = await API.get(`/api/billing/v2/overview?${qs}`);
        if (!alive) return;
        if (res.data?.success) {
          setOverview(res.data.data);
        } else {
          showError(res.data?.message || t('加载账单总览失败'));
        }
      } catch (e) {
        if (alive) showError(e?.message || t('加载账单总览失败'));
      } finally {
        if (alive) setLoading(false);
      }
    };
    fetchData();
    return () => {
      alive = false;
    };
    // 用 JSON 序列化稳定 queryParams object 引用,避免 effect 死循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(queryParams)]);

  // 同比 / 预测计算(避免除以 0)
  const yoyQuota = useMemo(() => {
    if (!overview || !overview.prev_quota) return null;
    return ((overview.current_quota - overview.prev_quota) / overview.prev_quota) * 100;
  }, [overview]);

  const yoyCount = useMemo(() => {
    if (!overview || !overview.prev_request_count) return null;
    return ((overview.request_count - overview.prev_request_count) / overview.prev_request_count) * 100;
  }, [overview]);

  return (
    <div className='space-y-4'>
      {/* 筛选栏 */}
      <Card className='!rounded-2xl border-0' shadows='hover'>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='flex items-center gap-2'>
            <Text type='tertiary' size='small'>{t('时间范围')}</Text>
            <Select
              value={filter.period}
              onChange={(v) => setFilter({ ...filter, period: v })}
              style={{ width: 140 }}
              optionList={PERIODS.map((p) => ({ value: p.value, label: t(p.label) }))}
            />
          </div>
          {filter.period === 'custom' && (
            <div className='flex items-center gap-2'>
              <DatePicker
                type='dateTimeRange'
                size='default'
                onChange={(values) => {
                  if (Array.isArray(values) && values.length === 2 && values[0] && values[1]) {
                    const fmt = (d) => {
                      const pad = (n) => String(n).padStart(2, '0');
                      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                    };
                    setFilter({
                      ...filter,
                      startTime: fmt(values[0]),
                      endTime: fmt(values[1]),
                    });
                  }
                }}
              />
            </div>
          )}
          <div className='flex items-center gap-2 flex-1 min-w-[260px]'>
            <Text type='tertiary' size='small'>{t('模型')}</Text>
            <Select
              multiple
              filter
              maxTagCount={2}
              showRestTagsPopover
              placeholder={t('搜索 / 多选,留空 = 全部')}
              value={filter.modelNames}
              onChange={(v) => setFilter({ ...filter, modelNames: v || [] })}
              optionList={modelOptions}
              emptyContent={
                modelOptions.length === 0 ? t('暂无候选模型') : t('无匹配结果')
              }
              style={{ flex: 1, maxWidth: 360 }}
            />
          </div>
          <div className='flex items-center gap-2 flex-1 min-w-[260px]'>
            <Text type='tertiary' size='small'>{t('令牌')}</Text>
            <Select
              multiple
              filter
              maxTagCount={2}
              showRestTagsPopover
              placeholder={t('搜索 / 多选,留空 = 全部')}
              value={filter.tokenNames}
              onChange={(v) => setFilter({ ...filter, tokenNames: v || [] })}
              optionList={tokenOptions}
              emptyContent={
                tokenOptions.length === 0 ? t('暂无候选令牌') : t('无匹配结果')
              }
              style={{ flex: 1, maxWidth: 360 }}
            />
          </div>
        </div>
      </Card>

      {/* 4 张总览卡 */}
      <Spin spinning={loading} size='middle'>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
          <OverviewCard
            label={t('本期消费')}
            primary={overview ? renderQuota(overview.current_quota, 2) : '—'}
            sub={
              yoyQuota !== null
                ? `${yoyQuota >= 0 ? '↑' : '↓'} ${Math.abs(yoyQuota).toFixed(1)}% ${t('同比')}`
                : t('无对比数据')
            }
            subColor={yoyQuota === null ? 'tertiary' : yoyQuota >= 0 ? 'danger' : 'success'}
          />
          <OverviewCard
            label={t('预测周期末')}
            primary={overview ? renderQuota(overview.estimated_total, 2) : '—'}
            sub={overview?.prev_quota ? `${t('上期')} ${renderQuota(overview.prev_quota, 2)}` : t('暂无预测')}
            subColor='tertiary'
          />
          <OverviewCard
            label={t('当前余额')}
            primary={overview ? renderQuota(overview.balance, 2) : '—'}
            sub={t('钱包额度')}
            subColor='tertiary'
          />
          <OverviewCard
            label={t('调用次数')}
            primary={overview ? Number(overview.request_count).toLocaleString() : '—'}
            sub={
              yoyCount !== null
                ? `${yoyCount >= 0 ? '↑' : '↓'} ${Math.abs(yoyCount).toFixed(1)}% ${t('同比')}`
                : t('无对比数据')
            }
            subColor={yoyCount === null ? 'tertiary' : yoyCount >= 0 ? 'danger' : 'success'}
          />
        </div>
      </Spin>
    </div>
  );
}

function OverviewCard({ label, primary, sub, subColor }) {
  return (
    <Card className='!rounded-2xl border-0' shadows='hover' bodyStyle={{ padding: '16px 20px' }}>
      <div className='text-xs text-slate-500 mb-1'>{label}</div>
      <div className='text-2xl md:text-3xl font-bold tracking-tight tabular-nums'>{primary}</div>
      <div
        className={`text-xs mt-1 ${
          subColor === 'danger'
            ? 'text-rose-500'
            : subColor === 'success'
            ? 'text-emerald-600'
            : 'text-slate-400'
        }`}
      >
        {sub}
      </div>
    </Card>
  );
}
