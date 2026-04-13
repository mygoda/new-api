import React, { useMemo } from 'react';
import { Empty } from '@douyinfe/semi-ui';
import CardTable from '../../common/ui/CardTable';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { getSummaryColumns } from './BillingColumnDefs';

const BillingSummaryTable = ({
  summaryData,
  summaryLoading,
  summaryPage,
  summaryPageSize,
  summaryTotal,
  handleSummaryPageChange,
  handleSummaryPageSizeChange,
  activeTab,
  t,
}) => {
  const columns = useMemo(
    () => getSummaryColumns(t, activeTab),
    [t, activeTab]
  );

  return (
    <CardTable
      columns={columns}
      dataSource={summaryData}
      rowKey='key'
      loading={summaryLoading}
      scroll={{ x: 'max-content' }}
      className='rounded-xl overflow-hidden'
      size='small'
      empty={
        <Empty
          image={<IllustrationNoResult />}
          darkModeImage={<IllustrationNoResultDark />}
          description={t('暂无数据')}
        />
      }
      pagination={{
        currentPage: summaryPage,
        pageSize: summaryPageSize,
        total: summaryTotal,
        pageSizeOptions: [10, 20, 50, 100],
        showSizeChanger: true,
        onPageSizeChange: (size) => handleSummaryPageSizeChange(size),
        onPageChange: handleSummaryPageChange,
      }}
      hidePagination={true}
    />
  );
};

export default BillingSummaryTable;
