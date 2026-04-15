import React, { useState, useEffect } from 'react';
import { Modal, Form } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const EditDealerUserModal = ({
  visible,
  handleClose,
  editingUser,
  updateUser,
}) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values) => {
    if (!editingUser) return;
    setSubmitting(true);

    const payload = { id: editingUser.id };
    if (values.display_name !== undefined)
      payload.display_name = values.display_name;
    if (values.password) payload.password = values.password;
    if (values.dealer_ratio !== undefined)
      payload.dealer_ratio = values.dealer_ratio;
    if (values.dealer_remark !== undefined)
      payload.dealer_remark = values.dealer_remark;

    const success = await updateUser(payload);
    setSubmitting(false);
    if (success) {
      handleClose();
    }
  };

  if (!editingUser) return null;

  return (
    <Modal
      title={t('编辑用户') + ` - ${editingUser.username}`}
      visible={visible}
      onCancel={handleClose}
      footer={null}
      closeOnEsc
    >
      <Form
        onSubmit={handleSubmit}
        labelPosition='left'
        labelWidth={100}
        initValues={{
          display_name: editingUser.display_name || '',
          dealer_ratio: editingUser.dealer_ratio || 1,
          dealer_remark: editingUser.dealer_remark || '',
        }}
      >
        <Form.Input
          field='display_name'
          label={t('显示名称')}
          placeholder={t('可选')}
        />
        <Form.Input
          field='password'
          label={t('新密码')}
          mode='password'
          placeholder={t('留空不修改')}
        />
        <Form.InputNumber
          field='dealer_ratio'
          label={t('定价倍率')}
          min={0.01}
          step={0.1}
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
            {submitting ? t('保存中...') : t('保存')}
          </button>
        </div>
      </Form>
    </Modal>
  );
};

export default EditDealerUserModal;
