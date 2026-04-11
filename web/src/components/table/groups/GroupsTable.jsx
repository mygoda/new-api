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
      pagination={false}
      size='middle'
      empty={t('暂无数据')}
    />
  );
};

export default GroupsTable;
