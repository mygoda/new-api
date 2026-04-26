import React, { useState } from 'react';
import { Modal, Form } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  renderQuota,
  getQuotaPerUnit,
  getCurrencyConfig,
} from '../../../../helpers';

const TransferQuotaModal = ({
  visible,
  handleClose,
  user,
  transferQuota,
  dealerQuota,
}) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const displayType = localStorage.getItem('quota_display_type') || 'USD';
  const isTokens = displayType === 'TOKENS';
  const quotaPerUnit = getQuotaPerUnit() || 500000;
  const { symbol, rate } = getCurrencyConfig();
  const unitLabel = isTokens ? t('Tokens') : symbol;
  const minInput = isTokens ? 1 : 0.01;
  const step = isTokens ? 1 : 0.01;
  const precision = isTokens ? 0 : 2;

  // Convert user-facing display value back to raw quota units that the
  // backend expects. Mirrors the inverse of helpers/render.jsx renderQuota.
  const toQuota = (input) => {
    const v = Number(input);
    if (!isFinite(v) || v <= 0) return 0;
    if (isTokens) return Math.round(v);
    return Math.round((v / (rate || 1)) * quotaPerUnit);
  };

  const handleSubmit = async (values) => {
    if (!user || !values.quota) return;
    const quotaToSend = toQuota(values.quota);
    if (quotaToSend <= 0) return;
    setSubmitting(true);
    const success = await transferQuota(user.id, quotaToSend);
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
          label={`${t('转移额度')} (${unitLabel})`}
          min={minInput}
          step={step}
          precision={precision}
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
