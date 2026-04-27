/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  DatePicker,
  Empty,
  Spin,
  Button,
  Tag,
} from '@douyinfe/semi-ui';
import { BarChart3, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { VChart } from '@visactor/react-vchart';

import { useTokenAnalysis } from '../../hooks/dashboard/useTokenAnalysis';
import { renderNumber } from '../../helpers';

const DAY_SECONDS = 86400;

// 把 unix epoch 转成 "M/D" 显示标签，使用浏览器本地时区
const formatDay = (epoch) => {
  const d = new Date(epoch * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 一个 token 对应一张图的 spec
const buildSpec = (group, t) => {
  const valuesByKey = new Map();
  for (const r of group.rows) {
    const key = `${r.day_epoch}__${r.model_name || '(unknown)'}`;
    valuesByKey.set(key, (valuesByKey.get(key) || 0) + (Number(r.total_tokens) || 0));
  }

  // 全部 (day, model_name) 对，给空格补 0 让所有日期都出现在 X 轴
  const modelSet = new Set(group.rows.map((r) => r.model_name || '(unknown)'));
  const values = [];
  for (const day of group.dayLabels) {
    for (const m of modelSet) {
      const key = `${day}__${m}`;
      values.push({
        date: formatDay(day),
        model: m,
        tokens: valuesByKey.get(key) || 0,
      });
    }
  }

  return {
    type: 'bar',
    data: [{ id: 'tokenDaily', values }],
    xField: 'date',
    yField: 'tokens',
    seriesField: 'model',
    stack: true,
    bar: {
      style: { cornerRadius: [3, 3, 0, 0] },
    },
    legend: {
      visible: true,
      position: 'bottom',
      orient: 'bottom',
    },
    tooltip: {
      mark: {
        content: [
          { key: (datum) => datum['model'], value: (datum) => renderNumber(datum['tokens']) + ' tokens' },
        ],
      },
      dimension: {
        title: { value: (datum) => datum?.[0]?.['date'] },
        content: [
          { key: (datum) => datum['model'], value: (datum) => renderNumber(datum['tokens']) },
        ],
      },
    },
    axes: [
      { orient: 'bottom', type: 'band' },
      { orient: 'left', type: 'linear', title: { visible: true, text: t('Tokens') } },
    ],
  };
};

const TokenAnalysisPanel = ({
  isAdminUser,
  CARD_PROPS,
  CHART_CONFIG,
  FLEX_CENTER_GAP2,
  t,
}) => {
  const { range, setRange, maxDays, tokenGroups, load, loading } =
    useTokenAnalysis(isAdminUser);

  // 默认收起，避免每次进数据看板都自动请求后端
  const [expanded, setExpanded] = useState(false);

  // 仅在展开后拉取；展开后调整 range 也会通过 load 引用变化触发重新加载
  useEffect(() => {
    if (expanded) {
      load();
    }
  }, [expanded, load]);

  // Semi DatePicker 的 value 用毫秒时间戳数组
  const pickerValue = useMemo(
    () => [range.start * 1000, range.end * 1000],
    [range.start, range.end],
  );

  const handleRangeChange = (value) => {
    if (!Array.isArray(value) || value.length !== 2 || !value[0] || !value[1]) return;
    const startMs = value[0] instanceof Date ? value[0].getTime() : new Date(value[0]).getTime();
    const endMs = value[1] instanceof Date ? value[1].getTime() : new Date(value[1]).getTime();
    setRange({
      start: Math.floor(startMs / 1000),
      end: Math.floor(endMs / 1000),
    });
  };

  // 限制可选日期：今天往前 maxDays 天
  const disabledDate = (date) => {
    if (!date) return false;
    const ts = date.getTime();
    const now = Date.now();
    const min = now - maxDays * DAY_SECONDS * 1000;
    return ts > now || ts < min;
  };

  return (
    <Card
      {...CARD_PROPS}
      title={
        <div className='flex items-center justify-between w-full flex-wrap gap-2'>
          <div
            className={`${FLEX_CENTER_GAP2} cursor-pointer select-none`}
            onClick={() => setExpanded((v) => !v)}
            role='button'
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <BarChart3 size={18} />
            <span>{t('令牌统计')}</span>
            <Tag size='small' color='light-blue'>
              {t('最近 {{n}} 天', { n: maxDays })}
            </Tag>
            {!expanded && (
              <span className='text-gray-400 text-xs'>{t('点击展开')}</span>
            )}
          </div>
          {expanded && (
            <div className='flex items-center gap-2'>
              <DatePicker
                type='dateRange'
                value={pickerValue}
                onChange={handleRangeChange}
                disabledDate={disabledDate}
                size='small'
                style={{ width: 240 }}
              />
              <Button
                icon={<RefreshCw size={14} />}
                size='small'
                onClick={load}
                loading={loading}
              >
                {t('刷新')}
              </Button>
            </div>
          )}
        </div>
      }
      bodyStyle={{ padding: expanded ? 12 : 0 }}
    >
      {expanded && (
        loading && tokenGroups.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Spin size='large' />
          </div>
        ) : tokenGroups.length === 0 ? (
          <Empty title={t('无令牌使用数据')} style={{ padding: 40 }} />
        ) : (
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
            {tokenGroups.map((g) => (
              <Card
                key={g.tokenId}
                shadows=''
                bordered
                headerLine
                title={
                  <div className='flex items-center justify-between w-full'>
                    <div className={FLEX_CENTER_GAP2}>
                      <span className='font-medium'>{g.tokenName}</span>
                      <span className='text-gray-400 text-xs'>{`ID:${g.tokenId}`}</span>
                    </div>
                    <Tag size='small' color='blue'>
                      {renderNumber(g.totalTokens)} tokens
                    </Tag>
                  </div>
                }
                bodyStyle={{ padding: 4 }}
              >
                <div style={{ height: 280 }}>
                  <VChart spec={buildSpec(g, t)} option={CHART_CONFIG} />
                </div>
              </Card>
            ))}
          </div>
        )
      )}
    </Card>
  );
};

export default TokenAnalysisPanel;
