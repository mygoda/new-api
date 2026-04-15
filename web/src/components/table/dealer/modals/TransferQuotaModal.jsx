import React, { useState } from 'react';
import { Modal, Form } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { renderQuota } from '../../../../helpers';

const TransferQuotaModal = ({
  visible,
  handleClose,
  user,
  transferQuota,
  dealerQuota,
}) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values) => {
    if (!user || !values.quota) return;
    setSubmitting(true);
    const success = await transferQuota(user.id, values.quota);
    setSubmitting(false);
    if (success) {
      handleClose();
    }
  };

  if (!user) return null;

  return (
    <Modal
      title={t('转移额度') + ` - ${user.username}`}
      visible={visible}
      onCancel={handleClose}
      footer={null}
      closeOnEsc
    >
      <div className='mb-4 text-sm text-gray-500'>
        <div>
          {t('我的剩余额度')}:{' '}
          {dealerQuota !== undefined ? renderQuota(dealerQuota) : '-'}
        </div>
        <div>
          {t('用户当前额度')}: {renderQuota(user.quota || 0)}
        </div>
      </div>
      <Form onSubmit={handleSubmit} labelPosition='left' labelWidth={100}>
        <Form.InputNumber
          field='quota'
          label={t('转移额度')}
          min={1}
          placeholder={t('请输入要转移的额度')}
          rules={[{ required: true, message: t('请输入额度') }]}
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
            {submitting ? t('转移中...') : t('确认转移')}
          </button>
        </div>
      </Form>
    </Modal>
  );
};

export default TransferQuotaModal;
