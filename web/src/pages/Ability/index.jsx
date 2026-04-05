import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  InputNumber,
  Select,
  Input,
  Button,
  Card,
  Space,
  Toast,
  Tag,
  Spin,
  AutoComplete,
} from '@douyinfe/semi-ui';
import { IconSearch, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API } from '../../helpers/api';

const AbilityPage = () => {
  const { t } = useTranslation();
  const [abilities, setAbilities] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // filters
  const [filterModel, setFilterModel] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterChannelId, setFilterChannelId] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  // model list for autocomplete
  const [modelOptions, setModelOptions] = useState([]);

  const loadAbilities = useCallback(async (p, ps, model, group, channelId, keyword) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', p || 1);
      params.set('page_size', ps || 20);
      if (model) params.set('model', model);
      if (group) params.set('group', group);
      if (channelId) params.set('channel_id', channelId);
      if (keyword) params.set('keyword', keyword);

      const res = await API.get(`/api/channel/ability/list?${params.toString()}`);
      const { success, message, data } = res.data;
      if (success) {
        setAbilities(data.items || []);
        setTotal(data.total || 0);
      } else {
        Toast.error(message || t('加载失败'));
      }
    } catch (err) {
      Toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadAbilities(page, pageSize, filterModel, filterGroup, filterChannelId, filterKeyword);
  }, [page, pageSize]);

  // Load distinct models for autocomplete
  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await API.get('/api/channel/models_enabled');
        const { success, data } = res.data;
        if (success && Array.isArray(data)) {
          setModelOptions(data.map((m) => ({ value: m, label: m })));
        }
      } catch {
        // ignore
      }
    };
    loadModels();
  }, []);

  const handleSearch = () => {
    setPage(1);
    loadAbilities(1, pageSize, filterModel, filterGroup, filterChannelId, filterKeyword);
  };

  const handleReset = () => {
    setFilterModel('');
    setFilterGroup('');
    setFilterChannelId('');
    setFilterKeyword('');
    setPage(1);
    loadAbilities(1, pageSize, '', '', '', '');
  };

  const handleUpdateAbility = async (record, field, value) => {
    try {
      const body = {
        group: record.group,
        model: record.model,
        channel_id: record.channel_id,
      };
      if (field === 'priority') {
        body.priority = value;
      } else if (field === 'weight') {
        body.weight = value;
      }
      const res = await API.put('/api/channel/ability', body);
      const { success, message } = res.data;
      if (success) {
        Toast.success(t('更新成功'));
        // update local state
        setAbilities((prev) =>
          prev.map((a) =>
            a.group === record.group && a.model === record.model && a.channel_id === record.channel_id
              ? { ...a, [field]: value }
              : a
          )
        );
      } else {
        Toast.error(message || t('更新失败'));
      }
    } catch {
      Toast.error(t('更新失败'));
    }
  };

  const columns = useMemo(() => [
    {
      title: t('模型'),
      dataIndex: 'model',
      key: 'model',
      width: 240,
      render: (text) => (
        <Tag size='small' color='blue'>{text}</Tag>
      ),
    },
    {
      title: t('分组'),
      dataIndex: 'group',
      key: 'group',
      width: 120,
    },
    {
      title: t('渠道'),
      dataIndex: 'channel_name',
      key: 'channel_name',
      width: 180,
      render: (text, record) => (
        <span>{text || `#${record.channel_id}`}</span>
      ),
    },
    {
      title: t('渠道ID'),
      dataIndex: 'channel_id',
      key: 'channel_id',
      width: 80,
    },
    {
      title: t('状态'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled) => (
        <Tag color={enabled ? 'green' : 'red'} size='small'>
          {enabled ? t('启用') : t('禁用')}
        </Tag>
      ),
    },
    {
      title: t('优先级'),
      dataIndex: 'priority',
      key: 'priority',
      width: 130,
      render: (value, record) => (
        <InputNumber
          size='small'
          value={value || 0}
          min={0}
          style={{ width: 100 }}
          onBlur={(e) => {
            const newVal = parseInt(e.target.value, 10);
            if (!isNaN(newVal) && newVal !== (value || 0)) {
              handleUpdateAbility(record, 'priority', newVal);
            }
          }}
        />
      ),
    },
    {
      title: t('权重'),
      dataIndex: 'weight',
      key: 'weight',
      width: 130,
      render: (value, record) => (
        <InputNumber
          size='small'
          value={value || 0}
          min={0}
          style={{ width: 100 }}
          onBlur={(e) => {
            const newVal = parseInt(e.target.value, 10);
            if (!isNaN(newVal) && newVal !== (value || 0)) {
              handleUpdateAbility(record, 'weight', newVal);
            }
          }}
        />
      ),
    },
    {
      title: t('标签'),
      dataIndex: 'tag',
      key: 'tag',
      width: 120,
      render: (text) => text ? <Tag size='small'>{text}</Tag> : '-',
    },
  ], [t, handleUpdateAbility]);

  return (
    <div className='mt-[60px] px-2'>
      <Card
        title={t('模型渠道配置')}
        bordered={false}
      >
        <div className='mb-4 flex flex-wrap gap-2 items-end'>
          <div>
            <div className='text-xs text-gray-500 mb-1'>{t('模型')}</div>
            <AutoComplete
              data={modelOptions}
              value={filterModel}
              onChange={setFilterModel}
              placeholder={t('选择模型')}
              style={{ width: 220 }}
              showClear
            />
          </div>
          <div>
            <div className='text-xs text-gray-500 mb-1'>{t('分组')}</div>
            <Input
              value={filterGroup}
              onChange={setFilterGroup}
              placeholder={t('分组')}
              style={{ width: 120 }}
              showClear
            />
          </div>
          <div>
            <div className='text-xs text-gray-500 mb-1'>{t('渠道ID')}</div>
            <Input
              value={filterChannelId}
              onChange={setFilterChannelId}
              placeholder={t('渠道ID')}
              style={{ width: 100 }}
              showClear
            />
          </div>
          <div>
            <div className='text-xs text-gray-500 mb-1'>{t('关键词')}</div>
            <Input
              value={filterKeyword}
              onChange={setFilterKeyword}
              placeholder={t('模型或渠道名')}
              style={{ width: 160 }}
              showClear
              onEnterPress={handleSearch}
            />
          </div>
          <Space>
            <Button icon={<IconSearch />} theme='solid' onClick={handleSearch}>
              {t('搜索')}
            </Button>
            <Button icon={<IconRefresh />} onClick={handleReset}>
              {t('重置')}
            </Button>
          </Space>
        </div>

        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={abilities}
            rowKey={(record) => `${record.group}|${record.model}|${record.channel_id}`}
            pagination={{
              currentPage: page,
              pageSize: pageSize,
              total: total,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
              pageSizeOpts: [10, 20, 50, 100],
              showSizeChanger: true,
              showTotal: true,
              formatShowTotal: (total) => `${t('共')} ${total} ${t('条')}`,
            }}
            size='small'
            bordered
            scroll={{ x: 'max-content' }}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default AbilityPage;
