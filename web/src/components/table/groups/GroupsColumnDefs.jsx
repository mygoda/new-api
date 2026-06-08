import React from 'react';
import { Tag, Space, Button, Popconfirm } from '@douyinfe/semi-ui';
import { IconEdit, IconDelete } from '@douyinfe/semi-icons';

export const getGroupsColumns = ({ t, onEdit, onDelete }) => {
  return [
    {
      title: t('分组名称'),
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <Tag size='large' color='blue'>
          {text}
        </Tag>
      ),
    },
    {
      title: t('描述'),
      dataIndex: 'description',
      key: 'description',
      render: (text) => text || '-',
    },
    {
      title: t('倍率'),
      dataIndex: 'ratio',
      key: 'ratio',
      render: (value) => (
        <Tag color={value < 1 ? 'green' : value > 1 ? 'red' : 'grey'}>
          {value}
        </Tag>
      ),
    },
    {
      title: t('关联渠道'),
      dataIndex: 'channel_count',
      key: 'channel_count',
    },
    {
      title: t('关联用户'),
      dataIndex: 'user_count',
      key: 'user_count',
    },
    {
      title: t('自动分组'),
      dataIndex: 'is_auto',
      key: 'is_auto',
      render: (value) =>
        value ? (
          <Tag color='green'>{t('是')}</Tag>
        ) : (
          <Tag color='grey'>{t('否')}</Tag>
        ),
    },
    {
      title: t('全局可见'),
      dataIndex: 'is_global',
      key: 'is_global',
      render: (value) =>
        value !== false ? (
          <Tag color='green'>{t('全局')}</Tag>
        ) : (
          <Tag color='grey'>{t('私有')}</Tag>
        ),
    },
    {
      title: t('操作'),
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            theme='light'
            type='tertiary'
            icon={<IconEdit />}
            onClick={() => onEdit(record)}
          />
          <Popconfirm
            title={t('确认删除')}
            content={
              record.channel_count > 0 || record.user_count > 0
                ? t(
                    '该分组仍有关联渠道或用户，删除后这些关联不会自动清除，确认删除？',
                  )
                : t('确认删除该分组？')
            }
            onConfirm={() => onDelete(record.name)}
            okText={t('确认')}
            cancelText={t('取消')}
          >
            <Button
              theme='light'
              type='danger'
              icon={<IconDelete />}
              disabled={record.name === 'default'}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];
};
