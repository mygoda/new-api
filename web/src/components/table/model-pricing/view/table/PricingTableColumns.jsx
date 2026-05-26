/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { Tag, Space, Tooltip } from '@douyinfe/semi-ui';
import { IconHelpCircle } from '@douyinfe/semi-icons';
import {
  Eye,
  Wrench,
  Brain,
  Database,
  Image as ImageIcon,
  Mouse,
} from 'lucide-react';
import {
  renderModelTag,
  stringToColor,
  calculateModelPrice,
  getModelPriceItems,
  getLobeHubIcon,
} from '../../../../../helpers';
import {
  renderLimitedItems,
  renderDescription,
} from '../../../../common/ui/RenderUtils';
import { useIsMobile } from '../../../../../hooks/common/useIsMobile';

const CAPABILITY_META = {
  vision: { label: '视觉', Icon: Eye, color: '#10b981' },
  tool_calling: { label: '工具调用', Icon: Wrench, color: '#6366f1' },
  reasoning: { label: '推理', Icon: Brain, color: '#a855f7' },
  caching: { label: '缓存', Icon: Database, color: '#0ea5e9' },
  image_generation: { label: '图像生成', Icon: ImageIcon, color: '#f59e0b' },
  computer_use: { label: '电脑操作', Icon: Mouse, color: '#ef4444' },
};

const renderCapabilities = (caps, t) => {
  if (!caps || caps.length === 0) return '-';
  return (
    <div className='flex items-center gap-1.5 flex-wrap'>
      {caps.map((c) => {
        const meta = CAPABILITY_META[c];
        if (!meta) return null;
        const Icon = meta.Icon;
        return (
          <Tooltip key={c} content={t(meta.label)}>
            <span
              className='inline-flex items-center justify-center rounded-md px-1.5 py-0.5'
              style={{ background: `${meta.color}1a`, color: meta.color }}
            >
              <Icon size={14} strokeWidth={2} />
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
};

function renderQuotaType(type, t) {
  switch (type) {
    case 1:
      return (
        <Tag color='teal' shape='circle'>
          {t('按次计费')}
        </Tag>
      );
    case 0:
      return (
        <Tag color='violet' shape='circle'>
          {t('按量计费')}
        </Tag>
      );
    default:
      return t('未知');
  }
}

// Render vendor name
const renderVendor = (vendorName, vendorIcon, t) => {
  if (!vendorName) return '-';
  return (
    <Tag
      color='white'
      shape='circle'
      prefixIcon={getLobeHubIcon(vendorIcon || 'Layers', 14)}
    >
      {vendorName}
    </Tag>
  );
};

// Render tags list using RenderUtils
const renderTags = (text) => {
  if (!text) return '-';
  const tagsArr = text.split(',').filter((tag) => tag.trim());
  return renderLimitedItems({
    items: tagsArr,
    renderItem: (tag, idx) => (
      <Tag
        key={idx}
        color={stringToColor(tag.trim())}
        shape='circle'
        size='small'
      >
        {tag.trim()}
      </Tag>
    ),
    maxDisplay: 3,
  });
};

function renderSupportedEndpoints(endpoints) {
  if (!endpoints || endpoints.length === 0) {
    return null;
  }
  return (
    <Space wrap>
      {endpoints.map((endpoint, idx) => (
        <Tag key={endpoint} color={stringToColor(endpoint)} shape='circle'>
          {endpoint}
        </Tag>
      ))}
    </Space>
  );
}

// 把倍率转成「N 折」/「原价」/「Nx 倍率」文案
function formatDiscountText(ratio, t) {
  if (ratio == null || isNaN(ratio) || ratio <= 0) return null;
  if (Math.abs(ratio - 1) < 1e-6) return t('原价');
  if (ratio < 1) {
    const zhe = ratio * 10;
    const zheStr = Math.abs(zhe - Math.round(zhe)) < 1e-3
      ? String(Math.round(zhe))
      : zhe.toFixed(1);
    return `${t('享')} ${zheStr} ${t('折')}`;
  }
  return `${ratio}x`;
}

function ratioSourceLabel(source, t) {
  if (source === 'model') return t('模型专属倍率');
  if (source === 'user') return t('用户专属倍率');
  return t('分组倍率');
}

export const getPricingTableColumns = ({
  t,
  selectedGroup,
  groupRatio,
  usableGroup,
  copyText,
  setModalImageUrl,
  setIsModalOpenurl,
  currency,
  siteDisplayType,
  tokenUnit,
  displayPrice,
  showRatio,
  marketplaceMode = false,
}) => {
  const isMobile = useIsMobile();
  const priceDataCache = new WeakMap();
  const marketplacePriceDataCache = new WeakMap();

  const getPriceData = (record) => {
    let cache = priceDataCache.get(record);
    if (!cache) {
      cache = calculateModelPrice({
        record,
        selectedGroup,
        groupRatio,
        tokenUnit,
        displayPrice,
        currency,
        quotaDisplayType: siteDisplayType,
      });
      priceDataCache.set(record, cache);
    }
    return cache;
  };

  // marketplace 模式下，价格按行内 `_user_effective_ratio` 计算
  const getMarketplacePriceData = (record) => {
    let cache = marketplacePriceDataCache.get(record);
    if (!cache) {
      const eff = Number(record._user_effective_ratio) > 0
        ? Number(record._user_effective_ratio)
        : 1;
      const fakeGroup = '__user__';
      cache = calculateModelPrice({
        record,
        selectedGroup: fakeGroup,
        groupRatio: { [fakeGroup]: eff },
        tokenUnit,
        displayPrice,
        currency,
        quotaDisplayType: siteDisplayType,
      });
      marketplacePriceDataCache.set(record, cache);
    }
    return cache;
  };

  const endpointColumn = {
    title: t('可用端点类型'),
    dataIndex: 'supported_endpoint_types',
    render: (text, record, index) => {
      return renderSupportedEndpoints(text);
    },
  };

  const modelNameColumn = {
    title: t('模型名称'),
    dataIndex: 'model_name',
    render: (text, record, index) => {
      const tag = renderModelTag(text, {
        onClick: () => {
          copyText(text);
        },
      });
      const cp = record?.conditional_pricing;
      const hasConditional =
        (cp && Array.isArray(cp.conditions) && cp.conditions.length > 0) ||
        Number(record?.video_input_ratio) > 0;
      if (!hasConditional) return tag;
      return (
        <span className='inline-flex items-center gap-1.5 flex-wrap'>
          {tag}
          <Tooltip
            content={t(
              '同模型不同条件下单价不同(分辨率/Draft/输入是否含视频等),点击行查看详情',
            )}
          >
            <Tag size='small' color='violet' shape='circle'>
              {t('条件分价')}
            </Tag>
          </Tooltip>
        </span>
      );
    },
    onFilter: (value, record) =>
      record.model_name.toLowerCase().includes(value.toLowerCase()),
  };

  const quotaColumn = {
    title: t('计费类型'),
    dataIndex: 'quota_type',
    render: (text, record, index) => {
      return renderQuotaType(parseInt(text), t);
    },
    sorter: (a, b) => a.quota_type - b.quota_type,
  };

  const descriptionColumn = {
    title: t('描述'),
    dataIndex: 'description',
    render: (text) => renderDescription(text, 200),
  };

  const tagsColumn = {
    title: t('标签'),
    dataIndex: 'tags',
    render: renderTags,
  };

  const vendorColumn = {
    title: t('供应商'),
    dataIndex: 'vendor_name',
    render: (text, record) => renderVendor(text, record.vendor_icon, t),
  };

  const baseColumns = [
    modelNameColumn,
    vendorColumn,
    descriptionColumn,
    tagsColumn,
    quotaColumn,
  ];

  const capabilitiesColumn = {
    title: t('能力'),
    dataIndex: 'capabilities',
    width: 200,
    render: (caps) => renderCapabilities(caps, t),
  };

  // marketplace 模式下：每行显示当前用户对该模型的有效倍率与折扣
  // 多分组模型(enable_groups ∩ usableGroup > 1)按倍率升序逐行列出,
  // 让用户一眼看到能拿到的最低价。
  const discountColumn = {
    title: t('折扣'),
    dataIndex: '_user_effective_ratio',
    width: 160,
    sorter: (a, b) =>
      Number(a._user_effective_ratio || 1) - Number(b._user_effective_ratio || 1),
    render: (_v, record) => {
      // 计算交集分组（模型 enable_groups ∩ 用户 usableGroup,去掉 auto/空)
      const enableGroups = Array.isArray(record.enable_groups)
        ? record.enable_groups
        : [];
      const usable = usableGroup || {};
      const crossGroups = enableGroups
        .filter((g) => g && g !== 'auto' && usable[g] !== undefined)
        .map((g) => ({ name: g, ratio: Number(groupRatio?.[g]) || 1 }))
        .sort((a, b) => a.ratio - b.ratio);

      // 多分组：按倍率升序逐行列出
      if (crossGroups.length > 1) {
        return (
          <div className='flex flex-col gap-1'>
            {crossGroups.map(({ name, ratio }) => {
              const ratioText =
                Math.abs(ratio - 1) < 1e-6 ? '1x' : `${Number(ratio.toFixed(3))}x`;
              return (
                <div key={name} className='flex items-center gap-1'>
                  <Tag color='white' shape='circle' size='small'>
                    {name}
                  </Tag>
                  <Tag color='orange' shape='circle' size='small'>
                    {ratioText}
                  </Tag>
                </div>
              );
            })}
          </div>
        );
      }

      // 单分组(或无交集时退回 _user_effective_ratio):保持原渲染
      const ratio = Number(record._user_effective_ratio);
      if (!ratio || ratio <= 0) return <span className='text-gray-400'>-</span>;
      const text = formatDiscountText(ratio, t);
      const ratioText = Math.abs(ratio - 1) < 1e-6
        ? '1x'
        : `${Number(ratio.toFixed(3))}x`;
      const source = record._user_ratio_source;
      const tagColor =
        source === 'model' ? 'violet' : source === 'user' ? 'blue' : 'orange';
      return (
        <Tooltip content={ratioSourceLabel(source, t)}>
          <div className='flex flex-col gap-1'>
            <Tag color={tagColor} shape='circle' size='small'>
              {ratioText}
            </Tag>
            {text && (
              <span
                className='text-xs'
                style={{ color: 'var(--semi-color-text-2)' }}
              >
                {text}
              </span>
            )}
          </div>
        </Tooltip>
      );
    },
  };

  const ratioColumn = {
    title: () => (
      <div className='flex items-center space-x-1'>
        <span>{t('倍率')}</span>
        <Tooltip content={t('倍率是为了方便换算不同价格的模型')}>
          <IconHelpCircle
            className='text-blue-500 cursor-pointer'
            onClick={() => {
              setModalImageUrl('/ratio.png');
              setIsModalOpenurl(true);
            }}
          />
        </Tooltip>
      </div>
    ),
    dataIndex: 'model_ratio',
    render: (text, record, index) => {
      const completionRatio = parseFloat(record.completion_ratio.toFixed(3));
      const priceData = getPriceData(record);

      return (
        <div className='space-y-1'>
          <div className='text-gray-700'>
            {t('模型倍率')}：{record.quota_type === 0 ? text : t('无')}
          </div>
          <div className='text-gray-700'>
            {t('补全倍率')}：
            {record.quota_type === 0 ? completionRatio : t('无')}
          </div>
          <div className='text-gray-700'>
            {t('分组倍率')}：{priceData?.usedGroupRatio ?? '-'}
          </div>
        </div>
      );
    },
  };

  const priceColumn = {
    title: siteDisplayType === 'TOKENS' ? t('计费摘要') : t('模型价格'),
    dataIndex: 'model_price',
    ...(isMobile ? {} : { fixed: 'right' }),
    render: (text, record, index) => {
      const priceData = marketplaceMode
        ? getMarketplacePriceData(record)
        : getPriceData(record);
      const priceItems = getModelPriceItems(priceData, t, siteDisplayType);

      const rawDiscount = Number(record.vendor_discount);
      const hasDiscount =
        Number.isFinite(rawDiscount) && rawDiscount > 0 && rawDiscount < 1 &&
        siteDisplayType !== 'TOKENS'; // 倍率视图不展示折扣
      const discountText = hasDiscount
        ? formatDiscountText(rawDiscount, t)
        : null;

      return (
        <div className='space-y-1'>
          {hasDiscount && discountText && (
            <Tag color='red' size='small' shape='circle' className='mb-1'>
              {discountText}
            </Tag>
          )}
          {priceItems.map((item) => (
            <div key={item.key} className='text-gray-700'>
              {item.label}{' '}
              {item.originalValue && (
                <span className='line-through text-gray-400 mr-1'>
                  {item.originalValue}
                </span>
              )}
              <span className={item.originalValue ? 'text-red-600 font-medium' : ''}>
                {item.value}
              </span>
              {item.suffix}
            </div>
          ))}
        </div>
      );
    },
  };

  const columns = [...baseColumns];
  columns.push(endpointColumn);
  if (marketplaceMode) {
    columns.push(capabilitiesColumn);
    columns.push(discountColumn);
  }
  if (showRatio) {
    columns.push(ratioColumn);
  }
  columns.push(priceColumn);
  return columns;
};
