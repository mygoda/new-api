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
  Input,
  Select,
  Dropdown,
  Button,
  Empty,
  Checkbox,
  Avatar,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { Search, SlidersHorizontal } from 'lucide-react';
import { API, showError, getLobeHubIcon, stringToColor } from '../../helpers';
import { renderLimitedItems } from '../../components/common/ui/RenderUtils';
import { CAPABILITY_META } from './components/CapabilityIcons';
import CapabilityIcons from './components/CapabilityIcons';

const ICON_CONTAINER =
  'w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0';

const formatPrice = (val) => {
  if (val == null) return '-';
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val >= 0.01) return `$${val.toFixed(3)}`;
  return `$${val.toFixed(4)}`;
};

const getModelIcon = (model) => {
  if (model.icon) {
    return (
      <div className={ICON_CONTAINER}>{getLobeHubIcon(model.icon, 24)}</div>
    );
  }
  if (model.vendor_icon) {
    return (
      <div className={ICON_CONTAINER}>
        {getLobeHubIcon(model.vendor_icon, 24)}
      </div>
    );
  }
  return (
    <Avatar
      size='small'
      shape='square'
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {(model.model_name || '?').slice(0, 2).toUpperCase()}
    </Avatar>
  );
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
      const text = String(s).toUpperCase().trim();
      const m = text.match(/^([\d.]+)\s*([KM]?)$/);
      if (!m) return Number(text) || 0;
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

  const renderQuotaTypeTag = (record) => {
    if (record.quota_type === 1) {
      return (
        <Tag color='teal' shape='circle' size='small'>
          {t('按次计费')}
        </Tag>
      );
    }
    return (
      <Tag color='violet' shape='circle' size='small'>
        {t('按量计费')}
      </Tag>
    );
  };

  const columns = [
    {
      title: t('模型'),
      dataIndex: 'model_name',
      key: 'model_name',
      sorter: (a, b) => (a.model_name || '').localeCompare(b.model_name || ''),
      render: (text, record) => (
        <div className='flex items-center gap-3'>
          {getModelIcon(record)}
          <div className='min-w-0'>
            <div className='font-semibold truncate max-w-[260px]'>{text}</div>
            {record.description && (
              <div
                className='text-xs leading-relaxed line-clamp-1 max-w-[260px] mt-0.5'
                style={{ color: 'var(--semi-color-text-2)' }}
              >
                {record.description}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: t('上下文'),
      dataIndex: 'context_length',
      key: 'context_length',
      align: 'right',
      width: 110,
      render: (val) =>
        val ? (
          <span className='text-sm font-medium'>{val}</span>
        ) : (
          <span className='text-sm text-gray-400'>-</span>
        ),
    },
    {
      title: t('最大输出'),
      dataIndex: 'max_output_tokens',
      key: 'max_output_tokens',
      align: 'right',
      width: 110,
      render: (val) =>
        val ? (
          <span className='text-sm font-medium'>{val}</span>
        ) : (
          <span className='text-sm text-gray-400'>-</span>
        ),
    },
    {
      title: t('输入价'),
      dataIndex: 'input_price',
      key: 'input_price',
      align: 'right',
      width: 130,
      sorter: (a, b) => (a.input_price || 0) - (b.input_price || 0),
      render: (_v, record) => {
        if (record.quota_type === 1) {
          return (
            <span className='text-sm font-semibold text-orange-500'>
              {formatPrice(record.price_per_request)}
              <span className='ml-1 text-xs font-normal text-gray-400'>
                /{t('次')}
              </span>
            </span>
          );
        }
        return (
          <span className='text-sm font-semibold text-orange-500'>
            {formatPrice(record.input_price)}
            <span className='ml-1 text-xs font-normal text-gray-400'>/1M</span>
          </span>
        );
      },
    },
    {
      title: t('输出价'),
      dataIndex: 'output_price',
      key: 'output_price',
      align: 'right',
      width: 130,
      sorter: (a, b) => (a.output_price || 0) - (b.output_price || 0),
      render: (_v, record) => {
        if (record.quota_type === 1) {
          return <span className='text-sm text-gray-400'>-</span>;
        }
        return (
          <span className='text-sm font-semibold text-orange-500'>
            {formatPrice(record.output_price)}
            <span className='ml-1 text-xs font-normal text-gray-400'>/1M</span>
          </span>
        );
      },
    },
    {
      title: t('能力'),
      dataIndex: 'capabilities',
      key: 'capabilities',
      width: 180,
      render: (caps) => <CapabilityIcons capabilities={caps || []} size={14} t={t} />,
    },
    {
      title: t('计费'),
      dataIndex: 'quota_type',
      key: 'quota_type',
      width: 110,
      render: (_v, record) => renderQuotaTypeTag(record),
    },
    {
      title: t('标签'),
      dataIndex: 'tags',
      key: 'tags',
      width: 200,
      render: (tagsStr) => {
        const tags = (tagsStr || '').split(',').filter(Boolean);
        if (tags.length === 0) return <span className='text-sm text-gray-400'>-</span>;
        return renderLimitedItems({
          items: tags,
          renderItem: (tg, idx) => (
            <Tag
              key={`tag-${idx}`}
              color={stringToColor(tg)}
              shape='circle'
              size='small'
            >
              {tg}
            </Tag>
          ),
          maxDisplay: 2,
        });
      },
    },
  ];

  const filterMenu = (
    <Dropdown.Menu className='!p-3' style={{ minWidth: 240 }}>
      <div className='text-xs font-medium text-gray-500 mb-2'>
        {t('能力筛选')}
      </div>
      <div className='space-y-2'>
        {Object.entries(CAPABILITY_META).map(([key, meta]) => (
          <Checkbox
            key={key}
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
        ))}
      </div>
      {selectedCapabilities.length > 0 && (
        <div className='mt-2 pt-2 border-t border-gray-100 dark:border-zinc-700'>
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
        {/* Hero */}
        <div className='mb-6'>
          <h1 className='text-2xl font-bold mb-1'>{t('模型广场（新）')}</h1>
          <p
            className='text-sm'
            style={{ color: 'var(--semi-color-text-2)' }}
          >
            {t(
              '以模型为主体的现代化广场，展示能力、上下文、定价等关键信息（仅管理员可见）',
            )}
          </p>
        </div>

        {/* Toolbar Card */}
        <Card
          className='!rounded-2xl mb-4'
          bordered={false}
          shadows='hover'
          bodyStyle={{ padding: 16 }}
        >
          <div className='flex items-center gap-3 flex-wrap'>
            <Input
              prefix={<Search size={16} />}
              value={searchValue}
              onChange={setSearchValue}
              placeholder={t('搜索模型名 / 描述 / 标签')}
              showClear
              style={{ width: 320 }}
            />
            <Dropdown
              trigger='click'
              position='bottomLeft'
              render={filterMenu}
            >
              <Button icon={<SlidersHorizontal size={14} />}>
                {t('筛选')}
                {selectedCapabilities.length > 0 && (
                  <Tag
                    size='small'
                    color='blue'
                    shape='circle'
                    className='ml-1'
                  >
                    {selectedCapabilities.length}
                  </Tag>
                )}
              </Button>
            </Dropdown>
            <Select
              value={sortKey}
              onChange={setSortKey}
              style={{ width: 200 }}
              optionList={[
                { value: 'name', label: t('按名称排序') },
                { value: 'context_desc', label: t('上下文 高 → 低') },
                { value: 'price_asc', label: t('价格 低 → 高') },
                { value: 'price_desc', label: t('价格 高 → 低') },
              ]}
            />
            <span className='text-sm text-gray-400 ml-auto'>
              {t('共')} {filteredAndSorted.length} {t('个模型')}
            </span>
          </div>
        </Card>

        {/* Table Card */}
        <Card
          className='!rounded-2xl overflow-hidden'
          bordered={false}
          shadows='hover'
          bodyStyle={{ padding: 0 }}
        >
          <Table
            columns={columns}
            dataSource={filteredAndSorted}
            rowKey='model_name'
            loading={loading}
            size='middle'
            scroll={{ x: 'max-content' }}
            empty={
              <Empty
                image={
                  <IllustrationNoResult style={{ width: 150, height: 150 }} />
                }
                darkModeImage={
                  <IllustrationNoResultDark
                    style={{ width: 150, height: 150 }}
                  />
                }
                description={t('未找到匹配的模型')}
                style={{ padding: 40 }}
              />
            }
            pagination={{
              defaultPageSize: 20,
              pageSizeOptions: [10, 20, 50, 100],
              showSizeChanger: true,
            }}
            onRow={(record) => ({
              onClick: () => goDetail(record),
              style: { cursor: 'pointer' },
            })}
          />
        </Card>
      </div>
    </div>
  );
};

export default Marketplace;
