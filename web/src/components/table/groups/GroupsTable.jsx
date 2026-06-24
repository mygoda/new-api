import React, { useMemo } from 'react';
import { Table } from '@douyinfe/semi-ui';
import { getGroupsColumns } from './GroupsColumnDefs';

const GroupsTable = ({ groups, loading, t, onEdit, onDelete }) => {
  const columns = useMemo(
    () => getGroupsColumns({ t, onEdit, onDelete }),
    [t, onEdit, onDelete],
  );

  return (
    <Table
      columns={columns}
      dataSource={groups}
      loading={loading}
      rowKey='name'
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        pageSizeOpts: [10, 20, 50, 100],
        formatPageText: (page) =>
          t('第 {{start}} - {{end}} 条，共 {{total}} 条', {
            start: page.currentStart,
            end: page.currentEnd,
            total: page.total,
          }),
      }}
      size='middle'
      empty={t('暂无数据')}
    />
  );
};

export default GroupsTable;
