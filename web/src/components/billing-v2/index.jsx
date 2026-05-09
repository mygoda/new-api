/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

import BillingHeader from './BillingHeader';
import ByModelTab from './tabs/ByModelTab';
import ByVendorTab from './tabs/ByVendorTab';
import ByTimeTab from './tabs/ByTimeTab';
import ByTokenTab from './tabs/ByTokenTab';
import AnomaliesTab from './tabs/AnomaliesTab';
import DetailsTab from './tabs/DetailsTab';

/**
 * 账单 v2 主页面。
 *
 * 顶部:全局筛选(period / model / token)+ 4 张总览卡
 * 主体:6 个 Tab 共享同一份 filter,切换 Tab 不丢筛选
 *
 * 数据源全部走 /api/billing/v2/*,后端已严格 strip channel 字段。
 * 前端永远不应该拿到也不应该展示 channel_id / channel_name 等。
 */
export default function BillingV2Page() {
  const { t } = useTranslation();

  // 全局筛选状态(period + 模型 + 令牌),所有 Tab 共享。
  // modelNames / tokenNames 为多选数组,空数组 = 不筛。
  const [filter, setFilter] = useState({
    period: 'month', // month | today | 7d | 30d | custom
    startTime: '',
    endTime: '',
    modelNames: [],
    tokenNames: [],
  });

  const [activeTab, setActiveTab] = useState('model');

  // 从 URL 读初始 tab(刷新保留状态)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t && ['model', 'vendor', 'time', 'token', 'anomaly', 'detail'].includes(t)) {
      setActiveTab(t);
    }
  }, []);

  const onTabChange = (key) => {
    setActiveTab(key);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', key);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  };

  // 共享给所有 Tab 的 query params(plain object,数组字段在 fetch 时序列化为
  // 重复参数 ?model_name=a&model_name=b)。useMemo 让引用稳定,Tab 内部
  // 用 JSON.stringify 做 useEffect 依赖。
  const queryParams = useMemo(() => {
    const p = { period: filter.period };
    if (filter.period === 'custom' && filter.startTime && filter.endTime) {
      p.start_time = filter.startTime;
      p.end_time = filter.endTime;
    }
    if (filter.modelNames && filter.modelNames.length > 0) {
      p.model_name = filter.modelNames;
    }
    if (filter.tokenNames && filter.tokenNames.length > 0) {
      p.token_name = filter.tokenNames;
    }
    return p;
  }, [filter]);

  return (
    <div className='p-4 md:p-6 space-y-4 md:space-y-6'>
      <BillingHeader filter={filter} setFilter={setFilter} queryParams={queryParams} />

      <Tabs
        type='card'
        activeKey={activeTab}
        onChange={onTabChange}
        keepDOM={false}
      >
        <Tabs.TabPane tab={t('按模型')} itemKey='model'>
          <ByModelTab queryParams={queryParams} />
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('按厂商')} itemKey='vendor'>
          <ByVendorTab queryParams={queryParams} />
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('按时间')} itemKey='time'>
          <ByTimeTab queryParams={queryParams} />
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('按令牌')} itemKey='token'>
          <ByTokenTab queryParams={queryParams} />
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('异常请求')} itemKey='anomaly'>
          <AnomaliesTab queryParams={queryParams} />
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('流水明细')} itemKey='detail'>
          <DetailsTab queryParams={queryParams} />
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
}
