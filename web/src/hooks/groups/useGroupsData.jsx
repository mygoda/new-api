import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';

export const useGroupsData = () => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/group/list');
      const { success, message, data } = res.data;
      if (success) {
        setGroups(data || []);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const deleteGroup = useCallback(
    async (name, force = false) => {
      try {
        const res = await API.delete(
          `/api/group/${encodeURIComponent(name)}?force=${force}`,
        );
        const { success, message } = res.data;
        if (success) {
          showSuccess(t('删除成功'));
          await loadGroups();
        } else {
          showError(message);
          return false;
        }
        return true;
      } catch (error) {
        showError(t('删除失败'));
        return false;
      }
    },
    [t, loadGroups],
  );

  const openCreate = useCallback(() => {
    setEditingGroup(null);
    setShowEdit(true);
  }, []);

  const openEdit = useCallback((group) => {
    setEditingGroup(group);
    setShowEdit(true);
  }, []);

  const closeEdit = useCallback(() => {
    setShowEdit(false);
    setEditingGroup(null);
  }, []);

  const refresh = useCallback(() => {
    loadGroups();
  }, [loadGroups]);

  return {
    groups,
    loading,
    showEdit,
    editingGroup,
    loadGroups,
    deleteGroup,
    openCreate,
    openEdit,
    closeEdit,
    refresh,
    t,
  };
};
