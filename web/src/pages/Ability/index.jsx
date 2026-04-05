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
  Collapsible,
  Typography,
  Descriptions,
} from '@douyinfe/semi-ui';
import { IconSearch, IconRefresh, IconHelpCircle } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API } from '../../helpers/api';

const { Text } = Typography;

const AbilityPage = () => {
  const { t } = useTranslation();
  const [abilities, setAbilities] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showGuide, setShowGuide] = useState(false);

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
        title={
          <div className='flex items-center gap-2'>
            {t('模型渠道配置')}
            <Button
              size='small'
              type='tertiary'
              icon={<IconHelpCircle />}
              onClick={() => setShowGuide(!showGuide)}
            >
              {showGuide ? t('收起说明') : t('配置说明')}
            </Button>
          </div>
        }
        bordered={false}
      >
        <Collapsible isOpen={showGuide}>
          <div className='mb-4 p-4 rounded-lg bg-[var(--semi-color-fill-0)] border border-[var(--semi-color-border)]'>
            <Typography.Title heading={6} className='!mb-3'>{t('路由选择规则')}</Typography.Title>
            <div className='space-y-2 text-sm text-[var(--semi-color-text-1)]'>
              <div className='flex items-start gap-2'>
                <Tag color='blue' size='small' className='shrink-0 !mt-0.5'>1</Tag>
                <span>{t('系统根据请求的分组和模型，查找所有匹配的可用渠道记录')}</span>
              </div>
              <div className='flex items-start gap-2'>
                <Tag color='blue' size='small' className='shrink-0 !mt-0.5'>2</Tag>
                <span>{t('按优先级从高到低分层，优先使用高优先级的渠道')}</span>
              </div>
              <div className='flex items-start gap-2'>
                <Tag color='blue' size='small' className='shrink-0 !mt-0.5'>3</Tag>
                <span>{t('同一优先级内，按权重随机分配流量（权重越高，被选中概率越大）')}</span>
              </div>
              <div className='flex items-start gap-2'>
                <Tag color='blue' size='small' className='shrink-0 !mt-0.5'>4</Tag>
                <span>{t('当前优先级的渠道全部失败后，自动降级到下一优先级')}</span>
              </div>
            </div>

            <Typography.Title heading={6} className='!mt-4 !mb-3'>{t('配置示例')}</Typography.Title>
            <div className='overflow-x-auto'>
              <table className='text-sm w-full border-collapse'>
                <thead>
                  <tr className='bg-[var(--semi-color-fill-1)]'>
                    <th className='px-3 py-1.5 text-left border border-[var(--semi-color-border)]'>{t('模型')}</th>
                    <th className='px-3 py-1.5 text-left border border-[var(--semi-color-border)]'>{t('渠道')}</th>
                    <th className='px-3 py-1.5 text-left border border-[var(--semi-color-border)]'>{t('优先级')}</th>
                    <th className='px-3 py-1.5 text-left border border-[var(--semi-color-border)]'>{t('权重')}</th>
                    <th className='px-3 py-1.5 text-left border border-[var(--semi-color-border)]'>{t('效果')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'>gpt-4</td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'>{t('渠道')} A</td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'><Tag size='small' color='blue'>10</Tag></td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'><Tag size='small'>70</Tag></td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'>{t('首选，约70%流量')}</td>
                  </tr>
                  <tr>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'>gpt-4</td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'>{t('渠道')} B</td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'><Tag size='small' color='blue'>10</Tag></td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'><Tag size='small'>30</Tag></td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'>{t('首选，约30%流量')}</td>
                  </tr>
                  <tr>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'>gpt-4</td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'>{t('渠道')} C</td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'><Tag size='small' color='orange'>5</Tag></td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'><Tag size='small'>100</Tag></td>
                    <td className='px-3 py-1.5 border border-[var(--semi-color-border)]'>{t('A和B都失败后的备用渠道')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <Typography.Title heading={6} className='!mt-4 !mb-2'>{t('注意事项')}</Typography.Title>
            <ul className='text-sm text-[var(--semi-color-text-2)] list-disc pl-5 space-y-1'>
              <li>{t('优先级数值越大越优先（如 10 > 5 > 0）')}</li>
              <li>{t('权重为 0 的渠道仍会被选中，系统会自动补偿最低权重')}</li>
              <li>{t('此处修改仅影响当前模型在该渠道的配比，不影响其他模型')}</li>
              <li>{t('通过渠道管理修改渠道默认优先级/权重时，仅对新增的记录生效，不会覆盖此处的独立配置')}</li>
            </ul>
          </div>
        </Collapsible>
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
