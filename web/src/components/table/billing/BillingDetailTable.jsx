import React, { useMemo } from 'react';
import { Empty } from '@douyinfe/semi-ui';
import CardTable from '../../common/ui/CardTable';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { getDetailColumns } from './BillingColumnDefs';

const BillingDetailTable = ({
  details,
  detailLoading,
  detailPage,
  detailPageSize,
  detailTotal,
  handleDetailPageChange,
  handleDetailPageSizeChange,
  isAdminUser,
  t,
}) => {
  const columns = useMemo(
    () => getDetailColumns(t, isAdminUser),
    [t, isAdminUser]
  );

  return (
    <CardTable
      columns={columns}
      dataSource={details}
      rowKey='key'
      loading={detailLoading}
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
        currentPage: detailPage,
        pageSize: detailPageSize,
        total: detailTotal,
        pageSizeOptions: [10, 20, 50, 100],
        showSizeChanger: true,
        onPageSizeChange: (size) => handleDetailPageSizeChange(size),
        onPageChange: handleDetailPageChange,
      }}
      hidePagination={true}
    />
  );
};

export default BillingDetailTable;
