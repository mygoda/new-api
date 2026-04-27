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
import { Layout, ImagePreview } from '@douyinfe/semi-ui';
import PricingSidebar from './PricingSidebar';
import PricingContent from './content/PricingContent';
import ModelDetailSideSheet from '../modal/ModelDetailSideSheet';
import MarketplaceDetailSideSheet from '../modal/MarketplaceDetailSideSheet';
import { useModelPricingData } from '../../../../hooks/model-pricing/useModelPricingData';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import { API } from '../../../../helpers';

const PricingPage = ({ marketplaceMode = false } = {}) => {
  const pricingData = useModelPricingData();
  const { Sider, Content } = Layout;
  const isMobile = useIsMobile();
  const [showRatio, setShowRatio] = React.useState(false);
  const [viewMode, setViewMode] = React.useState(
    marketplaceMode ? 'table' : 'card',
  );

  // marketplaceMode 下额外加载 admin-only 字段（capabilities/max_output_tokens/...）
  const [marketplaceMeta, setMarketplaceMeta] = useState({});
  useEffect(() => {
    if (!marketplaceMode) return;
    let cancelled = false;
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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [marketplaceMode]);

  // 把 marketplace 字段合并到模型对象中，供 SideSheet 直接读取
  const filteredModels = useMemo(() => {
    if (!marketplaceMode) return pricingData.filteredModels;
    return (pricingData.filteredModels || []).map((m) => {
      const extra = marketplaceMeta[m.model_name];
      if (!extra) return m;
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

  const allProps = {
    ...pricingData,
    filteredModels,
    showRatio,
    setShowRatio,
    viewMode,
    setViewMode,
    marketplaceMode,
  };

  return (
    <div className='bg-white'>
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
