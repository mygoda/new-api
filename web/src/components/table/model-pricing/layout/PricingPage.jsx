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

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout, ImagePreview, Tag, Tooltip } from '@douyinfe/semi-ui';
import { Sparkles } from 'lucide-react';
import PricingSidebar from './PricingSidebar';
import PricingContent from './content/PricingContent';
import ModelDetailSideSheet from '../modal/ModelDetailSideSheet';
import MarketplaceDetailSideSheet from '../modal/MarketplaceDetailSideSheet';
import { useModelPricingData } from '../../../../hooks/model-pricing/useModelPricingData';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import { API } from '../../../../helpers';

// 把倍率转成「N 折」文案，整数和小数兼容
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
  return `${ratio}x ${t('倍率')}`;
}

const UserDiscountBanner = ({ userGroup, ratio, hasOverride, t }) => {
  const discountText = formatDiscountText(ratio, t);
  return (
    <div className='px-4 sm:px-6 lg:px-8 pt-4'>
      <div
        className='flex items-center flex-wrap gap-2 rounded-2xl px-4 py-3 border'
        style={{
          background: 'var(--semi-color-info-light-default)',
          borderColor: 'var(--semi-color-info-light-active)',
        }}
      >
        <Sparkles size={16} color='var(--semi-color-info)' />
        <span
          className='text-sm font-medium'
          style={{ color: 'var(--semi-color-info)' }}
        >
          {t('您的分组')}：
        </span>
        <Tag color='blue' shape='circle' size='small'>
          {userGroup || t('默认')}
        </Tag>
        {ratio != null && (
          <Tag color='orange' shape='circle' size='small'>
            {Number(ratio).toFixed(2).replace(/\.?0+$/, '')}x
          </Tag>
        )}
        {discountText && (
          <Tag color='red' shape='circle' size='small'>
            {discountText}
          </Tag>
        )}
        {hasOverride && (
          <Tooltip content={t('管理员为该账号设置了专属倍率，已覆盖默认分组倍率')}>
            <Tag color='violet' shape='circle' size='small'>
              {t('专属倍率')}
            </Tag>
          </Tooltip>
        )}
        <span
          className='text-xs ml-auto'
          style={{ color: 'var(--semi-color-text-2)' }}
        >
          {t('下方价格已按您的实际倍率换算')}
        </span>
      </div>
    </div>
  );
};

const PricingPage = ({ marketplaceMode = false } = {}) => {
  const { t } = useTranslation();
  const pricingData = useModelPricingData();
  const { Sider, Content } = Layout;
  const isMobile = useIsMobile();
  const [showRatio, setShowRatio] = React.useState(false);
  const [viewMode, setViewMode] = React.useState(
    marketplaceMode ? 'table' : 'card',
  );

  // marketplaceMode 下额外加载 admin-only 字段（capabilities/max_output_tokens/...）
  const [marketplaceMeta, setMarketplaceMeta] = useState({});
  const [marketplaceLoading, setMarketplaceLoading] = useState(marketplaceMode);
  useEffect(() => {
    if (!marketplaceMode) return;
    let cancelled = false;
    setMarketplaceLoading(true);
    (async () => {
      try {
        const res = await API.get('/api/marketplace/models');
        const { success, data } = res.data;
        if (success && !cancelled) {
          const map = {};
          for (const m of data || []) {
            map[m.model_name] = m;
          }
          setMarketplaceMeta(map);
        }
      } catch (_) {
        // ignore — 普通模型广场字段照常显示
      } finally {
        if (!cancelled) setMarketplaceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [marketplaceMode]);

  // marketplaceMode 下：仅展示「模型管理」中已配置的模型；同时把扩展字段合并进去
  const filteredModels = useMemo(() => {
    if (!marketplaceMode) return pricingData.filteredModels;
    return (pricingData.filteredModels || [])
      .filter((m) => marketplaceMeta[m.model_name])
      .map((m) => {
        const extra = marketplaceMeta[m.model_name];
        return {
          ...m,
          capabilities: extra.capabilities || [],
          max_output_tokens: extra.max_output_tokens,
          knowledge_cutoff: extra.knowledge_cutoff,
          long_description: extra.long_description,
        };
      });
  }, [pricingData.filteredModels, marketplaceMeta, marketplaceMode]);

  // 选中模型也要带上 marketplace 扩展字段
  const selectedModel = useMemo(() => {
    if (!marketplaceMode || !pricingData.selectedModel) return pricingData.selectedModel;
    const extra = marketplaceMeta[pricingData.selectedModel.model_name];
    if (!extra) return pricingData.selectedModel;
    return {
      ...pricingData.selectedModel,
      capabilities: extra.capabilities || [],
      max_output_tokens: extra.max_output_tokens,
      knowledge_cutoff: extra.knowledge_cutoff,
      long_description: extra.long_description,
    };
  }, [pricingData.selectedModel, marketplaceMeta, marketplaceMode]);

  // marketplaceMode 下：基于当前用户分组 / 专属倍率，计算实际有效倍率，并把价格列锚定到该倍率
  const userInfo = pricingData.userState?.user;
  const userGroupName = userInfo?.group || 'default';
  const userOverrideRatio = Number(userInfo?.user_ratio) || 0;
  const userGroupRatio = pricingData.groupRatio?.[userGroupName];
  const effectiveUserRatio = userOverrideRatio > 0
    ? userOverrideRatio
    : (typeof userGroupRatio === 'number' ? userGroupRatio : 1);

  // 把当前用户的分组倍率注入 groupRatio map（覆盖专属倍率），供 calculateModelPrice 直接复用
  const adjustedGroupRatio = useMemo(() => {
    if (!marketplaceMode) return pricingData.groupRatio;
    if (!pricingData.groupRatio) return pricingData.groupRatio;
    if (userOverrideRatio > 0) {
      return { ...pricingData.groupRatio, [userGroupName]: userOverrideRatio };
    }
    return pricingData.groupRatio;
  }, [marketplaceMode, pricingData.groupRatio, userGroupName, userOverrideRatio]);

  const allProps = {
    ...pricingData,
    filteredModels,
    showRatio,
    setShowRatio,
    viewMode,
    setViewMode,
    marketplaceMode,
    // marketplaceMode 下，loading 还要把 marketplace meta 的拉取也算进来，避免空白闪烁
    ...(marketplaceMode
      ? {
          loading: pricingData.loading || marketplaceLoading,
          // 把表格价格锚定到当前用户的分组倍率，体现「专属折扣」
          selectedGroup: userGroupName,
          groupRatio: adjustedGroupRatio,
        }
      : {}),
    // marketplace 模式下，强制以美元价格展示，避免价格列退化为「X 倍率」形式
    ...(marketplaceMode && pricingData.siteDisplayType === 'TOKENS'
      ? { siteDisplayType: 'USD' }
      : {}),
  };

  return (
    <div className='bg-white'>
      {marketplaceMode && (
        <UserDiscountBanner
          userGroup={userGroupName}
          ratio={effectiveUserRatio}
          hasOverride={userOverrideRatio > 0}
          t={t}
        />
      )}
      <Layout className='pricing-layout'>
        {!isMobile && (
          <Sider className='pricing-scroll-hide pricing-sidebar'>
            <PricingSidebar {...allProps} />
          </Sider>
        )}

        <Content className='pricing-scroll-hide pricing-content'>
          <PricingContent
            {...allProps}
            isMobile={isMobile}
            sidebarProps={allProps}
          />
        </Content>
      </Layout>

      <ImagePreview
        src={pricingData.modalImageUrl}
        visible={pricingData.isModalOpenurl}
        onVisibleChange={(visible) => pricingData.setIsModalOpenurl(visible)}
      />

      {marketplaceMode ? (
        <MarketplaceDetailSideSheet
          visible={pricingData.showModelDetail}
          onClose={pricingData.closeModelDetail}
          modelData={selectedModel}
          groupRatio={pricingData.groupRatio}
          usableGroup={pricingData.usableGroup}
          currency={pricingData.currency}
          siteDisplayType={pricingData.siteDisplayType}
          tokenUnit={pricingData.tokenUnit}
          displayPrice={pricingData.displayPrice}
          showRatio={showRatio}
          vendorsMap={pricingData.vendorsMap}
          endpointMap={pricingData.endpointMap}
          autoGroups={pricingData.autoGroups}
          t={pricingData.t}
        />
      ) : (
        <ModelDetailSideSheet
          visible={pricingData.showModelDetail}
          onClose={pricingData.closeModelDetail}
          modelData={pricingData.selectedModel}
          groupRatio={pricingData.groupRatio}
          usableGroup={pricingData.usableGroup}
          currency={pricingData.currency}
          siteDisplayType={pricingData.siteDisplayType}
          tokenUnit={pricingData.tokenUnit}
          displayPrice={pricingData.displayPrice}
          showRatio={showRatio}
          vendorsMap={pricingData.vendorsMap}
          endpointMap={pricingData.endpointMap}
          autoGroups={pricingData.autoGroups}
          t={pricingData.t}
        />
      )}
    </div>
  );
};

export default PricingPage;
