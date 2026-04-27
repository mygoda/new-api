/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Tag,
  Avatar,
  Input,
  Select,
  Dropdown,
  Button,
  Empty,
  Checkbox,
} from '@douyinfe/semi-ui';
import { Search, SlidersHorizontal } from 'lucide-react';
import { API, showError } from '../../helpers';
import CapabilityIcons, { CAPABILITY_META } from './components/CapabilityIcons';

const formatPrice = (val) => {
  if (val == null) return '-';
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val >= 0.01) return `$${val.toFixed(3)}`;
  return `$${val.toFixed(4)}`;
};

const Marketplace = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [selectedCapabilities, setSelectedCapabilities] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await API.get('/api/marketplace/models');
        const { success, message, data } = res.data;
        if (success) {
          setModels(data || []);
        } else {
          showError(message);
        }
      } catch (err) {
        showError(err.message || t('加载失败'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [t]);

  const filteredAndSorted = useMemo(() => {
    const kw = searchValue.trim().toLowerCase();
    let list = models.filter((m) => {
      if (kw) {
        const hit =
          (m.model_name || '').toLowerCase().includes(kw) ||
          (m.description || '').toLowerCase().includes(kw) ||
          (m.tags || '').toLowerCase().includes(kw);
        if (!hit) return false;
      }
      if (selectedCapabilities.length > 0) {
        const caps = m.capabilities || [];
        if (!selectedCapabilities.every((c) => caps.includes(c))) return false;
      }
      return true;
    });

    const parseContext = (s) => {
      if (!s) return 0;
      const t = String(s).toUpperCase().trim();
      const m = t.match(/^([\d.]+)\s*([KM]?)$/);
      if (!m) return Number(t) || 0;
      const num = parseFloat(m[1]);
      if (m[2] === 'M') return num * 1_000_000;
      if (m[2] === 'K') return num * 1_000;
      return num;
    };

    if (sortKey === 'name') {
      list.sort((a, b) => (a.model_name || '').localeCompare(b.model_name || ''));
    } else if (sortKey === 'context_desc') {
      list.sort((a, b) => parseContext(b.context_length) - parseContext(a.context_length));
    } else if (sortKey === 'price_asc') {
      list.sort((a, b) => (a.input_price || 0) - (b.input_price || 0));
    } else if (sortKey === 'price_desc') {
      list.sort((a, b) => (b.input_price || 0) - (a.input_price || 0));
    }
    return list;
  }, [models, searchValue, sortKey, selectedCapabilities]);

  const goDetail = useCallback(
    (record) => navigate(`/marketplace/${encodeURIComponent(record.model_name)}`),
    [navigate],
  );

  const columns = [
    {
      title: <span className='uppercase text-xs tracking-wider'>{t('模型')}</span>,
      dataIndex: 'model_name',
      key: 'model_name',
      sorter: (a, b) => (a.model_name || '').localeCompare(b.model_name || ''),
      render: (text, record) => (
        <div className='flex items-center gap-2'>
          {record.icon ? (
            <Avatar size='extra-small' src={record.icon} shape='square' />
          ) : (
            <Avatar size='extra-small' shape='square'>
              {(text || '?').slice(0, 2).toUpperCase()}
            </Avatar>
          )}
          <span className='font-medium truncate max-w-[200px]'>{text}</span>
        </div>
      ),
    },
    {
      title: <span className='uppercase text-xs tracking-wider'>{t('上下文')}</span>,
      dataIndex: 'context_length',
      key: 'context_length',
      align: 'right',
      width: 110,
      render: (val) => <span className='text-sm'>{val || '-'}</span>,
    },
    {
      title: <span className='uppercase text-xs tracking-wider'>{t('最大输出')}</span>,
      dataIndex: 'max_output_tokens',
      key: 'max_output_tokens',
      align: 'right',
      width: 110,
      render: (val) => <span className='text-sm'>{val || '-'}</span>,
    },
    {
      title: <span className='uppercase text-xs tracking-wider'>{t('输入价')}</span>,
      dataIndex: 'input_price',
      key: 'input_price',
      align: 'right',
      width: 110,
      sorter: (a, b) => (a.input_price || 0) - (b.input_price || 0),
      render: (_v, record) => {
        if (record.quota_type === 1) {
          return (
            <span className='text-sm text-orange-500'>
              {formatPrice(record.price_per_request)}
              <span className='text-gray-400 ml-1'>/{t('次')}</span>
            </span>
          );
        }
        return (
          <span className='text-sm text-orange-500'>
            {formatPrice(record.input_price)}
            <span className='text-gray-400 ml-1'>/1M</span>
          </span>
        );
      },
    },
    {
      title: <span className='uppercase text-xs tracking-wider'>{t('输出价')}</span>,
      dataIndex: 'output_price',
      key: 'output_price',
      align: 'right',
      width: 110,
      sorter: (a, b) => (a.output_price || 0) - (b.output_price || 0),
      render: (_v, record) => {
        if (record.quota_type === 1) return <span className='text-gray-400'>-</span>;
        return (
          <span className='text-sm text-orange-500'>
            {formatPrice(record.output_price)}
            <span className='text-gray-400 ml-1'>/1M</span>
          </span>
        );
      },
    },
    {
      title: <span className='uppercase text-xs tracking-wider'>{t('能力')}</span>,
      dataIndex: 'capabilities',
      key: 'capabilities',
      width: 220,
      render: (caps) => <CapabilityIcons capabilities={caps || []} size={14} t={t} />,
    },
    {
      title: <span className='uppercase text-xs tracking-wider'>{t('标签')}</span>,
      dataIndex: 'tags',
      key: 'tags',
      width: 160,
      render: (tagsStr) => {
        const tags = (tagsStr || '').split(',').filter(Boolean);
        if (tags.length === 0) return null;
        return (
          <div className='flex flex-wrap gap-1'>
            {tags.slice(0, 2).map((tag) => (
              <Tag key={tag} size='small' color='blue' shape='circle'>
                {tag}
              </Tag>
            ))}
            {tags.length > 2 && (
              <Tag size='small' color='grey' shape='circle'>
                +{tags.length - 2}
              </Tag>
            )}
          </div>
        );
      },
    },
  ];

  const filterDropdown = (
    <Dropdown.Menu className='!p-3 !min-w-[220px]'>
      <div className='text-xs text-gray-500 mb-2 uppercase tracking-wider'>
        {t('能力筛选')}
      </div>
      {Object.entries(CAPABILITY_META).map(([key, meta]) => (
        <div key={key} className='py-1'>
          <Checkbox
            checked={selectedCapabilities.includes(key)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedCapabilities([...selectedCapabilities, key]);
              } else {
                setSelectedCapabilities(
                  selectedCapabilities.filter((c) => c !== key),
                );
              }
            }}
          >
            {t(meta.label)}
          </Checkbox>
        </div>
      ))}
      {selectedCapabilities.length > 0 && (
        <div className='mt-2 pt-2 border-t border-gray-100'>
          <Button
            theme='borderless'
            size='small'
            onClick={() => setSelectedCapabilities([])}
          >
            {t('清空')}
          </Button>
        </div>
      )}
    </Dropdown.Menu>
  );

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-zinc-900'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6'>
        <div className='mb-6'>
          <h1 className='text-2xl font-semibold mb-1'>{t('模型广场（新）')}</h1>
          <p className='text-sm text-gray-500'>
            {t('以模型为主体的现代化广场，展示能力、上下文、定价等关键信息（仅管理员可见）')}
          </p>
        </div>

        <Card
          shadows='always'
          bordered={false}
          className='!rounded-2xl'
          bodyStyle={{ padding: 16 }}
        >
          <div className='flex items-center gap-3 flex-wrap mb-4'>
            <Input
              prefix={<Search size={16} />}
              value={searchValue}
              onChange={setSearchValue}
              placeholder={t('搜索模型名 / 描述')}
              showClear
              style={{ width: 320 }}
            />
            <Dropdown trigger='click' position='bottomLeft' render={filterDropdown}>
              <Button icon={<SlidersHorizontal size={14} />}>
                {t('筛选')}
                {selectedCapabilities.length > 0 && (
                  <Tag size='small' color='blue' shape='circle' className='ml-1'>
                    {selectedCapabilities.length}
                  </Tag>
                )}
              </Button>
            </Dropdown>
            <Select
              value={sortKey}
              onChange={setSortKey}
              style={{ width: 180 }}
              optionList={[
                { value: 'name', label: t('按名称') },
                { value: 'context_desc', label: t('上下文 高 → 低') },
                { value: 'price_asc', label: t('价格 低 → 高') },
                { value: 'price_desc', label: t('价格 高 → 低') },
              ]}
            />
            <span className='text-sm text-gray-400 ml-auto'>
              {t('共')} {filteredAndSorted.length} {t('个模型')}
            </span>
          </div>

          {filteredAndSorted.length === 0 && !loading ? (
            <Empty title={t('未找到匹配的模型')} style={{ padding: 60 }} />
          ) : (
            <Table
              columns={columns}
              dataSource={filteredAndSorted}
              rowKey='model_name'
              loading={loading}
              size='middle'
              pagination={{
                pageSize: 20,
                showSizeChanger: false,
                hideOnSinglePage: true,
              }}
              onRow={(record) => ({
                onClick: () => goDetail(record),
                style: { cursor: 'pointer' },
              })}
            />
          )}
        </Card>
      </div>
    </div>
  );
};

export default Marketplace;
