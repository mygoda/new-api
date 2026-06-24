import React, { useEffect, useMemo, useState } from 'react';
import CardPro from '../../common/ui/CardPro';
import GroupsTableComponent from './GroupsTable';
import GroupsActions from './GroupsActions';
import EditGroupModal from './modals/EditGroupModal';
import { useGroupsData } from '../../../hooks/groups/useGroupsData';

const GroupsPage = () => {
  const groupsData = useGroupsData();
  const [keyword, setKeyword] = useState('');
  const [visibility, setVisibility] = useState('all');

  useEffect(() => {
    groupsData.loadGroups();
  }, []);

  const filteredGroups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return (groupsData.groups || []).filter((g) => {
      // is_global !== false 视为全局（与列渲染口径一致，缺省=全局）
      if (visibility === 'global' && g.is_global === false) return false;
      if (visibility === 'private' && g.is_global !== false) return false;
      if (!kw) return true;
      return (
        (g.name || '').toLowerCase().includes(kw) ||
        (g.description || '').toLowerCase().includes(kw)
      );
    });
  }, [groupsData.groups, keyword, visibility]);

  return (
    <>
      <EditGroupModal
        visible={groupsData.showEdit}
        editingGroup={groupsData.editingGroup}
        handleClose={groupsData.closeEdit}
        refresh={groupsData.refresh}
      />

      <CardPro
        type='type1'
        actionsArea={
          <GroupsActions
            t={groupsData.t}
            onCreateClick={groupsData.openCreate}
            keyword={keyword}
            onKeywordChange={setKeyword}
            visibility={visibility}
            onVisibilityChange={setVisibility}
          />
        }
        t={groupsData.t}
      >
        <GroupsTableComponent
          groups={filteredGroups}
          loading={groupsData.loading}
          t={groupsData.t}
          onEdit={groupsData.openEdit}
          onDelete={(name) => groupsData.deleteGroup(name, true)}
        />
      </CardPro>
    </>
  );
};

export default GroupsPage;
