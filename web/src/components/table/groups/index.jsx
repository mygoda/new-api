import React, { useEffect } from 'react';
import CardPro from '../../common/ui/CardPro';
import GroupsTableComponent from './GroupsTable';
import GroupsActions from './GroupsActions';
import EditGroupModal from './modals/EditGroupModal';
import { useGroupsData } from '../../../hooks/groups/useGroupsData';

const GroupsPage = () => {
  const groupsData = useGroupsData();

  useEffect(() => {
    groupsData.loadGroups();
  }, []);

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
          />
        }
        t={groupsData.t}
      >
        <GroupsTableComponent
          groups={groupsData.groups}
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
