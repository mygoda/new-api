import React, { useMemo, useState } from 'react';
import { Empty, Button, Space, Tag, Modal } from '@douyinfe/semi-ui';
import CardTable from '../../common/ui/CardTable';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { renderQuota } from '../../../helpers';

const DealerUsersTableInner = (data) => {
  const {
    users,
    loading,
    setEditingUser,
    setShowEditUser,
    setSelectedUser,
    setShowTransferQuota,
    setShowManageTokens,
    manageUser,
    deleteUser,
    t,
  } = data;

  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const columns = useMemo(
    () => [
      {
        title: 'ID',
        dataIndex: 'id',
        width: 60,
      },
      {
        title: t('用户名'),
        dataIndex: 'username',
        width: 120,
      },
      {
        title: t('显示名'),
        dataIndex: 'display_name',
        width: 120,
        render: (text) => text || '-',
      },
      {
        title: t('定价倍率'),
        dataIndex: 'dealer_ratio',
        width: 100,
        render: (val) => (
          <Tag color={val > 1 ? 'amber' : val < 1 ? 'green' : 'blue'} shape='circle'>
            {val}x
          </Tag>
        ),
      },
      {
        title: t('剩余额度'),
        dataIndex: 'quota',
        width: 120,
        render: (val) => renderQuota(val),
      },
      {
        title: t('已用额度'),
        dataIndex: 'used_quota',
        width: 120,
        render: (val) => renderQuota(val),
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        width: 80,
        render: (status) => {
          if (status === 1) {
            return (
              <Tag color='green' shape='circle'>
                {t('已启用')}
              </Tag>
            );
          }
          return (
            <Tag color='red' shape='circle'>
              {t('已禁用')}
            </Tag>
          );
        },
      },
      {
        title: t('备注'),
        dataIndex: 'dealer_remark',
        width: 120,
        render: (text) => text || '-',
      },
      {
        title: t('操作'),
        dataIndex: 'actions',
        width: 280,
        render: (_, record) => (
          <Space>
            {record.status === 1 ? (
              <Button
                type='danger'
                size='small'
                onClick={() => manageUser(record.id, 'disable')}
              >
                {t('禁用')}
              </Button>
            ) : (
              <Button
                size='small'
                onClick={() => manageUser(record.id, 'enable')}
              >
                {t('启用')}
              </Button>
            )}
            <Button
              type='tertiary'
              size='small'
              onClick={() => {
                setEditingUser(record);
                setShowEditUser(true);
              }}
            >
              {t('编辑')}
            </Button>
            <Button
              size='small'
              onClick={() => {
                setSelectedUser(record);
                setShowTransferQuota(true);
              }}
            >
              {t('充值')}
            </Button>
            <Button
              size='small'
              onClick={() => {
                setSelectedUser(record);
                setShowManageTokens(true);
              }}
            >
              {t('令牌')}
            </Button>
            <Button
              type='danger'
              size='small'
              onClick={() => setDeleteConfirm(record)}
            >
              {t('删除')}
            </Button>
          </Space>
        ),
      },
    ],
    [t, manageUser, setEditingUser, setShowEditUser, setSelectedUser, setShowTransferQuota, setShowManageTokens, deleteUser],
  );

  return (
    <>
      <CardTable
        columns={columns}
        dataSource={users}
        loading={loading}
        rowKey='id'
        empty={
          <Empty
            image={<IllustrationNoResult />}
            darkModeImage={<IllustrationNoResultDark />}
            description={t('暂无数据')}
          />
        }
      />
      <Modal
        title={t('确认删除')}
        visible={!!deleteConfirm}
        onOk={async () => {
          if (deleteConfirm) {
            await deleteUser(deleteConfirm.id);
            setDeleteConfirm(null);
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
      >
        <p>
          {t('确定要删除用户')} <strong>{deleteConfirm?.username}</strong> {t('吗？此操作不可恢复。')}
        </p>
      </Modal>
    </>
  );
};

export default DealerUsersTableInner;
