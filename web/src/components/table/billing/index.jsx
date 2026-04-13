import React from 'react';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import CardPro from '../../common/ui/CardPro';
import BillingFilters from './BillingFilters';
import BillingDetailTable from './BillingDetailTable';
import BillingSummaryTable from './BillingSummaryTable';
import { useBillingData } from '../../../hooks/billing/useBillingData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';

const BillingPage = () => {
  const billingData = useBillingData();
  const isMobile = useIsMobile();

  const isDetail = billingData.activeTab === 'detail';

  const paginationProps = isDetail
    ? {
        currentPage: billingData.detailPage,
        pageSize: billingData.detailPageSize,
        total: billingData.detailTotal,
        onPageChange: billingData.handleDetailPageChange,
        onPageSizeChange: billingData.handleDetailPageSizeChange,
      }
    : {
        currentPage: billingData.summaryPage,
        pageSize: billingData.summaryPageSize,
        total: billingData.summaryTotal,
        onPageChange: billingData.handleSummaryPageChange,
        onPageSizeChange: billingData.handleSummaryPageSizeChange,
      };

  return (
    <CardPro
      type='type2'
      searchArea={<BillingFilters {...billingData} />}
      paginationArea={createCardProPagination({
        ...paginationProps,
        isMobile: isMobile,
        t: billingData.t,
      })}
      t={billingData.t}
    >
      <Tabs
        type='line'
        activeKey={billingData.activeTab}
        onChange={billingData.setActiveTab}
        size='small'
        style={{ marginBottom: 0 }}
      >
        <TabPane tab={billingData.t('按天汇总')} itemKey='day' />
        <TabPane tab={billingData.t('按Token汇总')} itemKey='token' />
        <TabPane tab={billingData.t('按模型汇总')} itemKey='model' />
        <TabPane tab={billingData.t('账单明细')} itemKey='detail' />
      </Tabs>

      {isDetail ? (
        <BillingDetailTable {...billingData} />
      ) : (
        <BillingSummaryTable {...billingData} />
      )}
    </CardPro>
  );
};

export default BillingPage;
