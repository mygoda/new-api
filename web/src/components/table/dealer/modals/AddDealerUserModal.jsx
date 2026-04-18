import React, { useState } from 'react';
import { Modal, Form } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import ModelRatioEditor from '../../../common/ModelRatioEditor';

const AddDealerUserModal = ({ visible, handleClose, createUser }) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values) => {
    setSubmitting(true);
    const success = await createUser({
      username: values.username,
      password: values.password,
      display_name: values.display_name || '',
      user_ratio: values.user_ratio || 0,
      user_model_ratios: values.user_model_ratios || '',
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
      <Form
        onSubmit={handleSubmit}
        labelPosition='left'
        labelWidth={120}
        initValues={{
          user_ratio: 0,
          user_model_ratios: '',
          initial_quota: 0,
        }}
      >
        {({ formApi, values }) => (
          <>
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
              field='user_ratio'
              label={t('用户默认倍率')}
              min={0}
              step={0.1}
              precision={4}
              placeholder='0'
              extraText={t('0 = 使用分组倍率；>0 = 替代分组倍率')}
            />
            <Form.Slot
              field='user_model_ratios'
              label={t('模型倍率覆盖')}
              labelPosition='top'
            >
              <ModelRatioEditor
                value={values.user_model_ratios}
                onChange={(val) => formApi.setValue('user_model_ratios', val)}
                modelsEndpoint='/api/models'
              />
            </Form.Slot>
            <Form.InputNumber
              field='initial_quota'
              label={t('初始额度')}
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
          </>
        )}
      </Form>
    </Modal>
  );
};

export default AddDealerUserModal;
