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

import React, { useMemo } from 'react';
import { Card, Tabs, TabPane, Table, Tag, Empty, Tooltip, AutoComplete } from '@douyinfe/semi-ui';
import { BarChart3 } from 'lucide-react';
import { VChart } from '@visactor/react-vchart';
import { renderQuota } from '../../helpers';

const ERROR_TYPE_LABELS = {
  timeout: '超时',
  rate_limit: '限流',
  auth: '认证',
  quota: '余额',
  server_error: '服务端错误',
  channel_unavailable: '渠道不可用',
  invalid_param: '参数错误',
  network: '网络',
  unknown: '未知',
};

const ChannelAnalysisPanel = ({
  channelStats,
  modelPerformanceStats,
  modelChannelCrossStats,
  crossStatsModelFilter,
  onCrossStatsModelFilterChange,
  loading,
  latencyChartSpec,
  latencyPercentileChartSpec,
  errorRateChartSpec,
  healthScoreChartSpec,
  qpsChartSpec,
  isAdminUser,
  activeTab,
  setActiveTab,
  CARD_PROPS,
  CHART_CONFIG,
  FLEX_CENTER_GAP2,
  t,
}) => {
  const data = isAdminUser ? channelStats : modelPerformanceStats;

  const getErrorRateColor = (rate) => {
    if (rate > 0.1) return 'red';
    if (rate > 0.05) return 'orange';
    if (rate > 0) return 'yellow';
    return 'green';
  };

  const getHealthScoreColor = (score) => {
    if (score >= 90) return 'green';
    if (score >= 70) return 'yellow';
    if (score >= 50) return 'orange';
    return 'red';
  };

  const channelColumns = [
    {
      title: t('渠道名称'),
      dataIndex: 'channel_name',
      sorter: (a, b) => (a.channel_name || '').localeCompare(b.channel_name || ''),
      render: (text, record) => text || `ID:${record.channel_id}`,
    },
    {
      title: t('健康度'),
      dataIndex: 'health_score',
      sorter: (a, b) => (a.health_score || 0) - (b.health_score || 0),
      render: (val) => (
        <Tag color={getHealthScoreColor(val || 0)} size='small'>
          {(val || 0).toFixed(0)}
        </Tag>
      ),
    },
    {
      title: t('可用率'),
      dataIndex: 'availability',
      sorter: (a, b) => (a.availability || 0) - (b.availability || 0),
      render: (val) => `${((val || 0) * 100).toFixed(1)}%`,
    },
    {
      title: t('请求次数'),
      dataIndex: 'total_requests',
      sorter: (a, b) => a.total_requests - b.total_requests,
      render: (text) => (text || 0).toLocaleString(),
    },
    {
      title: t('QPS'),
      dataIndex: 'qps',
      sorter: (a, b) => (a.qps || 0) - (b.qps || 0),
      render: (val) => (val || 0).toFixed(4),
    },
    {
      title: t('TPM'),
      dataIndex: 'tpm',
      sorter: (a, b) => (a.tpm || 0) - (b.tpm || 0),
      render: (val) => (val || 0).toFixed(2),
    },
    {
      title: t('错误次数'),
      dataIndex: 'error_requests',
      sorter: (a, b) => a.error_requests - b.error_requests,
      render: (text) => (text || 0).toLocaleString(),
    },
    {
      title: t('错误率'),
      dataIndex: 'error_rate',
      sorter: (a, b) => a.error_rate - b.error_rate,
      render: (val) => (
        <Tag color={getErrorRateColor(val)} size='small'>
          {(val * 100).toFixed(2)}%
        </Tag>
      ),
    },
    {
      title: t('平均延迟'),
      dataIndex: 'avg_latency',
      sorter: (a, b) => a.avg_latency - b.avg_latency,
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: 'P50',
      dataIndex: 'latency_p50',
      sorter: (a, b) => (a.latency_p50 || 0) - (b.latency_p50 || 0),
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: 'P90',
      dataIndex: 'latency_p90',
      sorter: (a, b) => (a.latency_p90 || 0) - (b.latency_p90 || 0),
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: 'P95',
      dataIndex: 'latency_p95',
      sorter: (a, b) => (a.latency_p95 || 0) - (b.latency_p95 || 0),
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: t('最大延迟'),
      dataIndex: 'max_latency',
      sorter: (a, b) => a.max_latency - b.max_latency,
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: t('Stream占比'),
      dataIndex: 'stream_ratio',
      sorter: (a, b) => (a.stream_ratio || 0) - (b.stream_ratio || 0),
      render: (val) => `${((val || 0) * 100).toFixed(1)}%`,
    },
    {
      title: t('每请求Tokens'),
      dataIndex: 'avg_tokens_per_request',
      sorter: (a, b) => (a.avg_tokens_per_request || 0) - (b.avg_tokens_per_request || 0),
      render: (val) => (val || 0).toFixed(1),
    },
    {
      title: t('消耗额度'),
      dataIndex: 'total_quota',
      sorter: (a, b) => a.total_quota - b.total_quota,
      render: (val) => renderQuota(val || 0, 2),
    },
    {
      title: t('总Tokens'),
      dataIndex: 'total_tokens',
      sorter: (a, b) => a.total_tokens - b.total_tokens,
      render: (text) => (text || 0).toLocaleString(),
    },
    {
      title: t('连续失败'),
      dataIndex: 'consecutive_failures',
      sorter: (a, b) => (a.consecutive_failures || 0) - (b.consecutive_failures || 0),
      render: (val) => {
        if (!val || val === 0) return '-';
        return (
          <Tag color={val > 10 ? 'red' : val > 5 ? 'orange' : 'yellow'} size='small'>
            {val}
          </Tag>
        );
      },
    },
    {
      title: t('错误分布'),
      dataIndex: 'error_breakdown',
      render: (breakdown) => {
        if (!breakdown || Object.keys(breakdown).length === 0) return '-';
        const content = Object.entries(breakdown)
          .map(([type, count]) => `${ERROR_TYPE_LABELS[type] || type}: ${count}`)
          .join(', ');
        return (
          <Tooltip content={content}>
            <Tag size='small'>{Object.keys(breakdown).length} 种</Tag>
          </Tooltip>
        );
      },
    },
  ];

  const modelColumns = [
    {
      title: t('模型名称'),
      dataIndex: 'model_name',
      sorter: (a, b) => (a.model_name || '').localeCompare(b.model_name || ''),
    },
    {
      title: t('请求次数'),
      dataIndex: 'total_requests',
      sorter: (a, b) => a.total_requests - b.total_requests,
      render: (text) => (text || 0).toLocaleString(),
    },
    {
      title: t('错误次数'),
      dataIndex: 'error_requests',
      sorter: (a, b) => a.error_requests - b.error_requests,
      render: (text) => (text || 0).toLocaleString(),
    },
    {
      title: t('错误率'),
      dataIndex: 'error_rate',
      sorter: (a, b) => a.error_rate - b.error_rate,
      render: (val) => (
        <Tag color={getErrorRateColor(val)} size='small'>
          {(val * 100).toFixed(2)}%
        </Tag>
      ),
    },
    {
      title: t('平均延迟'),
      dataIndex: 'avg_latency',
      sorter: (a, b) => a.avg_latency - b.avg_latency,
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: 'P50',
      dataIndex: 'latency_p50',
      sorter: (a, b) => (a.latency_p50 || 0) - (b.latency_p50 || 0),
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: 'P90',
      dataIndex: 'latency_p90',
      sorter: (a, b) => (a.latency_p90 || 0) - (b.latency_p90 || 0),
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: 'P95',
      dataIndex: 'latency_p95',
      sorter: (a, b) => (a.latency_p95 || 0) - (b.latency_p95 || 0),
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: t('最大延迟'),
      dataIndex: 'max_latency',
      sorter: (a, b) => a.max_latency - b.max_latency,
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: t('每请求Tokens'),
      dataIndex: 'avg_tokens_per_request',
      sorter: (a, b) => (a.avg_tokens_per_request || 0) - (b.avg_tokens_per_request || 0),
      render: (val) => (val || 0).toFixed(1),
    },
    {
      title: t('总Tokens'),
      dataIndex: 'total_tokens',
      sorter: (a, b) => a.total_tokens - b.total_tokens,
      render: (text) => (text || 0).toLocaleString(),
    },
  ];

  const crossColumns = [
    {
      title: t('模型'),
      dataIndex: 'model_name',
      sorter: (a, b) => (a.model_name || '').localeCompare(b.model_name || ''),
      render: (text) => <Tag size='small' color='blue'>{text}</Tag>,
    },
    {
      title: t('渠道'),
      dataIndex: 'channel_name',
      sorter: (a, b) => (a.channel_name || '').localeCompare(b.channel_name || ''),
      render: (text, record) => text || `ID:${record.channel_id}`,
    },
    {
      title: t('请求次数'),
      dataIndex: 'total_requests',
      sorter: (a, b) => a.total_requests - b.total_requests,
      render: (text) => (text || 0).toLocaleString(),
    },
    {
      title: t('错误次数'),
      dataIndex: 'error_requests',
      sorter: (a, b) => a.error_requests - b.error_requests,
      render: (text) => (text || 0).toLocaleString(),
    },
    {
      title: t('错误率'),
      dataIndex: 'error_rate',
      sorter: (a, b) => a.error_rate - b.error_rate,
      render: (val) => (
        <Tag color={getErrorRateColor(val)} size='small'>
          {(val * 100).toFixed(2)}%
        </Tag>
      ),
    },
    {
      title: t('平均延迟'),
      dataIndex: 'avg_latency',
      sorter: (a, b) => a.avg_latency - b.avg_latency,
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: 'P50',
      dataIndex: 'latency_p50',
      sorter: (a, b) => (a.latency_p50 || 0) - (b.latency_p50 || 0),
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: 'P90',
      dataIndex: 'latency_p90',
      sorter: (a, b) => (a.latency_p90 || 0) - (b.latency_p90 || 0),
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: 'P95',
      dataIndex: 'latency_p95',
      sorter: (a, b) => (a.latency_p95 || 0) - (b.latency_p95 || 0),
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: t('最大延迟'),
      dataIndex: 'max_latency',
      sorter: (a, b) => a.max_latency - b.max_latency,
      render: (val) => `${(val || 0).toFixed(2)}s`,
    },
    {
      title: t('Stream占比'),
      dataIndex: 'stream_ratio',
      sorter: (a, b) => (a.stream_ratio || 0) - (b.stream_ratio || 0),
      render: (val) => `${((val || 0) * 100).toFixed(1)}%`,
    },
    {
      title: t('每请求Tokens'),
      dataIndex: 'avg_tokens_per_request',
      sorter: (a, b) => (a.avg_tokens_per_request || 0) - (b.avg_tokens_per_request || 0),
      render: (val) => (val || 0).toFixed(1),
    },
    {
      title: t('消耗额度'),
      dataIndex: 'total_quota',
      sorter: (a, b) => a.total_quota - b.total_quota,
      render: (val) => renderQuota(val || 0, 2),
    },
    {
      title: t('总Tokens'),
      dataIndex: 'total_tokens',
      sorter: (a, b) => a.total_tokens - b.total_tokens,
      render: (text) => (text || 0).toLocaleString(),
    },
  ];

  // Extract unique model names for the cross-stats filter
  const crossStatsModelOptions = useMemo(() => {
    if (!modelChannelCrossStats || modelChannelCrossStats.length === 0) return [];
    const models = [...new Set(modelChannelCrossStats.map((s) => s.model_name).filter(Boolean))];
    return models.sort().map((m) => ({ value: m, label: m }));
  }, [modelChannelCrossStats]);

  const columns = isAdminUser ? channelColumns : modelColumns;
  const panelTitle = isAdminUser ? t('渠道分析') : t('模型性能分析');
  const tableTabTitle = isAdminUser ? t('渠道性能') : t('模型性能');

  return (
    <Card
      {...CARD_PROPS}
      className='!rounded-2xl'
      title={
        <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between w-full gap-3'>
          <div className={FLEX_CENTER_GAP2}>
            <BarChart3 size={16} />
            {panelTitle}
          </div>
          <Tabs
            type='slash'
            activeKey={activeTab}
            onChange={setActiveTab}
          >
            <TabPane tab={<span>{tableTabTitle}</span>} itemKey='1' />
            <TabPane tab={<span>{t('延迟对比')}</span>} itemKey='2' />
            <TabPane tab={<span>{t('延迟分位数')}</span>} itemKey='6' />
            <TabPane tab={<span>{t('错误率对比')}</span>} itemKey='3' />
            <TabPane tab={<span>{t('健康度')}</span>} itemKey='4' />
            <TabPane tab={<span>{t('QPS对比')}</span>} itemKey='5' />
            {isAdminUser && (
              <TabPane tab={<span>{t('模型渠道交叉分析')}</span>} itemKey='7' />
            )}
          </Tabs>
        </div>
      }
      bodyStyle={{ padding: 0 }}
    >
      {activeTab === '1' && (
        <div className='p-2'>
          {data.length > 0 ? (
            <Table
              columns={columns}
              dataSource={data}
              rowKey={isAdminUser ? 'channel_id' : 'model_name'}
              pagination={data.length > 10 ? { pageSize: 10 } : false}
              size='small'
              loading={loading}
            />
          ) : (
            <Empty
              title={isAdminUser ? t('无渠道数据') : t('无模型数据')}
              style={{ padding: 40 }}
            />
          )}
        </div>
      )}
      {activeTab === '2' && (
        <div className='h-96 p-2'>
          {latencyChartSpec.data[0].values.length > 0 ? (
            <VChart spec={latencyChartSpec} option={CHART_CONFIG} />
          ) : (
            <Empty title={t('无数据')} style={{ padding: 40 }} />
          )}
        </div>
      )}
      {activeTab === '3' && (
        <div className='h-96 p-2'>
          {errorRateChartSpec.data[0].values.length > 0 ? (
            <VChart spec={errorRateChartSpec} option={CHART_CONFIG} />
          ) : (
            <Empty title={t('无数据')} style={{ padding: 40 }} />
          )}
        </div>
      )}
      {activeTab === '4' && (
        <div className='h-96 p-2'>
          {healthScoreChartSpec.data[0].values.length > 0 ? (
            <VChart spec={healthScoreChartSpec} option={CHART_CONFIG} />
          ) : (
            <Empty title={t('无数据')} style={{ padding: 40 }} />
          )}
        </div>
      )}
      {activeTab === '5' && (
        <div className='h-96 p-2'>
          {qpsChartSpec.data[0].values.length > 0 ? (
            <VChart spec={qpsChartSpec} option={CHART_CONFIG} />
          ) : (
            <Empty title={t('无数据')} style={{ padding: 40 }} />
          )}
        </div>
      )}
      {activeTab === '6' && (
        <div className='h-96 p-2'>
          {latencyPercentileChartSpec.data[0].values.length > 0 ? (
            <VChart spec={latencyPercentileChartSpec} option={CHART_CONFIG} />
          ) : (
            <Empty title={t('无数据')} style={{ padding: 40 }} />
          )}
        </div>
      )}
      {activeTab === '7' && isAdminUser && (
        <div className='p-2'>
          <div className='mb-3'>
            <AutoComplete
              data={crossStatsModelOptions}
              value={crossStatsModelFilter || ''}
              onChange={(val) => onCrossStatsModelFilterChange && onCrossStatsModelFilterChange(val)}
              placeholder={t('输入模型名筛选')}
              style={{ width: 280 }}
              showClear
            />
          </div>
          {modelChannelCrossStats && modelChannelCrossStats.length > 0 ? (
            <Table
              columns={crossColumns}
              dataSource={modelChannelCrossStats}
              rowKey={(record) => `${record.model_name}_${record.channel_id}`}
              pagination={modelChannelCrossStats.length > 10 ? { pageSize: 10 } : false}
              size='small'
              loading={loading}
            />
          ) : (
            <Empty
              title={t('无数据')}
              style={{ padding: 40 }}
            />
          )}
        </div>
      )}
    </Card>
  );
};

export default ChannelAnalysisPanel;
