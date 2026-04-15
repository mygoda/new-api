import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';

export const useDealerUsersData = () => {
  const { t } = useTranslation();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [searching, setSearching] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [quotaStats, setQuotaStats] = useState(null);

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [showTransferQuota, setShowTransferQuota] = useState(false);
  const [showManageTokens, setShowManageTokens] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  // Search
  const [searchKeyword, setSearchKeyword] = useState('');

  const setUserFormat = (users) => {
    for (let i = 0; i < users.length; i++) {
      users[i].key = users[i].id;
    }
    setUsers(users);
  };

  const loadUsers = async (page, size) => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/dealer/users?p=${page}&page_size=${size}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setActivePage(data.page);
        setUserCount(data.total);
        setUserFormat(data.items || []);
      } else {
        showError(message);
      }
    } catch (err) {
      showError(t('加载失败'));
    }
    setLoading(false);
  };

  const searchUsers = async (page, size, keyword) => {
    if (!keyword) {
      await loadUsers(page, size);
      return;
    }
    setSearching(true);
    try {
      const res = await API.get(
        `/api/dealer/users/search?keyword=${keyword}&p=${page}&page_size=${size}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setActivePage(data.page);
        setUserCount(data.total);
        setUserFormat(data.items || []);
      } else {
        showError(message);
      }
    } catch (err) {
      showError(t('搜索失败'));
    }
    setSearching(false);
  };

  const loadQuotaStats = async () => {
    try {
      const res = await API.get('/api/dealer/quota/stats');
      const { success, data } = res.data;
      if (success) {
        setQuotaStats(data);
      }
    } catch (err) {
      // ignore
    }
  };

  const createUser = async (userData) => {
    try {
      const res = await API.post('/api/dealer/users', userData);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('用户创建成功'));
        refresh();
        return true;
      } else {
        showError(message);
        return false;
      }
    } catch (err) {
      showError(t('创建失败'));
      return false;
    }
  };

  const updateUser = async (userData) => {
    try {
      const res = await API.put('/api/dealer/users', userData);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('更新成功'));
        refresh();
        return true;
      } else {
        showError(message);
        return false;
      }
    } catch (err) {
      showError(t('更新失败'));
      return false;
    }
  };

  const deleteUser = async (userId) => {
    try {
      const res = await API.delete(`/api/dealer/users/${userId}`);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('删除成功'));
        refresh();
        return true;
      } else {
        showError(message);
        return false;
      }
    } catch (err) {
      showError(t('删除失败'));
      return false;
    }
  };

  const manageUser = async (userId, action) => {
    try {
      const res = await API.post('/api/dealer/users/manage', {
        user_id: userId,
        action,
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('操作成功'));
        refresh();
        return true;
      } else {
        showError(message);
        return false;
      }
    } catch (err) {
      showError(t('操作失败'));
      return false;
    }
  };

  const transferQuota = async (userId, quota) => {
    try {
      const res = await API.post('/api/dealer/quota/transfer', {
        user_id: userId,
        quota,
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('额度转移成功'));
        refresh();
        loadQuotaStats();
        return true;
      } else {
        showError(message);
        return false;
      }
    } catch (err) {
      showError(t('转移失败'));
      return false;
    }
  };

  const handlePageChange = (page) => {
    setActivePage(page);
    if (searchKeyword) {
      searchUsers(page, pageSize, searchKeyword);
    } else {
      loadUsers(page, pageSize);
    }
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setActivePage(1);
    if (searchKeyword) {
      searchUsers(1, size, searchKeyword);
    } else {
      loadUsers(1, size);
    }
  };

  const handleSearch = (keyword) => {
    setSearchKeyword(keyword);
    setActivePage(1);
    searchUsers(1, pageSize, keyword);
  };

  const refresh = () => {
    if (searchKeyword) {
      searchUsers(activePage, pageSize, searchKeyword);
    } else {
      loadUsers(activePage, pageSize);
    }
  };

  const closeAddUser = () => setShowAddUser(false);
  const closeEditUser = () => {
    setShowEditUser(false);
    setEditingUser(null);
  };
  const closeTransferQuota = () => {
    setShowTransferQuota(false);
    setSelectedUser(null);
  };
  const closeManageTokens = () => {
    setShowManageTokens(false);
    setSelectedUser(null);
  };

  useEffect(() => {
    loadUsers(1, pageSize);
    loadQuotaStats();
  }, []);

  return {
    users,
    loading,
    activePage,
    pageSize,
    searching,
    userCount,
    quotaStats,

    showAddUser,
    showEditUser,
    showTransferQuota,
    showManageTokens,
    editingUser,
    selectedUser,
    searchKeyword,

    setShowAddUser,
    setShowEditUser,
    setShowTransferQuota,
    setShowManageTokens,
    setEditingUser,
    setSelectedUser,

    loadUsers,
    searchUsers,
    createUser,
    updateUser,
    deleteUser,
    manageUser,
    transferQuota,
    loadQuotaStats,

    handlePageChange,
    handlePageSizeChange,
    handleSearch,
    refresh,
    closeAddUser,
    closeEditUser,
    closeTransferQuota,
    closeManageTokens,

    t,
  };
};
