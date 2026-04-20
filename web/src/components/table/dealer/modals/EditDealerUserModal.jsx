import React, { useState, useEffect } from 'react';
import { Modal, Form } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import ModelRatioEditor from '../../../common/ModelRatioEditor';

const EditDealerUserModal = ({
  visible,
  handleClose,
  editingUser,
  updateUser,
}) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [userModelRatios, setUserModelRatios] = useState('');

  useEffect(() => {
    if (editingUser) {
      setUserModelRatios(editingUser.user_model_ratios || '');
    }
  }, [editingUser]);

  const handleSubmit = async (values) => {
    if (!editingUser) return;
    setSubmitting(true);

    const payload = { id: editingUser.id };
    if (values.display_name !== undefined)
      payload.display_name = values.display_name;
    if (values.password) payload.password = values.password;
    if (values.user_ratio !== undefined && values.user_ratio !== null)
      payload.user_ratio = Number(values.user_ratio) || 0;
    payload.user_model_ratios = userModelRatios || '';
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
        labelWidth={120}
        initValues={{
          display_name: editingUser.display_name || '',
          user_ratio:
            editingUser.user_ratio != null ? editingUser.user_ratio : 0,
          user_model_ratios: editingUser.user_model_ratios || '',
          dealer_remark: editingUser.dealer_remark || '',
        }}
      >
        {({ formApi, values }) => (
          <>
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
              field='user_ratio'
              label={t('用户默认倍率')}
              min={0}
              step={0.1}
              precision={4}
              extraText={t('0 = 使用分组倍率；>0 = 替代分组倍率')}
            />
            <Form.Slot
              label={t('模型倍率覆盖')}
              labelPosition='top'
            >
              <ModelRatioEditor
                value={userModelRatios}
                onChange={(val) => {
                  setUserModelRatios(val);
                  formApi.setValue('user_model_ratios', val);
                }}
                modelsEndpoint='/api/models'
              />
            </Form.Slot>
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
          </>
        )}
      </Form>
    </Modal>
  );
};

export default EditDealerUserModal;
