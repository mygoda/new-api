import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  InputNumber,
  Input,
  Select,
  Button,
  Card,
  Space,
  Toast,
  Tag,
  Spin,
  Modal,
  SideSheet,
  Popconfirm,
  Typography,
  Descriptions,
} from '@douyinfe/semi-ui';
import {
  IconSearch,
  IconRefresh,
  IconPause,
  IconPlay,
  IconRefresh2,
  IconEdit,
  IconHistory,
  IconDelete,
} from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API } from '../../helpers/api';

const { Text } = Typography;

const STATUS_META = {
  1: { color: 'blue', label: '运行中' },
  2: { color: 'grey', label: '已暂停' },
  3: { color: 'green', label: '已恢复' },
  4: { color: 'red', label: '已终止' },
};

const STATUS_OPTIONS = [
  { value: 0, label: '全部状态' },
  { value: 1, label: '运行中' },
  { value: 2, label: '已暂停' },
  { value: 3, label: '已恢复' },
  { value: 4, label: '已终止' },
];

function formatTs(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

const HeartbeatPage = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [filterStatus, setFilterStatus] = useState(0);
  const [filterChannelId, setFilterChannelId] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const [editing, setEditing] = useState(null);
  const [editThreshold, setEditThreshold] = useState(0);
  const [editInterval, setEditInterval] = useState(0);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);

  const load = useCallback(async (p, ps, status, channelId, model, keyword) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', p || 1);
      params.set('page_size', ps || 20);
      if (status) params.set('status', status);
      if (channelId) params.set('channel_id', channelId);
      if (model) params.set('model', model);
      if (keyword) params.set('keyword', keyword);
      const res = await API.get(`/api/channel/heartbeat?${params.toString()}`);
      const { success, message, data } = res.data;
      if (success) {
        setItems(data.items || []);
        setTotal(data.total || 0);
      } else {
        Toast.error(message || t('加载失败'));
      }
    } catch {
      Toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load(page, pageSize, filterStatus, filterChannelId, filterModel, filterKeyword);
  }, [page, pageSize]);

  const handleSearch = () => {
    setPage(1);
    load(1, pageSize, filterStatus, filterChannelId, filterModel, filterKeyword);
  };

  const handleReset = () => {
    setFilterStatus(0);
    setFilterChannelId('');
    setFilterModel('');
    setFilterKeyword('');
    setPage(1);
    load(1, pageSize, 0, '', '', '');
  };

  const refresh = () => load(page, pageSize, filterStatus, filterChannelId, filterModel, filterKeyword);

  const callAction = async (path, method = 'post', body) => {
    try {
      const res = await API[method](path, body);
      const { success, message } = res.data;
      if (success) {
        Toast.success(t('操作成功'));
        refresh();
      } else {
        Toast.error(message || t('操作失败'));
      }
    } catch {
      Toast.error(t('操作失败'));
    }
  };

  const handlePause = (record) => callAction(`/api/channel/heartbeat/${record.id}/pause`);
  const handleResume = (record) => callAction(`/api/channel/heartbeat/${record.id}/resume`);
  const handleTrigger = (record) => callAction(`/api/channel/heartbeat/${record.id}/trigger`);
  const handleDelete = (record) => callAction(`/api/channel/heartbeat/${record.id}`, 'delete');

  const openEdit = (record) => {
    setEditing(record);
    setEditThreshold(record.success_threshold);
    setEditInterval(record.interval_seconds);
  };

  const submitEdit = async () => {
    if (!editing) return;
    if (editThreshold <= 0 || editInterval <= 0) {
      Toast.error(t('成功阈值和检测间隔需大于 0'));
      return;
    }
    await callAction(`/api/channel/heartbeat/${editing.id}`, 'put', {
      success_threshold: Number(editThreshold),
      interval_seconds: Number(editInterval),
    });
    setEditing(null);
  };

  const openHistory = async (record) => {
    try {
      const res = await API.get(`/api/channel/heartbeat/${record.id}`);
      const { success, data, message } = res.data;
      if (success) {
        setHistoryItem(data);
        setHistoryOpen(true);
      } else {
        Toast.error(message || t('加载失败'));
      }
    } catch {
      Toast.error(t('加载失败'));
    }
  };

  const recentResults = useMemo(() => {
    if (!historyItem || !historyItem.recent_results) return [];
    try {
      const arr = JSON.parse(historyItem.recent_results);
      return Array.isArray(arr) ? arr.slice().reverse() : [];
    } catch {
      return [];
    }
  }, [historyItem]);

  const columns = useMemo(() => [
    {
      title: t('渠道'), dataIndex: 'channel_name', width: 160,
      render: (text, r) => <span>{text || `#${r.channel_id}`}</span>,
    },
    { title: t('渠道ID'), dataIndex: 'channel_id', width: 80 },
    {
      title: t('模型'), dataIndex: 'model', width: 220,
      render: (text) => <Tag color='blue' size='small'>{text}</Tag>,
    },
    {
      title: t('状态'), dataIndex: 'status', width: 90,
      render: (s) => {
        const meta = STATUS_META[s] || { color: 'grey', label: '未知' };
        return <Tag color={meta.color} size='small'>{t(meta.label)}</Tag>;
      },
    },
    {
      title: t('成功 / 阈值'), width: 110,
      render: (_, r) => <span>{r.success_count} / {r.success_threshold}</span>,
    },
    { title: t('间隔(秒)'), dataIndex: 'interval_seconds', width: 90 },
    { title: t('累计尝试'), dataIndex: 'total_attempts', width: 90 },
    { title: t('上次测试'), dataIndex: 'last_test_at', width: 170, render: formatTs },
    { title: t('下次测试'), dataIndex: 'next_test_at', width: 170, render: formatTs },
    {
      title: t('禁用原因'), dataIndex: 'disable_reason', width: 240,
      render: (text) => text ? (
        <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 220 }}>{text}</Text>
      ) : '-',
    },
    {
      title: t('操作'), fixed: 'right', width: 280,
      render: (_, r) => (
        <Space>
          {r.status === 1 ? (
            <Button size='small' icon={<IconPause />} onClick={() => handlePause(r)}>{t('暂停')}</Button>
          ) : (
            <Button size='small' icon={<IconPlay />} onClick={() => handleResume(r)}>{t('开始')}</Button>
          )}
          <Button size='small' icon={<IconRefresh2 />} onClick={() => handleTrigger(r)}>{t('立即测试')}</Button>
          <Button size='small' icon={<IconEdit />} onClick={() => openEdit(r)}>{t('编辑')}</Button>
          <Button size='small' icon={<IconHistory />} onClick={() => openHistory(r)}>{t('历史')}</Button>
          <Popconfirm
            title={t('删除心跳任务并解除该渠道模型的禁用?')}
            onConfirm={() => handleDelete(r)}
          >
            <Button size='small' type='danger' icon={<IconDelete />}>{t('删除')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [t]);

  return (
    <div className='mt-[60px] px-2'>
      <Card title={t('心跳任务')} bordered={false}>
        <div className='mb-4 flex flex-wrap gap-2 items-end'>
          <div>
            <div className='text-xs text-gray-500 mb-1'>{t('状态')}</div>
            <Select
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 140 }}
              optionList={STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
            />
          </div>
          <div>
            <div className='text-xs text-gray-500 mb-1'>{t('渠道ID')}</div>
            <Input value={filterChannelId} onChange={setFilterChannelId} placeholder={t('渠道ID')} style={{ width: 110 }} showClear />
          </div>
          <div>
            <div className='text-xs text-gray-500 mb-1'>{t('模型')}</div>
            <Input value={filterModel} onChange={setFilterModel} placeholder={t('模型')} style={{ width: 200 }} showClear />
          </div>
          <div>
            <div className='text-xs text-gray-500 mb-1'>{t('关键词')}</div>
            <Input
              value={filterKeyword}
              onChange={setFilterKeyword}
              placeholder={t('模型或渠道名')}
              style={{ width: 180 }}
              showClear
              onEnterPress={handleSearch}
            />
          </div>
          <Space>
            <Button icon={<IconSearch />} theme='solid' onClick={handleSearch}>{t('搜索')}</Button>
            <Button icon={<IconRefresh />} onClick={handleReset}>{t('重置')}</Button>
          </Space>
        </div>

        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={items}
            rowKey={(r) => r.id}
            pagination={{
              currentPage: page,
              pageSize,
              total,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
              pageSizeOpts: [10, 20, 50, 100],
              showSizeChanger: true,
              showTotal: true,
              formatShowTotal: (n) => `${t('共')} ${n} ${t('条')}`,
            }}
            size='small'
            bordered
            scroll={{ x: 'max-content' }}
          />
        </Spin>
      </Card>

      <Modal
        title={t('编辑心跳任务')}
        visible={!!editing}
        onCancel={() => setEditing(null)}
        onOk={submitEdit}
        okText={t('保存')}
        cancelText={t('取消')}
      >
        <div className='space-y-3'>
          <div>
            <div className='text-xs text-gray-500 mb-1'>{t('成功阈值')}</div>
            <InputNumber min={1} value={editThreshold} onChange={setEditThreshold} style={{ width: '100%' }} />
          </div>
          <div>
            <div className='text-xs text-gray-500 mb-1'>{t('检测间隔(秒)')}</div>
            <InputNumber min={1} value={editInterval} onChange={setEditInterval} style={{ width: '100%' }} />
          </div>
        </div>
      </Modal>

      <SideSheet
        title={t('心跳测试历史')}
        visible={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        width={520}
      >
        {historyItem && (
          <div className='space-y-4'>
            <Descriptions
              size='small'
              data={[
                { key: t('渠道'), value: `${historyItem.channel_name || ''} (#${historyItem.channel_id})` },
                { key: t('模型'), value: historyItem.model },
                { key: t('状态'), value: t(STATUS_META[historyItem.status]?.label || '未知') },
                { key: t('成功 / 阈值'), value: `${historyItem.success_count} / ${historyItem.success_threshold}` },
                { key: t('间隔(秒)'), value: historyItem.interval_seconds },
                { key: t('累计尝试'), value: historyItem.total_attempts },
                { key: t('禁用原因'), value: historyItem.disable_reason || '-' },
                { key: t('最近错误'), value: historyItem.last_error || '-' },
              ]}
            />
            <Typography.Title heading={6}>{t('最近测试结果')}</Typography.Title>
            {recentResults.length === 0 ? (
              <Text type='tertiary'>{t('暂无测试历史')}</Text>
            ) : (
              <div className='space-y-2'>
                {recentResults.map((r, i) => (
                  <div
                    key={i}
                    className='p-2 border border-[var(--semi-color-border)] rounded'
                  >
                    <div className='flex items-center gap-2 mb-1'>
                      <Tag size='small' color={r.success ? 'green' : 'red'}>
                        {r.success ? t('成功') : t('失败')}
                      </Tag>
                      <Text type='tertiary' size='small'>{formatTs(r.ts)}</Text>
                      <Text type='tertiary' size='small'>{r.latency_ms}ms</Text>
                    </div>
                    {r.error && (
                      <Text size='small' type='danger' style={{ wordBreak: 'break-all' }}>{r.error}</Text>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SideSheet>
    </div>
  );
};

export default HeartbeatPage;
