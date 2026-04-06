import React, { useMemo, useState, useCallback } from 'react';
import { Empty, Tag, Button, Descriptions, Spin } from '@douyinfe/semi-ui';
import CardTable from '../../common/ui/CardTable';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { renderQuota } from '../../../helpers';
import { API } from '../../../helpers/api';

const RequestLogsTable = (logsData) => {
  const {
    logs,
    loading,
    activePage,
    pageSize,
    logCount,
    handlePageChange,
    handlePageSizeChange,
    copyText,
    showDetail,
    isAdminUser,
    t,
  } = logsData;

  // 缓存已加载的详情数据（request_body / response_content）
  const [detailCache, setDetailCache] = useState({});
  const [detailLoading, setDetailLoading] = useState({});

  const fetchDetail = useCallback(async (requestId) => {
    if (detailCache[requestId] || detailLoading[requestId]) return;
    setDetailLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      const endpoint = isAdminUser
        ? '/api/log/doris/detail'
        : '/api/log/doris/detail/self';
      const res = await API.get(`${endpoint}?request_id=${encodeURIComponent(requestId)}`);
      const { success, data } = res.data;
      if (success && data) {
        setDetailCache((prev) => ({
          ...prev,
          [requestId]: {
            request_body: data.request_body || '',
            response_content: data.response_content || '',
          },
        }));
      }
    } catch {
      // ignore
    } finally {
      setDetailLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  }, [isAdminUser, detailCache, detailLoading]);

  const columns = useMemo(() => {
    const cols = [
      {
        title: t('时间'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 160,
        fixed: 'left',
        render: (text) => text || '-',
      },
      {
        title: t('请求 ID'),
        dataIndex: 'request_id',
        key: 'request_id',
        width: 200,
        render: (text) => (
          <span
            className='cursor-pointer text-blue-500 hover:underline'
            onClick={(e) => copyText(e, text)}
            title={text}
          >
            {text ? text.substring(0, 16) + '...' : '-'}
          </span>
        ),
      },
      {
        title: t('模型'),
        dataIndex: 'model_name',
        key: 'model_name',
        width: 180,
        ellipsis: true,
      },
      {
        title: t('令牌名称'),
        dataIndex: 'token_name',
        key: 'token_name',
        width: 120,
        ellipsis: true,
      },
      {
        title: t('流式'),
        dataIndex: 'is_stream',
        key: 'is_stream',
        width: 60,
        align: 'center',
        render: (val) => (val ? t('是') : t('否')),
      },
      {
        title: t('输入'),
        dataIndex: 'prompt_tokens',
        key: 'prompt_tokens',
        width: 80,
        align: 'right',
        render: (val) => (val || 0).toLocaleString(),
      },
      {
        title: t('输出'),
        dataIndex: 'completion_tokens',
        key: 'completion_tokens',
        width: 80,
        align: 'right',
        render: (val) => (val || 0).toLocaleString(),
      },
      {
        title: t('总计'),
        dataIndex: 'total_tokens',
        key: 'total_tokens',
        width: 80,
        align: 'right',
        render: (val) => (val || 0).toLocaleString(),
      },
      {
        title: t('额度'),
        dataIndex: 'quota',
        key: 'quota',
        width: 100,
        align: 'right',
        render: (val) => renderQuota(val || 0, 4),
      },
      {
        title: t('耗时'),
        dataIndex: 'use_time_ms',
        key: 'use_time_ms',
        width: 80,
        align: 'right',
        render: (val) => {
          if (!val) return '-';
          if (val < 1000) return `${val}ms`;
          return `${(val / 1000).toFixed(1)}s`;
        },
      },
      {
        title: t('状态'),
        dataIndex: 'is_success',
        key: 'is_success',
        width: 70,
        align: 'center',
        render: (val) => (
          <Tag color={val ? 'green' : 'red'} size='small'>
            {val ? t('成功') : t('失败')}
          </Tag>
        ),
      },
    ];

    if (isAdminUser) {
      cols.splice(3, 0, {
        title: t('上游模型'),
        dataIndex: 'upstream_model',
        key: 'upstream_model',
        width: 180,
        ellipsis: true,
      });
      cols.splice(4, 0, {
        title: t('渠道'),
        dataIndex: 'channel_name',
        key: 'channel_name',
        width: 120,
        render: (text, record) =>
          record.channel_id
            ? `${record.channel_id} - ${text || ''}`
            : '-',
      });
      cols.splice(7, 0, {
        title: t('客户端 IP'),
        dataIndex: 'client_ip',
        key: 'client_ip',
        width: 130,
      });
    }

    return cols;
  }, [isAdminUser, t, copyText, showDetail]);

  const expandRowRender = (record) => {
    const expandItems = [];

    if (record.request_path) {
      expandItems.push({ key: t('请求路径'), value: record.request_path });
    }
    if (record.user_group) {
      expandItems.push({ key: t('用户分组'), value: record.user_group });
    }
    if (record.using_group) {
      expandItems.push({ key: t('使用分组'), value: record.using_group });
    }
    if (record.cache_tokens > 0) {
      expandItems.push({ key: t('缓存 Tokens'), value: record.cache_tokens });
    }
    if (record.retry_count > 0) {
      expandItems.push({ key: t('重试次数'), value: record.retry_count });
    }
    if (record.status_code) {
      expandItems.push({ key: t('HTTP 状态码'), value: record.status_code });
    }
    if (record.error_type) {
      expandItems.push({ key: t('错误类型'), value: record.error_type });
    }
    if (record.error_message) {
      expandItems.push({ key: t('错误消息'), value: record.error_message });
    }

    // 大字段通过详情 API 按需加载
    const detail = detailCache[record.request_id];
    const isLoading = detailLoading[record.request_id];

    if (detail) {
      if (detail.request_body) {
        expandItems.push({
          key: t('请求体'),
          value: (
            <Button size='small' type='tertiary' onClick={() => showDetail(t('请求体'), detail.request_body)}>
              {t('查看详情')}
            </Button>
          ),
        });
      }
      if (detail.response_content) {
        expandItems.push({
          key: t('响应内容'),
          value: (
            <Button size='small' type='tertiary' onClick={() => showDetail(t('响应内容'), detail.response_content)}>
              {t('查看详情')}
            </Button>
          ),
        });
      }
    } else {
      expandItems.push({
        key: t('请求体') + ' / ' + t('响应内容'),
        value: isLoading ? (
          <Spin size='small' />
        ) : (
          <Button size='small' type='tertiary' onClick={() => fetchDetail(record.request_id)}>
            {t('加载详情')}
          </Button>
        ),
      });
    }

    return <Descriptions data={expandItems} />;
  };

  return (
    <CardTable
      columns={columns}
      expandedRowRender={expandRowRender}
      expandRowByClick={true}
      dataSource={logs}
      rowKey='key'
      loading={loading}
      scroll={{ x: 'max-content' }}
      className='rounded-xl overflow-hidden'
      size='small'
      empty={
        <Empty
          image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
          darkModeImage={
            <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
          }
          description={t('搜索无结果')}
          style={{ padding: 30 }}
        />
      }
      pagination={{
        currentPage: activePage,
        pageSize: pageSize,
        total: logCount,
        pageSizeOptions: [10, 20, 50, 100],
        showSizeChanger: true,
        onPageSizeChange: (size) => handlePageSizeChange(size),
        onPageChange: handlePageChange,
      }}
      hidePagination={true}
    />
  );
};

export default RequestLogsTable;
