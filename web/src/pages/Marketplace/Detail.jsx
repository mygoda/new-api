/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Spin,
  Empty,
  Avatar,
  Tag,
  Card,
  Button,
  Table,
} from '@douyinfe/semi-ui';
import { ArrowLeft } from 'lucide-react';
import { API, showError } from '../../helpers';
import { CAPABILITY_META } from './components/CapabilityIcons';
import MarkdownRenderer from '../../components/common/markdown/MarkdownRenderer';

const formatPrice = (val) => {
  if (val == null) return '-';
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val >= 0.01) return `$${val.toFixed(3)}`;
  return `$${val.toFixed(4)}`;
};

// 能力 pill: icon + label，长方圆角小药丸
const CapabilityPill = ({ keyName, t }) => {
  const meta = CAPABILITY_META[keyName];
  if (!meta) return null;
  const Icon = meta.Icon;
  return (
    <span
      className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium'
      style={{
        background: `${meta.color}1a`,
        color: meta.color,
      }}
    >
      <Icon size={14} strokeWidth={2.2} />
      <span>{t(meta.label)}</span>
    </span>
  );
};

// 一个 PriceCell：上方小标题 + 大字价格 + 单位
const PriceCell = ({ title, value, unit }) => (
  <div className='flex flex-col items-start'>
    <div className='text-xs uppercase tracking-wider text-gray-400 mb-2'>
      {title}
    </div>
    <div className='flex items-baseline'>
      <span className='text-3xl font-semibold text-orange-500'>{value}</span>
      <span className='ml-1 text-xs text-gray-400'>{unit}</span>
    </div>
  </div>
);

const SpecRow = ({ label, value, last }) => (
  <div
    className={`flex items-center justify-between py-3 ${last ? '' : 'border-b border-gray-100 dark:border-zinc-800'}`}
  >
    <span className='text-sm text-gray-500'>{label}</span>
    <span className='text-sm font-medium'>{value || '-'}</span>
  </div>
);

const MarketplaceDetail = () => {
  const { t } = useTranslation();
  const { name } = useParams();
  const navigate = useNavigate();
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!name) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await API.get(
          `/api/marketplace/models/${encodeURIComponent(name)}`,
        );
        const { success, message, data } = res.data;
        if (success) {
          setModel(data);
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
  }, [name, t]);

  if (loading) {
    return (
      <div className='flex justify-center py-20'>
        <Spin size='large' />
      </div>
    );
  }
  if (!model) {
    return (
      <div className='py-20'>
        <Empty title={t('未找到该模型')} />
      </div>
    );
  }

  const tags = (model.tags || '').split(',').filter(Boolean);
  const capabilities = model.capabilities || [];
  const hasCacheRead = model.cached_price != null;
  const hasCacheWrite = model.cache_create_price != null;
  const isPerRequest = model.quota_type === 1;

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-zinc-900'>
      <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6'>
        <Button
          icon={<ArrowLeft size={16} />}
          theme='borderless'
          onClick={() => navigate('/marketplace')}
          className='mb-3'
        >
          {t('返回列表')}
        </Button>

        {/* Hero */}
        <Card
          shadows='always'
          bordered={false}
          className='!rounded-2xl mb-4'
          bodyStyle={{ padding: 28 }}
        >
          <div className='flex items-start gap-4'>
            {model.icon ? (
              <Avatar size='large' src={model.icon} shape='square' />
            ) : (
              <Avatar size='large' shape='square'>
                {(model.model_name || '?').slice(0, 2).toUpperCase()}
              </Avatar>
            )}
            <div className='flex-1 min-w-0'>
              <h1 className='text-3xl font-bold mb-2 break-all'>
                {model.model_name}
              </h1>
              {tags.length > 0 && (
                <div className='flex flex-wrap gap-1 mb-3'>
                  {tags.map((tag) => (
                    <Tag key={tag} color='blue' shape='circle' size='small'>
                      {tag}
                    </Tag>
                  ))}
                </div>
              )}
            </div>
          </div>

          {model.description && (
            <p className='mt-5 text-base leading-relaxed text-gray-600 dark:text-gray-300'>
              {model.description}
            </p>
          )}

          {capabilities.length > 0 && (
            <div className='mt-5 flex flex-wrap gap-2'>
              {capabilities.map((c) => (
                <CapabilityPill key={c} keyName={c} t={t} />
              ))}
            </div>
          )}
        </Card>

        {/* 模型简介（markdown long_description） */}
        {model.long_description && (
          <Card
            shadows='always'
            bordered={false}
            className='!rounded-2xl mb-4'
            bodyStyle={{ padding: 24 }}
          >
            <div className='text-xs uppercase tracking-wider text-gray-400 mb-3'>
              {t('模型简介')}
            </div>
            <MarkdownRenderer content={model.long_description} />
          </Card>
        )}

        {/* 定价 */}
        <Card
          shadows='always'
          bordered={false}
          className='!rounded-2xl mb-4'
          bodyStyle={{ padding: 24 }}
        >
          <div className='text-xs uppercase tracking-wider text-gray-400 mb-4'>
            {isPerRequest ? t('按次定价') : t('每 1M tokens 定价')}
          </div>
          {isPerRequest ? (
            <PriceCell
              title={t('每次调用')}
              value={formatPrice(model.price_per_request)}
              unit={`/ ${t('次')}`}
            />
          ) : (
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-6'>
              <PriceCell
                title={t('输入')}
                value={formatPrice(model.input_price)}
                unit='/1M'
              />
              <PriceCell
                title={t('输出')}
                value={formatPrice(model.output_price)}
                unit='/1M'
              />
              {hasCacheRead && (
                <PriceCell
                  title={t('缓存读')}
                  value={formatPrice(model.cached_price)}
                  unit='/1M'
                />
              )}
              {hasCacheWrite && (
                <PriceCell
                  title={t('缓存写')}
                  value={formatPrice(model.cache_create_price)}
                  unit='/1M'
                />
              )}
            </div>
          )}

          {/* 阶梯计费表 */}
          {model.tiers && model.tiers.length > 0 && (
            <div className='mt-6 pt-6 border-t border-gray-100 dark:border-zinc-800'>
              <div className='text-xs uppercase tracking-wider text-gray-400 mb-3'>
                {t('阶梯计费')}
              </div>
              <Table
                size='small'
                pagination={false}
                dataSource={model.tiers.map((tier, idx) => ({ key: idx, ...tier }))}
                columns={[
                  {
                    title: t('档位 (prompt tokens)'),
                    dataIndex: 'threshold',
                    render: (v, _r, idx) => {
                      if (idx === 0) return `≤ ${v}`;
                      const prev = model.tiers[idx - 1].threshold;
                      if (v === 0 || v == null) return `> ${prev}`;
                      return `${prev + 1} ~ ${v}`;
                    },
                  },
                  {
                    title: t('输入'),
                    dataIndex: 'input_price',
                    render: (v) => `${formatPrice(v)} / 1M`,
                  },
                  {
                    title: t('输出'),
                    dataIndex: 'output_price',
                    render: (v) => `${formatPrice(v)} / 1M`,
                  },
                  {
                    title: t('缓存读'),
                    dataIndex: 'cached_price',
                    render: (v) => (v != null ? `${formatPrice(v)} / 1M` : '-'),
                  },
                ]}
              />
            </div>
          )}
        </Card>

        {/* SPECIFICATIONS */}
        <Card
          shadows='always'
          bordered={false}
          className='!rounded-2xl mb-4'
          bodyStyle={{ padding: 24 }}
        >
          <div className='text-xs uppercase tracking-wider text-gray-400 mb-2'>
            {t('规格参数')}
          </div>
          <SpecRow
            label={t('上下文窗口')}
            value={model.context_length || '-'}
          />
          <SpecRow
            label={t('最大输出')}
            value={model.max_output_tokens || '-'}
          />
          <SpecRow
            label={t('计费类型')}
            value={isPerRequest ? t('按次计费') : t('按量计费')}
          />
          <SpecRow
            label={t('知识截止')}
            value={model.knowledge_cutoff || '-'}
            last={!model.endpoints || model.endpoints.length === 0}
          />
          {model.endpoints && model.endpoints.length > 0 && (
            <div className='flex items-start justify-between py-3'>
              <span className='text-sm text-gray-500'>{t('支持端点')}</span>
              <div className='flex flex-wrap gap-1 justify-end max-w-[60%]'>
                {model.endpoints.map((ep) => (
                  <Tag key={ep} color='cyan' shape='circle' size='small'>
                    {ep}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default MarketplaceDetail;
