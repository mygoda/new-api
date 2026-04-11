import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';

const GroupsActions = ({ t, onCreateClick }) => {
  return (
    <Button
      theme='light'
      type='primary'
      icon={<IconPlus />}
      onClick={onCreateClick}
    >
      {t('创建分组')}
    </Button>
  );
};

export default GroupsActions;
