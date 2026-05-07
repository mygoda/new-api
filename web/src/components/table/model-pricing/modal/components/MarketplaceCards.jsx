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

// === 条件分价卡(仅命中已注册 family 且启用时由后端 conditional_pricing 字段下发)===
//
// 展示同一模型在不同条件下的折合单价 + 相对基准的折扣百分比。
// 客户能直观看到"我用 720p 含视频会便宜 39%,用 1080p 不含视频会贵 11%"。
//
// 数据来源:
//   - modelData.conditional_pricing (task 路径,Seedance 等已注册 family)
//   - modelData.video_input_ratio  (chat / 任意路径,通用「输入含视频」乘子)
const ModelConditionalPricing = ({ modelData, t }) => {
  const cp = modelData?.conditional_pricing;
  const videoInputRatio = Number(modelData?.video_input_ratio || 0);
  const hasFamily =
    cp && Array.isArray(cp.conditions) && cp.conditions.length > 0;
  const hasVideoInputOnly = !hasFamily && videoInputRatio > 0;
  if (!hasFamily && !hasVideoInputOnly) {
    return null;
  }
  const isPerRequest = modelData?.quota_type === 1;
  const baseRatio = modelData?.model_ratio || 0;
  const basePrice = modelData?.model_price || 0;
  const perMillion = 2.0;

  // 计算折合单价(按 token 计费用 ratio × 2$/1M;按次用 model_price)
  const effectivePrice = (mul, enabled) => {
    if (!enabled || !mul || mul <= 0) return null;
    if (isPerRequest) {
      if (basePrice <= 0) return null;
      return basePrice * mul;
    }
    if (baseRatio <= 0) return null;
    return baseRatio * mul * perMillion;
  };

  // 相对基准的百分比变化(>0 贵了,<0 便宜了)
  const deltaPct = (mul) => Math.round((mul - 1) * 100);

  // 把 video_input_ratio 抽象成一条 condition,与 family conditions 共用渲染
  const conditions = hasFamily
    ? cp.conditions
    : [
        {
          key: 'video_input',
          label: t('输入含视频'),
          match: t('messages[].content[].type == "video_url"'),
          hint: t('「模型管理 → 视频输入加价乘子」配置'),
          multiplier: videoInputRatio,
          enabled: true,
        },
      ];
  const cardLabel = hasFamily
    ? t('条件分价')
    : t('条件分价(输入含视频)');
  const baseHint = hasFamily
    ? cp.base_hint || t('单价随请求条件浮动,以下为各条件下的折合参考价')
    : t('当请求体含视频(video_url)时按下表乘子计费,其它情况走基准价');

  return (
    <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='violet' className='mr-2 shadow-md'>
          <IconActivity size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>{cardLabel}</Text>
          <div className='text-xs text-gray-600'>{baseHint}</div>
        </div>
      </div>

      <div className='space-y-2'>
        {conditions.map((c) => {
          const eff = effectivePrice(c.multiplier, c.enabled);
          const pct = c.enabled ? deltaPct(c.multiplier) : null;
          return (
            <div
              key={c.key}
              className={`flex items-start justify-between gap-3 p-3 rounded-xl border ${
                c.enabled
                  ? 'border-slate-200 bg-white'
                  : 'border-slate-100 bg-slate-50/60 opacity-60'
              }`}
            >
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2 flex-wrap'>
                  <span className='text-sm font-medium text-slate-900'>
                    {c.label || c.key}
                  </span>
                  {!c.enabled && (
                    <Tag size='small' color='grey' shape='circle'>
                      {t('已停用')}
                    </Tag>
                  )}
                  {c.enabled && pct !== null && pct < 0 && (
                    <Tag size='small' color='green' shape='circle'>
                      {`-${Math.abs(pct)}%`}
                    </Tag>
                  )}
                  {c.enabled && pct !== null && pct > 0 && (
                    <Tag size='small' color='orange' shape='circle'>
                      {`+${pct}%`}
                    </Tag>
                  )}
                </div>
                {c.match && (
                  <div className='text-xs text-slate-500 mt-1'>
                    {t('匹配条件')}: {c.match}
                  </div>
                )}
                {c.hint && (
                  <div className='text-xs text-slate-400 mt-0.5'>{c.hint}</div>
                )}
              </div>

              <div className='text-right flex-shrink-0'>
                {eff != null ? (
                  <>
                    <div className='text-base font-bold text-orange-500'>
                      {formatPrice(eff)}
                    </div>
                    <div className='text-[10px] text-slate-400'>
                      {isPerRequest ? `/ ${t('次')}` : '/1M'}
                    </div>
                  </>
                ) : (
                  <div className='text-xs text-slate-400'>{t('走基准价')}</div>
                )}
                {c.enabled && c.multiplier > 0 && (
                  <div className='text-[10px] text-slate-400 mt-0.5'>
                    × {Number(c.multiplier).toFixed(3)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className='mt-3 text-[11px] text-slate-400 leading-relaxed'>
        {t(
          '说明:基准价见上方「定价摘要」。折合参考价 = 基准价 × 该条件乘子,实际扣费以账单为准。',
        )}
      </div>
    </Card>
  );
};

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
  ModelConditionalPricing,
  ModelSpecifications,
  ModelLongDescription,
};
