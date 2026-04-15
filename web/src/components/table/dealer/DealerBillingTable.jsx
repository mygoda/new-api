import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  Empty,
  Tag,
  DatePicker,
  Input,
  Button,
  Space,
  Select,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import CardPro from '../../common/ui/CardPro';
import { useTranslation } from 'react-i18next';
import { API, showError, renderQuota } from '../../../helpers';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers';
import { ITEMS_PER_PAGE } from '../../../constants';

const DealerBillingTable = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [total, setTotal] = useState(0);

  // Filters
  const [modelName, setModelName] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [groupBy, setGroupBy] = useState('');
  const [viewMode, setViewMode] = useState('detail'); // 'detail' or 'summary'

  // Summary data
  const [summaryData, setSummaryData] = useState([]);

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (modelName) params.set('model_name', modelName);
    if (tokenName) params.set('token_name', tokenName);
    if (startTime) params.set('start_time', startTime);
    if (endTime) params.set('end_time', endTime);
    return params.toString();
  };

  const loadRecords = async (page, size) => {
    setLoading(true);
    try {
      const filterStr = buildFilterParams();
      const res = await API.get(
        `/api/dealer/billing?p=${page}&page_size=${size}${filterStr ? '&' + filterStr : ''}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setRecords(data.items || []);
        setTotal(data.total || 0);
        setActivePage(data.page || page);
      } else {
        showError(message);
      }
    } catch (err) {
      showError(t('加载账单失败'));
    }
    setLoading(false);
  };

  const loadSummary = async (page, size, group) => {
    setLoading(true);
    try {
      const filterStr = buildFilterParams();
      const res = await API.get(
        `/api/dealer/billing/summary?p=${page}&page_size=${size}&group_by=${group}${filterStr ? '&' + filterStr : ''}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setSummaryData(data.items || []);
        setTotal(data.total || 0);
        setActivePage(data.page || page);
      } else {
        showError(message);
      }
    } catch (err) {
      showError(t('加载汇总失败'));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRecords(1, pageSize);
  }, []);

  const handleSearch = () => {
    setActivePage(1);
    if (viewMode === 'summary' && groupBy) {
      loadSummary(1, pageSize, groupBy);
    } else {
      loadRecords(1, pageSize);
    }
  };

  const handlePageChange = (page) => {
    setActivePage(page);
    if (viewMode === 'summary' && groupBy) {
      loadSummary(page, pageSize, groupBy);
    } else {
      loadRecords(page, pageSize);
    }
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setActivePage(1);
    if (viewMode === 'summary' && groupBy) {
      loadSummary(1, size, groupBy);
    } else {
      loadRecords(1, size);
    }
  };

  const detailColumns = useMemo(
    () => [
      {
        title: t('时间'),
        dataIndex: 'created_at',
        width: 170,
      },
      {
        title: t('用户ID'),
        dataIndex: 'user_id',
        width: 70,
      },
      {
        title: t('令牌'),
        dataIndex: 'token_name',
        width: 120,
      },
      {
        title: t('模型'),
        dataIndex: 'model_name',
        width: 180,
      },
      {
        title: t('提示tokens'),
        dataIndex: 'prompt_tokens',
        width: 100,
      },
      {
        title: t('补全tokens'),
        dataIndex: 'completion_tokens',
        width: 100,
      },
      {
        title: t('额度'),
        dataIndex: 'quota',
        width: 100,
        render: (val) => renderQuota(val),
      },
      {
        title: t('耗时'),
        dataIndex: 'use_time_ms',
        width: 80,
        render: (val) => (val ? `${val}ms` : '-'),
      },
      {
        title: t('状态'),
        dataIndex: 'is_success',
        width: 70,
        render: (val) =>
          val ? (
            <Tag color='green' shape='circle'>
              {t('成功')}
            </Tag>
          ) : (
            <Tag color='red' shape='circle'>
              {t('失败')}
            </Tag>
          ),
      },
    ],
    [t],
  );

  const summaryColumns = useMemo(
    () => [
      ...(groupBy === 'day'
        ? [{ title: t('日期'), dataIndex: 'date', width: 120 }]
        : []),
      ...(groupBy === 'token'
        ? [
            { title: t('令牌ID'), dataIndex: 'token_id', width: 80 },
            { title: t('令牌名称'), dataIndex: 'token_name', width: 150 },
          ]
        : []),
      ...(groupBy === 'model'
        ? [{ title: t('模型'), dataIndex: 'model_name', width: 200 }]
        : []),
      {
        title: t('请求数'),
        dataIndex: 'request_count',
        width: 100,
      },
      {
        title: t('总额度'),
        dataIndex: 'total_quota',
        width: 120,
        render: (val) => renderQuota(val),
      },
      {
        title: t('提示tokens'),
        dataIndex: 'total_prompt_tokens',
        width: 120,
      },
      {
        title: t('补全tokens'),
        dataIndex: 'total_completion_tokens',
        width: 120,
      },
    ],
    [t, groupBy],
  );

  return (
    <CardPro
      type='type1'
      descriptionArea={
        <span className='font-semibold text-lg'>{t('账单明细')}</span>
      }
      actionsArea={
        <div className='flex flex-col md:flex-row justify-between items-center gap-2 w-full'>
          <Space>
            <Input
              placeholder={t('模型名称')}
              value={modelName}
              onChange={setModelName}
              style={{ width: 150 }}
            />
            <Input
              placeholder={t('令牌名称')}
              value={tokenName}
              onChange={setTokenName}
              style={{ width: 120 }}
            />
            <Select
              placeholder={t('视图')}
              value={viewMode}
              onChange={(val) => {
                setViewMode(val);
                if (val === 'detail') {
                  setGroupBy('');
                } else {
                  setGroupBy('day');
                }
              }}
              style={{ width: 100 }}
            >
              <Select.Option value='detail'>{t('明细')}</Select.Option>
              <Select.Option value='summary'>{t('汇总')}</Select.Option>
            </Select>
            {viewMode === 'summary' && (
              <Select
                value={groupBy}
                onChange={setGroupBy}
                style={{ width: 100 }}
              >
                <Select.Option value='day'>{t('按天')}</Select.Option>
                <Select.Option value='model'>{t('按模型')}</Select.Option>
                <Select.Option value='token'>{t('按令牌')}</Select.Option>
              </Select>
            )}
            <Button onClick={handleSearch}>{t('查询')}</Button>
          </Space>
        </div>
      }
      paginationArea={createCardProPagination({
        currentPage: activePage,
        pageSize: pageSize,
        total: total,
        onPageChange: handlePageChange,
        onPageSizeChange: handlePageSizeChange,
        isMobile: isMobile,
        t: t,
      })}
      t={t}
    >
      <Table
        columns={viewMode === 'summary' ? summaryColumns : detailColumns}
        dataSource={viewMode === 'summary' ? summaryData : records}
        loading={loading}
        rowKey={(record, index) =>
          viewMode === 'summary'
            ? `${record.date || ''}-${record.token_id || ''}-${record.model_name || ''}-${index}`
            : record.request_id || index
        }
        pagination={false}
        empty={
          <Empty
            image={<IllustrationNoResult />}
            darkModeImage={<IllustrationNoResultDark />}
            description={t('暂无数据')}
          />
        }
      />
    </CardPro>
  );
};

export default DealerBillingTable;
