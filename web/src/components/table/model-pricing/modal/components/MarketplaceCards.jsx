/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { Card, Avatar, Typography, Tag, Space } from '@douyinfe/semi-ui';
import {
  IconActivity,
  IconCoinMoneyStroked,
  IconSetting,
  IconBookmark,
} from '@douyinfe/semi-icons';
import {
  Eye,
  Wrench,
  Brain,
  Database,
  Image as ImageIcon,
  Mouse,
} from 'lucide-react';
import MarkdownRenderer from '../../../../common/markdown/MarkdownRenderer';

const { Text } = Typography;

// 与列表 / Pricing 页面完全一致的能力定义
const CAPABILITY_META = {
  vision: { label: '视觉', Icon: Eye, color: '#10b981' },
  tool_calling: { label: '工具调用', Icon: Wrench, color: '#6366f1' },
  reasoning: { label: '推理', Icon: Brain, color: '#a855f7' },
  caching: { label: '缓存', Icon: Database, color: '#0ea5e9' },
  image_generation: { label: '图像生成', Icon: ImageIcon, color: '#f59e0b' },
  computer_use: { label: '电脑操作', Icon: Mouse, color: '#ef4444' },
};

const formatPrice = (val) => {
  if (val == null) return '-';
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val >= 0.01) return `$${val.toFixed(3)}`;
  return `$${val.toFixed(4)}`;
};

// === 能力卡 ===
const ModelCapabilities = ({ capabilities = [], t }) => {
  if (!capabilities || capabilities.length === 0) return null;
  return (
    <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='green' className='mr-2 shadow-md'>
          <IconActivity size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>{t('能力')}</Text>
          <div className='text-xs text-gray-600'>
            {t('模型支持的功能特性')}
          </div>
        </div>
      </div>
      <Space wrap>
        {capabilities.map((c) => {
          const meta = CAPABILITY_META[c];
          if (!meta) return null;
          const Icon = meta.Icon;
          return (
            <Tag
              key={c}
              shape='circle'
              size='large'
              prefixIcon={<Icon size={14} strokeWidth={2.2} />}
              style={{
                background: `${meta.color}1a`,
                color: meta.color,
                borderColor: 'transparent',
              }}
            >
              {t(meta.label)}
            </Tag>
          );
        })}
      </Space>
    </Card>
  );
};

// === 定价摘要卡（detail.png 中的大字号 3 列）===
const ModelPricingSummary = ({ modelData, t }) => {
  const isPerRequest = modelData?.quota_type === 1;
  // 估算 default 分组下的当前价格用于摘要
  // 这里直接使用模型上 `model_ratio` × completion_ratio × cache_ratio 推导（按 1 分组倍率）
  // 单位：$ / 1M tokens
  const perMillion = 2.0;
  const inputPrice = modelData?.model_ratio
    ? modelData.model_ratio * perMillion
    : null;
  const outputPrice =
    modelData?.model_ratio && modelData?.completion_ratio
      ? modelData.model_ratio * modelData.completion_ratio * perMillion
      : null;
  const cachedPrice =
    modelData?.model_ratio && modelData?.cache_ratio
      ? modelData.model_ratio * modelData.cache_ratio * perMillion
      : null;
  const cacheCreatePrice =
    modelData?.model_ratio && modelData?.create_cache_ratio
      ? modelData.model_ratio * modelData.create_cache_ratio * perMillion
      : null;

  return (
    <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='orange' className='mr-2 shadow-md'>
          <IconCoinMoneyStroked size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>
            {isPerRequest ? t('按次定价') : t('每 1M tokens 定价')}
          </Text>
          <div className='text-xs text-gray-600'>
            {t('模型基础参考价')}
          </div>
        </div>
      </div>

      {isPerRequest ? (
        <div className='flex items-baseline gap-1'>
          <span className='text-3xl font-bold text-orange-500'>
            {formatPrice(modelData?.model_price)}
          </span>
          <span
            className='text-xs ml-1'
            style={{ color: 'var(--semi-color-text-2)' }}
          >
            / {t('次')}
          </span>
        </div>
      ) : (
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-6'>
          <PriceCell
            label={t('输入')}
            value={formatPrice(inputPrice)}
            unit='/1M'
          />
          <PriceCell
            label={t('输出')}
            value={formatPrice(outputPrice)}
            unit='/1M'
          />
          {cachedPrice != null && (
            <PriceCell
              label={t('缓存读')}
              value={formatPrice(cachedPrice)}
              unit='/1M'
            />
          )}
          {cacheCreatePrice != null && (
            <PriceCell
              label={t('缓存写')}
              value={formatPrice(cacheCreatePrice)}
              unit='/1M'
            />
          )}
        </div>
      )}
    </Card>
  );
};

const PriceCell = ({ label, value, unit }) => (
  <div className='flex flex-col items-start gap-1'>
    <div
      className='text-xs font-medium uppercase tracking-wider'
      style={{ color: 'var(--semi-color-text-2)' }}
    >
      {label}
    </div>
    <div className='flex items-baseline gap-1'>
      <span className='text-2xl font-bold text-orange-500'>{value}</span>
      <span className='text-xs' style={{ color: 'var(--semi-color-text-2)' }}>
        {unit}
      </span>
    </div>
  </div>
);

// === 规格参数卡 ===
const SpecRow = ({ label, value, last }) => (
  <div
    className={`flex items-center justify-between py-3 ${last ? '' : 'border-b border-dashed'}`}
    style={{ borderColor: 'var(--semi-color-border)' }}
  >
    <span className='text-sm' style={{ color: 'var(--semi-color-text-2)' }}>
      {label}
    </span>
    <div className='text-sm font-medium text-right max-w-[60%]'>{value}</div>
  </div>
);

const ModelSpecifications = ({ modelData, t }) => {
  const isPerRequest = modelData?.quota_type === 1;
  const hasEndpoints =
    modelData?.supported_endpoint_types &&
    modelData.supported_endpoint_types.length > 0;

  return (
    <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='cyan' className='mr-2 shadow-md'>
          <IconSetting size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>{t('规格参数')}</Text>
          <div className='text-xs text-gray-600'>
            {t('模型的关键技术规格')}
          </div>
        </div>
      </div>
      <div>
        <SpecRow
          label={t('上下文窗口')}
          value={modelData?.context_length || '-'}
        />
        <SpecRow
          label={t('最大输出')}
          value={modelData?.max_output_tokens || '-'}
        />
        <SpecRow
          label={t('计费类型')}
          value={
            isPerRequest ? (
              <Tag color='teal' shape='circle' size='small'>
                {t('按次计费')}
              </Tag>
            ) : (
              <Tag color='violet' shape='circle' size='small'>
                {t('按量计费')}
              </Tag>
            )
          }
        />
        <SpecRow
          label={t('知识截止')}
          value={modelData?.knowledge_cutoff || '-'}
          last={!hasEndpoints}
        />
      </div>
    </Card>
  );
};

// === 详细介绍 markdown 卡 ===
const ModelLongDescription = ({ longDescription, t }) => {
  if (!longDescription) return null;
  return (
    <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='blue' className='mr-2 shadow-md'>
          <IconBookmark size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>{t('详细介绍')}</Text>
          <div className='text-xs text-gray-600'>
            {t('模型的深入说明（支持 markdown）')}
          </div>
        </div>
      </div>
      <MarkdownRenderer content={longDescription} />
    </Card>
  );
};

export {
  ModelCapabilities,
  ModelPricingSummary,
  ModelSpecifications,
  ModelLongDescription,
};
