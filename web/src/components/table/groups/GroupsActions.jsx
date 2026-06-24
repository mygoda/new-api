import React from 'react';
import { Button, Input, Select, Space } from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';

const GroupsActions = ({
  t,
  onCreateClick,
  keyword,
  onKeywordChange,
  visibility,
  onVisibilityChange,
}) => {
  return (
    <Space wrap>
      <Input
        prefix={<IconSearch />}
        placeholder={t('搜索分组名称或描述')}
        value={keyword}
        onChange={onKeywordChange}
        showClear
        style={{ width: 240 }}
      />
      <Select
        value={visibility}
        onChange={onVisibilityChange}
        style={{ width: 120 }}
        optionList={[
          { label: t('全部'), value: 'all' },
          { label: t('全局'), value: 'global' },
          { label: t('私有'), value: 'private' },
        ]}
      />
      <Button
        theme='light'
        type='primary'
        icon={<IconPlus />}
        onClick={onCreateClick}
      >
        {t('创建分组')}
      </Button>
    </Space>
  );
};

export default GroupsActions;
