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
  InputNumber,
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
  const [allChannels, setAllChannels] = useState([]);

  const isEdit = !!editingGroup;

  const channelOptions = allChannels.map((ch) => ({
    label: `#${ch.id} ${ch.name}`,
    value: ch.id,
  }));

  const loadAllChannels = async () => {
    try {
      const res = await API.get('/api/group/all_channels');
      if (res.data.success) {
        setAllChannels(res.data.data || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (visible) {
      loadAllChannels();
    }
  }, [visible]);

  useEffect(() => {
    if (visible && editingGroup) {
      formApiRef.current?.setValues({
        name: editingGroup.name,
        description: editingGroup.description || '',
        ratio: editingGroup.ratio ?? 1,
        is_auto: editingGroup.is_auto || false,
        is_global: editingGroup.is_global !== false,
        channel_ids: [],
        fallback_channel_id: editingGroup.fallback_channel_id || undefined,
      });
      loadChannels(editingGroup.name);
    } else if (visible) {
      formApiRef.current?.setValues({
        name: '',
        description: '',
        ratio: 1,
        is_auto: false,
        is_global: true,
        channel_ids: [],
        fallback_channel_id: undefined,
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
        const list = res.data.data || [];
        setChannels(list);
        formApiRef.current?.setValue(
          'channel_ids',
          list.map((ch) => ch.id),
        );
      }
    } catch {
      // ignore
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleUpdateChannelWeight = async (channelId, weight) => {
    try {
      const res = await API.put(
        `/api/group/${encodeURIComponent(editingGroup.name)}/channel_weight`,
        { channel_id: channelId, weight },
      );
      if (res.data.success) {
        showSuccess(t('更新成功'));
        setChannels((prev) =>
          prev.map((ch) =>
            ch.id === channelId ? { ...ch, group_weight: weight } : ch,
          ),
        );
      } else {
        showError(res.data.message || t('更新失败'));
      }
    } catch {
      showError(t('更新失败'));
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
          is_global: values.is_global,
          channel_ids: values.channel_ids || [],
          fallback_channel_id: values.fallback_channel_id ?? 0,
        });
      } else {
        res = await API.post('/api/group/', {
          name: values.name,
          description: values.description,
          ratio: values.ratio,
          is_auto: values.is_auto,
          is_global: values.is_global,
          channel_ids: values.channel_ids || [],
          fallback_channel_id: values.fallback_channel_id ?? 0,
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
    {
      title: t('权重'),
      dataIndex: 'group_weight',
      key: 'group_weight',
      width: 120,
      render: (value, record) => (
        <InputNumber
          size='small'
          value={value ?? 0}
          min={0}
          style={{ width: 100 }}
          onBlur={(e) => {
            const newVal = parseInt(e.target.value, 10);
            if (!isNaN(newVal) && newVal !== (value ?? 0)) {
              handleUpdateChannelWeight(record.id, newVal);
            }
          }}
        />
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

          <Form.Switch
            field='is_global'
            label={t('全局可见')}
            disabled={isEdit && editingGroup?.name === 'default'}
            extraText={t(
              '开启:所有普通用户均可看到此分组。关闭:仅管理员和被显式分配此分组(用户的额外分组)的用户可见。default 分组始终全局可见。',
            )}
          />

          <Form.Select
            field='channel_ids'
            label={t('包含渠道')}
            placeholder={t('选择要加入该分组的渠道')}
            multiple
            filter
            style={{ width: '100%' }}
            optionList={channelOptions}
            extraText={t('选中的渠道会被加入该分组，取消选中则从该分组移除（会同步修改渠道的分组设置）')}
          />

          <Form.Select
            field='fallback_channel_id'
            label={t('兜底渠道')}
            placeholder={t('该分组所有渠道重试失败后，最后请求的兜底渠道')}
            showClear
            filter
            style={{ width: '100%' }}
            optionList={channelOptions}
            extraText={t('可选任意渠道（不要求属于该分组）。仅在该分组全部渠道重试失败后尝试一次。')}
          />

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
                  <Typography.Text type='tertiary' size='small'>
                    {t('权重决定同优先级下各渠道的流量分配比例，值越大分配到的请求越多。每个渠道基础权重为 10，设置为 0 时仍会分配少量流量。此处权重仅对当前分组生效，不影响其他分组。')}
                  </Typography.Text>
                  <Spin spinning={loadingChannels} style={{ marginTop: 8 }}>
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
