import React, { useState } from 'react';
import { Modal, Form, InputNumber } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const AddDealerUserModal = ({ visible, handleClose, createUser }) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values) => {
    setSubmitting(true);
    const success = await createUser({
      username: values.username,
      password: values.password,
      display_name: values.display_name || '',
      dealer_ratio: values.dealer_ratio || 1,
      dealer_remark: values.dealer_remark || '',
      initial_quota: values.initial_quota || 0,
    });
    setSubmitting(false);
    if (success) {
      handleClose();
    }
  };

  return (
    <Modal
      title={t('创建子用户')}
      visible={visible}
      onCancel={handleClose}
      footer={null}
      closeOnEsc
    >
      <Form onSubmit={handleSubmit} labelPosition='left' labelWidth={100}>
        <Form.Input
          field='username'
          label={t('用户名')}
          placeholder={t('请输入用户名')}
          rules={[{ required: true, message: t('用户名不能为空') }]}
        />
        <Form.Input
          field='password'
          label={t('密码')}
          mode='password'
          placeholder={t('请输入密码（8-20字符）')}
          rules={[
            { required: true, message: t('密码不能为空') },
            { min: 8, message: t('密码至少8字符') },
          ]}
        />
        <Form.Input
          field='display_name'
          label={t('显示名称')}
          placeholder={t('可选')}
        />
        <Form.InputNumber
          field='dealer_ratio'
          label={t('定价倍率')}
          initValue={1}
          min={0.01}
          step={0.1}
          placeholder='1.0'
        />
        <Form.InputNumber
          field='initial_quota'
          label={t('初始额度')}
          initValue={0}
          min={0}
          placeholder='0'
        />
        <Form.Input
          field='dealer_remark'
          label={t('备注')}
          placeholder={t('可选')}
        />
        <div className='flex justify-end gap-2 mt-4'>
          <button className='semi-button' onClick={handleClose} type='button'>
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
  );
};

export default AddDealerUserModal;
