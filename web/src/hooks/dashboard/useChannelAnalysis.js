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

import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../helpers';

export const useChannelAnalysis = (isAdminUser, inputs, dataExportDefaultTime) => {
  const { t } = useTranslation();
  const [channelStats, setChannelStats] = useState([]);
  const [modelPerformanceStats, setModelPerformanceStats] = useState([]);
  const [modelChannelCrossStats, setModelChannelCrossStats] = useState([]);
  const [crossStatsModelFilter, setCrossStatsModelFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const loadChannelStats = useCallback(async () => {
    if (!isAdminUser) return;
    setLoading(true);
    try {
      const { start_timestamp, end_timestamp } = inputs;
      const startTs = Math.floor(Date.parse(start_timestamp) / 1000);
      const endTs = Math.floor(Date.parse(end_timestamp) / 1000);
      const res = await API.get(
        `/api/data/dashboard/channel?start_timestamp=${startTs}&end_timestamp=${endTs}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setChannelStats(data || []);
      } else {
        showError(message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isAdminUser, inputs]);

  const loadModelPerformanceStats = useCallback(async () => {
    if (isAdminUser) return;
    setLoading(true);
    try {
      const { start_timestamp, end_timestamp } = inputs;
      const startTs = Math.floor(Date.parse(start_timestamp) / 1000);
      const endTs = Math.floor(Date.parse(end_timestamp) / 1000);
      const res = await API.get(
        `/api/data/dashboard/model?start_timestamp=${startTs}&end_timestamp=${endTs}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setModelPerformanceStats(data || []);
      } else {
        showError(message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isAdminUser, inputs]);

  const loadModelChannelCrossStats = useCallback(async (modelName) => {
    if (!isAdminUser) return;
    setLoading(true);
    try {
      const { start_timestamp, end_timestamp } = inputs;
      const startTs = Math.floor(Date.parse(start_timestamp) / 1000);
      const endTs = Math.floor(Date.parse(end_timestamp) / 1000);
      let url = `/api/data/dashboard/model_channel?start_timestamp=${startTs}&end_timestamp=${endTs}`;
      if (modelName) {
        url += `&model_name=${encodeURIComponent(modelName)}`;
      }
      const res = await API.get(url);
      const { success, message, data } = res.data;
      if (success) {
        setModelChannelCrossStats(data || []);
      } else {
        showError(message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isAdminUser, inputs]);

  // 延迟对比柱状图（平均延迟）
  const latencyChartSpec = useMemo(() => {
    const data = isAdminUser ? channelStats : modelPerformanceStats;
    const sorted = [...data]
      .filter((item) => (isAdminUser ? item.channel_name : item.model_name))
      .sort((a, b) => b.avg_latency - a.avg_latency)
      .slice(0, 20);

    const nameField = isAdminUser ? 'channel_name' : 'model_name';

    return {
      type: 'bar',
      data: [
        {
          id: 'latencyData',
          values: sorted.map((item) => ({
            Name: item[nameField] || `ID:${item.channel_id}`,
            Latency: Math.round(item.avg_latency * 100) / 100,
          })),
        },
      ],
      direction: 'horizontal',
      xField: 'Latency',
      yField: 'Name',
      title: {
        visible: true,
        text: isAdminUser ? t('渠道延迟对比') : t('模型延迟对比'),
        subtext: `Top ${sorted.length}`,
      },
      bar: {
        style: {
          cornerRadius: [0, 4, 4, 0],
        },
        state: {
          hover: {
            stroke: '#000',
            lineWidth: 1,
          },
        },
      },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum) => datum['Name'],
              value: (datum) => `${datum['Latency']}s`,
            },
          ],
        },
      },
      axes: [
        {
          orient: 'bottom',
          title: { visible: true, text: t('平均延迟') + ' (s)' },
        },
      ],
      color: ['#6366f1'],
    };
  }, [channelStats, modelPerformanceStats, isAdminUser, t]);

  // 延迟分位数对比图（展示 P50/P90/P95）
  const latencyPercentileChartSpec = useMemo(() => {
    const data = isAdminUser ? channelStats : modelPerformanceStats;
    const sorted = [...data]
      .filter((item) => (isAdminUser ? item.channel_name : item.model_name))
      .sort((a, b) => b.latency_p95 - a.latency_p95)
      .slice(0, 15);

    const nameField = isAdminUser ? 'channel_name' : 'model_name';

    return {
      type: 'bar',
      data: [
        {
          id: 'latencyPercentileData',
          values: sorted.flatMap((item) => [
            {
              Name: item[nameField] || `ID:${item.channel_id}`,
              Latency: Math.round(item.latency_p50 * 100) / 100,
              Percentile: 'P50',
            },
            {
              Name: item[nameField] || `ID:${item.channel_id}`,
              Latency: Math.round(item.latency_p90 * 100) / 100,
              Percentile: 'P90',
            },
            {
              Name: item[nameField] || `ID:${item.channel_id}`,
              Latency: Math.round(item.latency_p95 * 100) / 100,
              Percentile: 'P95',
            },
          ]),
        },
      ],
      xField: 'Name',
      yField: 'Latency',
      seriesField: 'Percentile',
      stack: false,
      title: {
        visible: true,
        text: isAdminUser ? t('渠道延迟分位数') : t('模型延迟分位数'),
        subtext: `Top ${sorted.length}`,
      },
      bar: {
        state: {
          hover: {
            stroke: '#000',
            lineWidth: 1,
          },
        },
      },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum) => `${datum['Name']} (${datum['Percentile']})`,
              value: (datum) => `${datum['Latency']}s`,
            },
          ],
        },
      },
      axes: [
        {
          orient: 'bottom',
          label: { visible: true },
        },
        {
          orient: 'left',
          title: { visible: true, text: t('延迟') + ' (s)' },
        },
      ],
      color: ['#10b981', '#f59e0b', '#ef4444'],
      legends: {
        visible: true,
        orient: 'top',
      },
    };
  }, [channelStats, modelPerformanceStats, isAdminUser, t]);

  // 错误率对比图
  const errorRateChartSpec = useMemo(() => {
    const data = isAdminUser ? channelStats : modelPerformanceStats;
    const sorted = [...data]
      .filter(
        (item) =>
          (isAdminUser ? item.channel_name : item.model_name) &&
          item.error_rate > 0,
      )
      .sort((a, b) => b.error_rate - a.error_rate)
      .slice(0, 20);

    const nameField = isAdminUser ? 'channel_name' : 'model_name';

    return {
      type: 'bar',
      data: [
        {
          id: 'errorRateData',
          values: sorted.map((item) => ({
            Name: item[nameField] || `ID:${item.channel_id}`,
            ErrorRate: Math.round(item.error_rate * 10000) / 100,
            color:
              item.error_rate > 0.1
                ? '#ef4444'
                : item.error_rate > 0.05
                  ? '#f59e0b'
                  : '#10b981',
          })),
        },
      ],
      direction: 'horizontal',
      xField: 'ErrorRate',
      yField: 'Name',
      title: {
        visible: true,
        text: isAdminUser ? t('渠道错误率对比') : t('模型错误率对比'),
        subtext: `Top ${sorted.length}`,
      },
      bar: {
        style: {
          fill: (datum) => datum?.color || '#10b981',
          cornerRadius: [0, 4, 4, 0],
        },
        state: {
          hover: {
            stroke: '#000',
            lineWidth: 1,
          },
        },
      },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum) => datum['Name'],
              value: (datum) => `${datum['ErrorRate']}%`,
            },
          ],
        },
      },
      axes: [
        {
          orient: 'bottom',
          title: { visible: true, text: t('错误率') + ' (%)' },
        },
      ],
    };
  }, [channelStats, modelPerformanceStats, isAdminUser, t]);

  // 健康度评分对比图
  const healthScoreChartSpec = useMemo(() => {
    const data = isAdminUser ? channelStats : modelPerformanceStats;
    const sorted = [...data]
      .filter((item) => (isAdminUser ? item.channel_name : item.model_name))
      .sort((a, b) => (b.health_score || 0) - (a.health_score || 0))
      .slice(0, 20);

    const nameField = isAdminUser ? 'channel_name' : 'model_name';

    return {
      type: 'bar',
      data: [
        {
          id: 'healthScoreData',
          values: sorted.map((item) => ({
            Name: item[nameField] || `ID:${item.channel_id}`,
            Score: Math.round(item.health_score || 0),
            color:
              (item.health_score || 0) >= 90
                ? '#10b981'
                : (item.health_score || 0) >= 70
                  ? '#f59e0b'
                  : (item.health_score || 0) >= 50
                    ? '#f97316'
                    : '#ef4444',
          })),
        },
      ],
      direction: 'horizontal',
      xField: 'Score',
      yField: 'Name',
      title: {
        visible: true,
        text: isAdminUser ? t('渠道健康度') : t('模型健康度'),
        subtext: `Top ${sorted.length}`,
      },
      bar: {
        style: {
          fill: (datum) => datum?.color || '#10b981',
          cornerRadius: [0, 4, 4, 0],
        },
        state: {
          hover: {
            stroke: '#000',
            lineWidth: 1,
          },
        },
      },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum) => datum['Name'],
              value: (datum) => `${datum['Score']}`,
            },
          ],
        },
      },
      axes: [
        {
          orient: 'bottom',
          title: { visible: true, text: t('健康度评分') },
          domain: { min: 0, max: 100 },
        },
      ],
    };
  }, [channelStats, modelPerformanceStats, isAdminUser, t]);

  // QPS 对比图
  const qpsChartSpec = useMemo(() => {
    const data = isAdminUser ? channelStats : modelPerformanceStats;
    const sorted = [...data]
      .filter((item) => (isAdminUser ? item.channel_name : item.model_name) && (item.qps || 0) > 0)
      .sort((a, b) => (b.qps || 0) - (a.qps || 0))
      .slice(0, 20);

    const nameField = isAdminUser ? 'channel_name' : 'model_name';

    return {
      type: 'bar',
      data: [
        {
          id: 'qpsData',
          values: sorted.map((item) => ({
            Name: item[nameField] || `ID:${item.channel_id}`,
            QPS: Math.round((item.qps || 0) * 10000) / 10000,
          })),
        },
      ],
      direction: 'horizontal',
      xField: 'QPS',
      yField: 'Name',
      title: {
        visible: true,
        text: isAdminUser ? t('渠道QPS对比') : t('模型QPS对比'),
        subtext: `Top ${sorted.length}`,
      },
      bar: {
        style: {
          cornerRadius: [0, 4, 4, 0],
        },
        state: {
          hover: {
            stroke: '#000',
            lineWidth: 1,
          },
        },
      },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum) => datum['Name'],
              value: (datum) => `${datum['QPS']}`,
            },
          ],
        },
      },
      axes: [
        {
          orient: 'bottom',
          title: { visible: true, text: 'QPS' },
        },
      ],
      color: ['#8b5cf6'],
    };
  }, [channelStats, modelPerformanceStats, isAdminUser, t]);

  return {
    channelStats,
    modelPerformanceStats,
    modelChannelCrossStats,
    crossStatsModelFilter,
    setCrossStatsModelFilter,
    loading,
    loadChannelStats,
    loadModelPerformanceStats,
    loadModelChannelCrossStats,
    latencyChartSpec,
    latencyPercentileChartSpec,
    errorRateChartSpec,
    healthScoreChartSpec,
    qpsChartSpec,
    t,
  };
};
