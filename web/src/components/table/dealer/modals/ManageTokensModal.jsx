import React, { useState, useEffect } from 'react';
import {
  Modal,
  Table,
  Button,
  Space,
  Tag,
  Form,
  Empty,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { API, showError, showSuccess } from '../../../../helpers';

const ManageTokensModal = ({ visible, handleClose, user, t }) => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const loadTokens = async (page = 1) => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await API.get(
        `/api/dealer/users/${user.id}/tokens?p=${page}&page_size=${pageSize}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setTokens(data.items || []);
        setTotal(data.total || 0);
        setActivePage(data.page || page);
      } else {
        showError(message);
      }
    } catch (err) {
      showError(t('加载令牌失败'));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (visible && user) {
      loadTokens(1);
    }
  }, [visible, user]);

  const handleCreateToken = async (values) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const res = await API.post(`/api/dealer/users/${user.id}/tokens`, {
        name: values.name,
        remain_quota: values.remain_quota || 0,
        unlimited_quota: values.unlimited_quota || false,
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('令牌创建成功'));
        setShowAddToken(false);
        loadTokens(1);
      } else {
        showError(message);
      }
    } catch (err) {
      showError(t('创建失败'));
    }
    setSubmitting(false);
  };

  const handleDeleteToken = async (tokenId) => {
    if (!user) return;
    try {
      const res = await API.delete(
        `/api/dealer/users/${user.id}/tokens/${tokenId}`,
      );
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('删除成功'));
        loadTokens(activePage);
      } else {
        showError(message);
      }
    } catch (err) {
      showError(t('删除失败'));
    }
  };

  const columns = [
    {
      title: t('名称'),
      dataIndex: 'name',
      width: 150,
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
      title: t('已用'),
      dataIndex: 'used_quota',
      width: 100,
      render: (val) => val || 0,
    },
    {
      title: t('额度'),
      dataIndex: 'remain_quota',
      width: 100,
      render: (val, record) =>
        record.unlimited_quota ? t('无限') : val || 0,
    },
    {
      title: t('操作'),
      width: 80,
      render: (_, record) => (
        <Button
          type='danger'
          size='small'
          onClick={() => handleDeleteToken(record.id)}
        >
          {t('删除')}
        </Button>
      ),
    },
  ];

  if (!user) return null;

  return (
    <Modal
      title={t('令牌管理') + ` - ${user.username}`}
      visible={visible}
      onCancel={handleClose}
      footer={null}
      width={700}
      closeOnEsc
    >
      <div className='mb-3'>
        <Button size='small' onClick={() => setShowAddToken(true)}>
          {t('创建令牌')}
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={tokens}
        loading={loading}
        rowKey='id'
        pagination={{
          currentPage: activePage,
          pageSize: pageSize,
          total: total,
          onPageChange: (page) => loadTokens(page),
        }}
        empty={
          <Empty
            image={<IllustrationNoResult />}
            darkModeImage={<IllustrationNoResultDark />}
            description={t('暂无令牌')}
          />
        }
      />

      <Modal
        title={t('创建令牌')}
        visible={showAddToken}
        onCancel={() => setShowAddToken(false)}
        footer={null}
        closeOnEsc
      >
        <Form
          onSubmit={handleCreateToken}
          labelPosition='left'
          labelWidth={80}
        >
          <Form.Input
            field='name'
            label={t('名称')}
            placeholder={t('令牌名称')}
            rules={[{ required: true, message: t('名称不能为空') }]}
          />
          <Form.InputNumber
            field='remain_quota'
            label={t('额度')}
            min={0}
            initValue={0}
          />
          <Form.Switch
            field='unlimited_quota'
            label={t('无限额度')}
            initValue={false}
          />
          <div className='flex justify-end gap-2 mt-4'>
            <button
              className='semi-button'
              onClick={() => setShowAddToken(false)}
              type='button'
            >
              {t('取消')}
            </button>
            <button
              className='semi-button semi-button-primary'
              type='submit'
              disabled={submitting}
            >
              {submitting ? t('创建中...') : t('创建')}
            </button>
          </div>
        </Form>
      </Modal>
    </Modal>
  );
};

export default ManageTokensModal;
