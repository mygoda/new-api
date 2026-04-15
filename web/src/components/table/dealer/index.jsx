import React from 'react';
import CardPro from '../../common/ui/CardPro';
import DealerUsersTableInner from './DealerUsersTableInner';
import AddDealerUserModal from './modals/AddDealerUserModal';
import EditDealerUserModal from './modals/EditDealerUserModal';
import TransferQuotaModal from './modals/TransferQuotaModal';
import ManageTokensModal from './modals/ManageTokensModal';
import { useDealerUsersData } from '../../../hooks/dealer/useDealerUsersData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination, renderQuota } from '../../../helpers';

const DealerUsersPage = () => {
  const data = useDealerUsersData();
  const isMobile = useIsMobile();

  const {
    showAddUser,
    showEditUser,
    showTransferQuota,
    showManageTokens,
    editingUser,
    selectedUser,
    quotaStats,
    closeAddUser,
    closeEditUser,
    closeTransferQuota,
    closeManageTokens,
    setShowAddUser,
    refresh,
    t,
  } = data;

  return (
    <>
      <AddDealerUserModal
        visible={showAddUser}
        handleClose={closeAddUser}
        createUser={data.createUser}
      />

      <EditDealerUserModal
        visible={showEditUser}
        handleClose={closeEditUser}
        editingUser={editingUser}
        updateUser={data.updateUser}
      />

      <TransferQuotaModal
        visible={showTransferQuota}
        handleClose={closeTransferQuota}
        user={selectedUser}
        transferQuota={data.transferQuota}
        dealerQuota={quotaStats?.dealer_quota}
      />

      <ManageTokensModal
        visible={showManageTokens}
        handleClose={closeManageTokens}
        user={selectedUser}
        t={t}
      />

      <CardPro
        type='type1'
        descriptionArea={
          <div className='flex items-center gap-4'>
            <span className='font-semibold text-lg'>{t('子用户管理')}</span>
            {quotaStats && (
              <div className='flex items-center gap-3 text-sm text-gray-500'>
                <span>
                  {t('我的额度')}: {renderQuota(quotaStats.dealer_quota)}
                </span>
                <span>
                  {t('已分配')}: {renderQuota(quotaStats.allocated_quota)}
                </span>
                <span>
                  {t('子用户数')}: {quotaStats.sub_user_count}
                </span>
              </div>
            )}
          </div>
        }
        actionsArea={
          <div className='flex flex-col md:flex-row justify-between items-center gap-2 w-full'>
            <div className='flex gap-2'>
              <button
                className='semi-button semi-button-primary'
                onClick={() => setShowAddUser(true)}
              >
                {t('创建用户')}
              </button>
            </div>
            <div className='flex gap-2 items-center'>
              <input
                className='semi-input'
                placeholder={t('搜索用户名')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    data.handleSearch(e.target.value);
                  }
                }}
                style={{ width: 200 }}
              />
            </div>
          </div>
        }
        paginationArea={createCardProPagination({
          currentPage: data.activePage,
          pageSize: data.pageSize,
          total: data.userCount,
          onPageChange: data.handlePageChange,
          onPageSizeChange: data.handlePageSizeChange,
          isMobile: isMobile,
          t: data.t,
        })}
        t={data.t}
      >
        <DealerUsersTableInner {...data} />
      </CardPro>
    </>
  );
};

export default DealerUsersPage;
