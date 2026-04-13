import { renderQuota } from '../../../helpers';

export const getDetailColumns = (t, isAdminUser) => {
  const cols = [
    {
      title: t('时间'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      fixed: 'left',
    },
    {
      title: t('请求 ID'),
      dataIndex: 'request_id',
      key: 'request_id',
      width: 180,
      ellipsis: true,
    },
    {
      title: t('模型'),
      dataIndex: 'model_name',
      key: 'model_name',
      width: 180,
      ellipsis: true,
    },
    {
      title: t('令牌 ID'),
      dataIndex: 'token_id',
      key: 'token_id',
      width: 80,
      align: 'right',
    },
    {
      title: t('令牌名称'),
      dataIndex: 'token_name',
      key: 'token_name',
      width: 120,
      ellipsis: true,
    },
    {
      title: t('分组'),
      dataIndex: 'using_group',
      key: 'using_group',
      width: 100,
      ellipsis: true,
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
      render: (val) => renderQuota(val, 4),
    },
    {
      title: t('模型倍率'),
      dataIndex: 'model_ratio',
      key: 'model_ratio',
      width: 90,
      align: 'right',
      render: (val) => (val != null ? val.toFixed(2) : '-'),
    },
    {
      title: t('分组倍率'),
      dataIndex: 'group_ratio',
      key: 'group_ratio',
      width: 90,
      align: 'right',
      render: (val) => (val != null ? val.toFixed(2) : '-'),
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
      render: (val) =>
        val ? (
          <span style={{ color: 'var(--semi-color-success)' }}>{t('成功')}</span>
        ) : (
          <span style={{ color: 'var(--semi-color-danger)' }}>{t('失败')}</span>
        ),
    },
  ];

  if (isAdminUser) {
    // Insert user_id after created_at
    const timeIdx = cols.findIndex((c) => c.key === 'created_at');
    cols.splice(timeIdx + 1, 0, {
      title: t('用户 ID'),
      dataIndex: 'user_id',
      key: 'user_id',
      width: 80,
      align: 'right',
    });

    // Insert channel after using_group
    const groupIdx = cols.findIndex((c) => c.key === 'using_group');
    cols.splice(groupIdx + 1, 0, {
      title: t('渠道'),
      dataIndex: 'channel_name',
      key: 'channel_name',
      width: 120,
      ellipsis: true,
    });
  }

  return cols;
};

export const getSummaryColumns = (t, groupBy) => {
  const cols = [];

  switch (groupBy) {
    case 'day':
      cols.push({
        title: t('日期'),
        dataIndex: 'date',
        key: 'date',
        width: 120,
        fixed: 'left',
      });
      break;
    case 'token':
      cols.push(
        {
          title: t('令牌 ID'),
          dataIndex: 'token_id',
          key: 'token_id',
          width: 80,
        },
        {
          title: t('令牌名称'),
          dataIndex: 'token_name',
          key: 'token_name',
          width: 150,
          ellipsis: true,
        }
      );
      break;
    case 'model':
      cols.push({
        title: t('模型'),
        dataIndex: 'model_name',
        key: 'model_name',
        width: 200,
        ellipsis: true,
      });
      break;
  }

  cols.push(
    {
      title: t('请求次数'),
      dataIndex: 'request_count',
      key: 'request_count',
      width: 100,
      align: 'right',
      render: (val) => (val || 0).toLocaleString(),
    },
    {
      title: t('总额度'),
      dataIndex: 'total_quota',
      key: 'total_quota',
      width: 120,
      align: 'right',
      render: (val) => renderQuota(val, 4),
    },
    {
      title: t('输入Token'),
      dataIndex: 'total_prompt_tokens',
      key: 'total_prompt_tokens',
      width: 120,
      align: 'right',
      render: (val) => (val || 0).toLocaleString(),
    },
    {
      title: t('输出Token'),
      dataIndex: 'total_completion_tokens',
      key: 'total_completion_tokens',
      width: 120,
      align: 'right',
      render: (val) => (val || 0).toLocaleString(),
    },
    {
      title: t('总Token'),
      dataIndex: 'total_tokens',
      key: 'total_tokens',
      width: 120,
      align: 'right',
      render: (val) => (val || 0).toLocaleString(),
    }
  );

  return cols;
};
