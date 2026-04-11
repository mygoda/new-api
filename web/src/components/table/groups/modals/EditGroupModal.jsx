import React, { useState, useEffect, useRef } from 'react';
import {
  SideSheet,
  Form,
  Button,
  Space,
  Tag,
  Typography,
  Spin,
  Table,
  Collapsible,
} from '@douyinfe/semi-ui';
import { IconSave } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

const { Title } = Typography;

const EditGroupModal = ({ visible, editingGroup, handleClose, refresh }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const formApiRef = useRef();
  const [submitting, setSubmitting] = useState(false);
  const [channels, setChannels] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [showChannels, setShowChannels] = useState(false);

  const isEdit = !!editingGroup;

  useEffect(() => {
    if (visible && editingGroup) {
      formApiRef.current?.setValues({
        name: editingGroup.name,
        description: editingGroup.description || '',
        ratio: editingGroup.ratio ?? 1,
        is_auto: editingGroup.is_auto || false,
      });
      loadChannels(editingGroup.name);
    } else if (visible) {
      formApiRef.current?.setValues({
        name: '',
        description: '',
        ratio: 1,
        is_auto: false,
      });
      setChannels([]);
      setShowChannels(false);
    }
  }, [visible, editingGroup]);

  const loadChannels = async (name) => {
    setLoadingChannels(true);
    try {
      const res = await API.get(
        `/api/group/${encodeURIComponent(name)}/channels`,
      );
      if (res.data.success) {
        setChannels(res.data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      let res;
      if (isEdit) {
        res = await API.put('/api/group/', {
          name: editingGroup.name,
          description: values.description,
          ratio: values.ratio,
          is_auto: values.is_auto,
        });
      } else {
        res = await API.post('/api/group/', {
          name: values.name,
          description: values.description,
          ratio: values.ratio,
          is_auto: values.is_auto,
        });
      }
      const { success, message } = res.data;
      if (success) {
        showSuccess(isEdit ? t('更新成功') : t('创建成功'));
        handleClose();
        refresh();
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('操作失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const channelColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: t('名称'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('类型'),
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      key: 'status',
      render: (status) =>
        status === 1 ? (
          <Tag color='green'>{t('启用')}</Tag>
        ) : (
          <Tag color='red'>{t('禁用')}</Tag>
        ),
    },
  ];

  return (
    <SideSheet
      placement='right'
      title={
        <Space>
          <Tag color='blue' shape='circle'>
            {isEdit ? t('编辑') : t('新建')}
          </Tag>
          <Title heading={4} className='m-0'>
            {isEdit ? t('编辑分组') : t('创建分组')}
          </Title>
        </Space>
      }
      visible={visible}
      width={isMobile ? '100%' : 500}
      onCancel={handleClose}
      footer={
        <div className='flex justify-end items-center gap-2'>
          <Button
            theme='solid'
            loading={submitting}
            onClick={() => formApiRef.current?.submitForm()}
            icon={<IconSave />}
          >
            {t('提交')}
          </Button>
        </div>
      }
    >
      <div style={{ padding: '16px' }}>
        <Form
          getFormApi={(api) => (formApiRef.current = api)}
          onSubmit={handleSubmit}
          labelPosition='top'
        >
          <Form.Input
            field='name'
            label={t('分组名称')}
            placeholder={t('例如: vip, premium, test')}
            disabled={isEdit}
            rules={[
              { required: true, message: t('分组名称不能为空') },
              {
                pattern: /^[a-zA-Z0-9_-]+$/,
                message: t('只能包含字母、数字、下划线和连字符'),
              },
            ]}
          />

          <Form.TextArea
            field='description'
            label={t('描述')}
            placeholder={t('分组描述，会显示给用户')}
            autosize={{ minRows: 2, maxRows: 4 }}
          />

          <Form.InputNumber
            field='ratio'
            label={t('倍率')}
            min={0}
            step={0.1}
            extraText={t(
              '倍率用于调整该分组下用户的消费系数，1.0 为原价，0.5 为半价，2.0 为双倍',
            )}
          />

          <Form.Switch field='is_auto' label={t('加入自动分组')} />

          {isEdit && (
            <div style={{ marginTop: 16 }}>
              <Button
                type='tertiary'
                onClick={() => setShowChannels(!showChannels)}
              >
                {t('关联渠道')} ({channels.length})
              </Button>
              <Collapsible isOpen={showChannels}>
                <div style={{ marginTop: 8 }}>
                  <Spin spinning={loadingChannels}>
                    <Table
                      columns={channelColumns}
                      dataSource={channels}
                      rowKey='id'
                      pagination={false}
                      size='small'
                      empty={t('暂无关联渠道')}
                    />
                  </Spin>
                </div>
              </Collapsible>
            </div>
          )}
        </Form>
      </div>
    </SideSheet>
  );
};

export default EditGroupModal;
