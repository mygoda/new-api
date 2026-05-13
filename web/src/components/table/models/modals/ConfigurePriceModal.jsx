import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SideSheet,
  Button,
  Card,
  Radio,
  RadioGroup,
  Switch,
  Tag,
  Typography,
  Spin,
  Banner,
} from '@douyinfe/semi-ui';
import { IconDelete, IconPlus } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import { PriceInput } from '../../../../pages/Setting/Ratio/components/ModelPricingEditor';
import ModelConditionalRulesEditor, {
  useConditionalDimensions,
} from '../../../../pages/Setting/Ratio/components/ModelConditionalRulesEditor';
import {
  EMPTY_TIER,
  buildModelState,
  serializeModel,
  parseOptionJSON,
  parseConditionalRatiosV2,
  hasValue,
  buildOptionalFieldToggles,
  getModelWarnings,
  buildPreviewRows,
  validateTiers,
} from '../../../../pages/Setting/Ratio/hooks/useModelPricingEditorState';

const { Text } = Typography;

const NUMERIC_INPUT_REGEX = /^(\d+(\.\d*)?|\.\d*)?$/;

const PRICING_OPTION_KEYS = [
  'ModelPrice',
  'ModelRatio',
  'CompletionRatio',
  'CacheRatio',
  'CreateCacheRatio',
  'ImageRatio',
  'AudioRatio',
  'AudioCompletionRatio',
  'ModelRatioTiered',
];

const toNumberOrNull = (value) => {
  if (
    value === '' ||
    value === null ||
    value === undefined ||
    value === false
  ) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatNumber = (value) => {
  const num = toNumberOrNull(value);
  if (num === null) return '';
  return parseFloat(num.toFixed(12)).toString();
};

const fillDerivedPricesFromBase = (model, nextInputPrice) => {
  const baseNumber = toNumberOrNull(nextInputPrice);
  if (baseNumber === null) return model;

  return {
    ...model,
    completionPrice:
      model.completionRatioLocked && hasValue(model.lockedCompletionRatio)
        ? formatNumber(baseNumber * Number(model.lockedCompletionRatio))
        : !hasValue(model.completionPrice) &&
            hasValue(model.rawRatios.completionRatio)
          ? formatNumber(baseNumber * Number(model.rawRatios.completionRatio))
          : model.completionPrice,
    cachePrice:
      !hasValue(model.cachePrice) && hasValue(model.rawRatios.cacheRatio)
        ? formatNumber(baseNumber * Number(model.rawRatios.cacheRatio))
        : model.cachePrice,
    createCachePrice:
      !hasValue(model.createCachePrice) &&
      hasValue(model.rawRatios.createCacheRatio)
        ? formatNumber(baseNumber * Number(model.rawRatios.createCacheRatio))
        : model.createCachePrice,
    imagePrice:
      !hasValue(model.imagePrice) && hasValue(model.rawRatios.imageRatio)
        ? formatNumber(baseNumber * Number(model.rawRatios.imageRatio))
        : model.imagePrice,
    audioInputPrice:
      !hasValue(model.audioInputPrice) && hasValue(model.rawRatios.audioRatio)
        ? formatNumber(baseNumber * Number(model.rawRatios.audioRatio))
        : model.audioInputPrice,
    audioOutputPrice:
      !hasValue(model.audioOutputPrice) &&
      hasValue(model.rawRatios.audioRatio) &&
      hasValue(model.rawRatios.audioCompletionRatio)
        ? formatNumber(
            baseNumber *
              Number(model.rawRatios.audioRatio) *
              Number(model.rawRatios.audioCompletionRatio),
          )
        : model.audioOutputPrice,
  };
};

const buildSourceMaps = (options) => ({
  ModelPrice: parseOptionJSON(options.ModelPrice),
  ModelRatio: parseOptionJSON(options.ModelRatio),
  CompletionRatio: parseOptionJSON(options.CompletionRatio),
  CompletionRatioMeta: parseOptionJSON(options.CompletionRatioMeta),
  CacheRatio: parseOptionJSON(options.CacheRatio),
  CreateCacheRatio: parseOptionJSON(options.CreateCacheRatio),
  ImageRatio: parseOptionJSON(options.ImageRatio),
  AudioRatio: parseOptionJSON(options.AudioRatio),
  AudioCompletionRatio: parseOptionJSON(options.AudioCompletionRatio),
  ModelRatioTiered: parseOptionJSON(options.ModelRatioTiered),
  ConditionalRatiosV2: parseConditionalRatiosV2(options.ConditionalRatiosV2),
});

export default function ConfigurePriceModal({
  visible,
  modelName,
  onClose,
  onSuccess,
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modelState, setModelState] = useState(null);
  const [toggles, setToggles] = useState({});
  const { dimensions: conditionalDimensions } = useConditionalDimensions();

  const loadPricingData = useCallback(async () => {
    if (!modelName) return;
    setLoading(true);
    try {
      const res = await API.get('/api/option/');
      if (!res.data.success) {
        showError(t('加载定价数据失败'));
        return;
      }
      const options = {};
      const rawData = res.data.data;
      if (Array.isArray(rawData)) {
        rawData.forEach((item) => {
          options[item.key] = item.value;
        });
      } else if (rawData && typeof rawData === 'object') {
        Object.assign(options, rawData);
      }
      const sourceMaps = buildSourceMaps(options);
      const state = buildModelState(modelName, sourceMaps);
      setModelState(state);
      setToggles(buildOptionalFieldToggles(state));
    } catch (e) {
      showError(t('加载定价数据失败'));
    } finally {
      setLoading(false);
    }
  }, [modelName, t]);

  useEffect(() => {
    if (visible && modelName) {
      loadPricingData();
    } else {
      setModelState(null);
      setToggles({});
    }
  }, [visible, modelName, loadPricingData]);

  const handleNumericFieldChange = useCallback((field, value) => {
    if (!NUMERIC_INPUT_REGEX.test(value)) return;
    setModelState((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      if (field === 'inputPrice') {
        return fillDerivedPricesFromBase(updated, value);
      }
      return updated;
    });
  }, []);

  const handleBillingModeChange = useCallback((value) => {
    setModelState((prev) => (prev ? { ...prev, billingMode: value } : prev));
  }, []);

  // 条件分价 v2 规则集编辑(per-model),与「价格设置」编辑器保持一致体验
  const handleConditionalRulesChange = useCallback((nextRules) => {
    setModelState((prev) =>
      prev
        ? { ...prev, conditionalRules: Array.isArray(nextRules) ? nextRules : [] }
        : prev,
    );
  }, []);

  const isOptionalFieldEnabled = useCallback(
    (field) => {
      if (typeof toggles[field] === 'boolean') return toggles[field];
      if (!modelState) return false;
      return buildOptionalFieldToggles(modelState)[field];
    },
    [toggles, modelState],
  );

  const handleOptionalFieldToggle = useCallback((field, checked) => {
    setToggles((prev) => ({ ...prev, [field]: checked }));
    if (!checked) {
      setModelState((prev) => {
        if (!prev) return prev;
        const next = { ...prev, [field]: '' };
        if (field === 'audioInputPrice') {
          next.audioOutputPrice = '';
          setToggles((p) => ({
            ...p,
            audioInputPrice: false,
            audioOutputPrice: false,
          }));
        }
        return next;
      });
    }
  }, []);

  const handleTieredToggle = useCallback((checked) => {
    setModelState((prev) => {
      if (!prev) return prev;
      if (checked) {
        const initialTier = {
          ...EMPTY_TIER,
          threshold: '0',
          inputPrice: hasValue(prev.inputPrice) ? prev.inputPrice : '',
          completionPrice: hasValue(prev.completionPrice)
            ? prev.completionPrice
            : '',
        };
        return {
          ...prev,
          tieredEnabled: true,
          tiers:
            Array.isArray(prev.tiers) && prev.tiers.length > 0
              ? prev.tiers
              : [initialTier],
        };
      }
      return { ...prev, tieredEnabled: false };
    });
  }, []);

  const handleAddTier = useCallback(() => {
    setModelState((prev) => {
      if (!prev) return prev;
      const tiers = Array.isArray(prev.tiers) ? prev.tiers : [];
      const last = tiers[tiers.length - 1];
      const lastThresholdNum = Number(last?.threshold);
      const lastThreshold = Number.isFinite(lastThresholdNum)
        ? lastThresholdNum
        : 0;
      const suggested = lastThreshold === 0 ? 200000 : lastThreshold * 2;
      const newTier = {
        ...EMPTY_TIER,
        threshold: String(suggested),
        inputPrice: last?.inputPrice ?? '',
        completionPrice: last?.completionPrice ?? '',
      };
      return { ...prev, tiers: [...tiers, newTier] };
    });
  }, []);

  const handleDeleteTier = useCallback((index) => {
    if (index === 0) return;
    setModelState((prev) => {
      if (!prev) return prev;
      const tiers = Array.isArray(prev.tiers) ? prev.tiers : [];
      return { ...prev, tiers: tiers.filter((_, i) => i !== index) };
    });
  }, []);

  // 编辑「第 index 档的结束阈值」实际等价于编辑「第 index+1 档的开始阈值」。
  // 末档没有下一档，结束阈值显示「无上限」并禁用，不会调到这里。
  const handleTierEndThresholdChange = useCallback((index, value) => {
    if (!NUMERIC_INPUT_REGEX.test(value)) return;
    setModelState((prev) => {
      if (!prev) return prev;
      const tiers = Array.isArray(prev.tiers) ? prev.tiers : [];
      if (index + 1 >= tiers.length) return prev;
      return {
        ...prev,
        tiers: tiers.map((tier, i) =>
          i === index + 1 ? { ...tier, threshold: value } : tier,
        ),
      };
    });
  }, []);

  const handleTierFieldChange = useCallback((index, field, value) => {
    if (!NUMERIC_INPUT_REGEX.test(value)) return;
    setModelState((prev) => {
      if (!prev) return prev;
      const tiers = Array.isArray(prev.tiers) ? prev.tiers : [];
      return {
        ...prev,
        tiers: tiers.map((tier, i) =>
          i === index ? { ...tier, [field]: value } : tier,
        ),
      };
    });
  }, []);

  const warnings = useMemo(
    () => [...getModelWarnings(modelState, t), ...validateTiers(modelState, t)],
    [modelState, t],
  );

  const previewRows = useMemo(
    () => buildPreviewRows(modelState, t),
    [modelState, t],
  );

  const handleSave = async () => {
    if (!modelState || !modelName) return;

    setSaving(true);
    try {
      const serialized = serializeModel(modelState, t);

      // Re-fetch current options for merge
      const res = await API.get('/api/option/');
      if (!res.data.success) {
        showError(t('加载定价数据失败'));
        return;
      }
      const options = {};
      const rawData = res.data.data;
      if (Array.isArray(rawData)) {
        rawData.forEach((item) => {
          options[item.key] = item.value;
        });
      } else if (rawData && typeof rawData === 'object') {
        Object.assign(options, rawData);
      }

      // Merge and save each pricing key
      for (const key of PRICING_OPTION_KEYS) {
        const currentMap = parseOptionJSON(options[key]);
        if (serialized[key] !== null && serialized[key] !== undefined) {
          currentMap[modelName] = serialized[key];
        } else {
          delete currentMap[modelName];
        }
        const saveRes = await API.put('/api/option/', {
          key,
          value: JSON.stringify(currentMap),
        });
        if (!saveRes.data.success) {
          showError(saveRes.data.message || `${t('保存失败')}: ${key}`);
          return;
        }
      }

      // 条件分价 v2: 与「价格设置」逻辑对齐——读全局 JSON,替换本模型规则,写回。
      // 规则为空表示删除本模型的 entry,避免遗留空对象。
      const v2Raw = options['ConditionalRatiosV2'] || '';
      let v2Cfg = { enabled: true, models: [] };
      if (v2Raw.trim() !== '') {
        try {
          const parsed = JSON.parse(v2Raw);
          if (parsed && typeof parsed === 'object') {
            v2Cfg = {
              enabled: parsed.enabled !== false,
              models: Array.isArray(parsed.models) ? parsed.models : [],
            };
          }
        } catch {
          // 损坏时新建
        }
      }
      const cleanRules = Array.isArray(modelState.conditionalRules)
        ? modelState.conditionalRules.filter(
            (r) =>
              r &&
              typeof r.price_rmb_per_million === 'number' &&
              r.price_rmb_per_million > 0,
          )
        : [];
      const existingIdx = v2Cfg.models.findIndex(
        (m) => m.model_pattern === modelName,
      );
      if (cleanRules.length > 0) {
        const entry = { model_pattern: modelName, rules: cleanRules };
        if (existingIdx >= 0) {
          v2Cfg.models[existingIdx] = {
            ...v2Cfg.models[existingIdx],
            ...entry,
          };
        } else {
          v2Cfg.models.push(entry);
        }
      } else if (existingIdx >= 0) {
        v2Cfg.models.splice(existingIdx, 1);
      }
      const v2SaveRes = await API.put('/api/option/', {
        key: 'ConditionalRatiosV2',
        value: JSON.stringify(v2Cfg),
      });
      if (!v2SaveRes.data.success) {
        showError(v2SaveRes.data.message || `${t('保存失败')}: ConditionalRatiosV2`);
        return;
      }

      showSuccess(t('保存价格配置成功'));
      onClose();
      if (onSuccess) onSuccess();
    } catch (e) {
      if (e.message) {
        showError(e.message);
      } else {
        showError(t('保存失败'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SideSheet
      visible={visible}
      onCancel={onClose}
      title={
        <span>
          {t('模型价格配置')}
          {modelName ? (
            <Tag color='blue' style={{ marginLeft: 8 }}>
              {modelName}
            </Tag>
          ) : null}
        </span>
      }
      width={isMobile ? '100%' : 520}
      placement='right'
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>{t('取消')}</Button>
          <Button
            type='primary'
            loading={saving}
            disabled={!modelState || loading}
            onClick={handleSave}
          >
            {t('保存')}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: 40,
          }}
        >
          <Spin size='large' />
        </div>
      ) : !modelState ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          {t('暂无数据')}
        </div>
      ) : (
        <div>
          <div className='mb-4'>
            <div className='mb-2 font-medium text-gray-700'>
              {t('计费方式')}
            </div>
            <RadioGroup
              type='button'
              value={modelState.billingMode}
              onChange={(event) => handleBillingModeChange(event.target.value)}
            >
              <Radio value='per-token'>{t('按量计费')}</Radio>
              <Radio value='per-request'>{t('按次计费')}</Radio>
            </RadioGroup>
            <div className='mt-2 text-xs text-gray-500'>
              {t(
                '这个界面默认按价格填写，保存时会自动换算回后端需要的倍率 JSON。',
              )}
            </div>
          </div>

          {warnings.length > 0 ? (
            <Card
              bodyStyle={{ padding: 12 }}
              style={{
                marginBottom: 16,
                background: 'var(--semi-color-warning-light-default)',
              }}
            >
              <div className='font-medium mb-2'>{t('当前提示')}</div>
              {warnings.map((warning) => (
                <div key={warning} className='text-sm text-gray-700 mb-1'>
                  {warning}
                </div>
              ))}
            </Card>
          ) : null}

          {modelState.billingMode === 'per-request' ? (
            <PriceInput
              label={t('固定价格')}
              value={modelState.fixedPrice}
              placeholder={t('输入每次调用价格')}
              suffix={t('$/次')}
              onChange={(value) =>
                handleNumericFieldChange('fixedPrice', value)
              }
              extraText={t('适合 MJ / 任务类等按次收费模型。')}
            />
          ) : (
            <>
              <Card
                bodyStyle={{ padding: 16 }}
                style={{
                  marginBottom: 16,
                  background: 'var(--semi-color-fill-0)',
                }}
              >
                <div className='font-medium mb-3'>{t('基础价格')}</div>
                <PriceInput
                  label={t('输入价格')}
                  value={modelState.inputPrice}
                  placeholder={t('输入 $/1M tokens')}
                  onChange={(value) =>
                    handleNumericFieldChange('inputPrice', value)
                  }
                />
                {modelState.completionRatioLocked ? (
                  <Banner
                    type='warning'
                    bordered
                    fullMode={false}
                    closeIcon={null}
                    style={{ marginBottom: 12 }}
                    title={t('补全价格已锁定')}
                    description={t(
                      '该模型补全倍率由后端固定为 {{ratio}}。补全价格不能在这里修改。',
                      {
                        ratio: modelState.lockedCompletionRatio || '-',
                      },
                    )}
                  />
                ) : null}
                <PriceInput
                  label={t('补全价格')}
                  value={modelState.completionPrice}
                  placeholder={t('输入 $/1M tokens')}
                  onChange={(value) =>
                    handleNumericFieldChange('completionPrice', value)
                  }
                  headerAction={
                    <Switch
                      size='small'
                      checked={isOptionalFieldEnabled('completionPrice')}
                      disabled={modelState.completionRatioLocked}
                      onChange={(checked) =>
                        handleOptionalFieldToggle('completionPrice', checked)
                      }
                    />
                  }
                  hidden={!isOptionalFieldEnabled('completionPrice')}
                  disabled={
                    !hasValue(modelState.inputPrice) ||
                    modelState.completionRatioLocked
                  }
                  extraText={
                    modelState.completionRatioLocked
                      ? t(
                          '后端固定倍率：{{ratio}}。该字段仅展示换算后的价格。',
                          {
                            ratio: modelState.lockedCompletionRatio || '-',
                          },
                        )
                      : !isOptionalFieldEnabled('completionPrice')
                        ? t('当前未启用，需要时再打开即可。')
                        : ''
                  }
                />
                <PriceInput
                  label={t('缓存读取价格')}
                  value={modelState.cachePrice}
                  placeholder={t('输入 $/1M tokens')}
                  onChange={(value) =>
                    handleNumericFieldChange('cachePrice', value)
                  }
                  headerAction={
                    <Switch
                      size='small'
                      checked={isOptionalFieldEnabled('cachePrice')}
                      onChange={(checked) =>
                        handleOptionalFieldToggle('cachePrice', checked)
                      }
                    />
                  }
                  hidden={!isOptionalFieldEnabled('cachePrice')}
                  disabled={!hasValue(modelState.inputPrice)}
                  extraText={
                    !isOptionalFieldEnabled('cachePrice')
                      ? t('当前未启用，需要时再打开即可。')
                      : ''
                  }
                />
                <PriceInput
                  label={t('缓存创建价格')}
                  value={modelState.createCachePrice}
                  placeholder={t('输入 $/1M tokens')}
                  onChange={(value) =>
                    handleNumericFieldChange('createCachePrice', value)
                  }
                  headerAction={
                    <Switch
                      size='small'
                      checked={isOptionalFieldEnabled('createCachePrice')}
                      onChange={(checked) =>
                        handleOptionalFieldToggle('createCachePrice', checked)
                      }
                    />
                  }
                  hidden={!isOptionalFieldEnabled('createCachePrice')}
                  disabled={!hasValue(modelState.inputPrice)}
                  extraText={
                    !isOptionalFieldEnabled('createCachePrice')
                      ? t('当前未启用，需要时再打开即可。')
                      : ''
                  }
                />
              </Card>

              <Card
                bodyStyle={{ padding: 16 }}
                style={{
                  marginBottom: 16,
                  background: 'var(--semi-color-fill-0)',
                }}
              >
                <div className='mb-3'>
                  <div className='font-medium'>{t('扩展价格')}</div>
                  <div className='text-xs text-gray-500 mt-1'>
                    {t('这些价格都是可选项，不填也可以。')}
                  </div>
                </div>
                <PriceInput
                  label={t('图片输入价格')}
                  value={modelState.imagePrice}
                  placeholder={t('输入 $/1M tokens')}
                  onChange={(value) =>
                    handleNumericFieldChange('imagePrice', value)
                  }
                  headerAction={
                    <Switch
                      size='small'
                      checked={isOptionalFieldEnabled('imagePrice')}
                      onChange={(checked) =>
                        handleOptionalFieldToggle('imagePrice', checked)
                      }
                    />
                  }
                  hidden={!isOptionalFieldEnabled('imagePrice')}
                  disabled={!hasValue(modelState.inputPrice)}
                  extraText={
                    !isOptionalFieldEnabled('imagePrice')
                      ? t('当前未启用，需要时再打开即可。')
                      : ''
                  }
                />
                <PriceInput
                  label={t('音频输入价格')}
                  value={modelState.audioInputPrice}
                  placeholder={t('输入 $/1M tokens')}
                  onChange={(value) =>
                    handleNumericFieldChange('audioInputPrice', value)
                  }
                  headerAction={
                    <Switch
                      size='small'
                      checked={isOptionalFieldEnabled('audioInputPrice')}
                      onChange={(checked) =>
                        handleOptionalFieldToggle('audioInputPrice', checked)
                      }
                    />
                  }
                  hidden={!isOptionalFieldEnabled('audioInputPrice')}
                  disabled={!hasValue(modelState.inputPrice)}
                  extraText={
                    !isOptionalFieldEnabled('audioInputPrice')
                      ? t('当前未启用，需要时再打开即可。')
                      : ''
                  }
                />
                <PriceInput
                  label={t('音频补全价格')}
                  value={modelState.audioOutputPrice}
                  placeholder={t('输入 $/1M tokens')}
                  onChange={(value) =>
                    handleNumericFieldChange('audioOutputPrice', value)
                  }
                  headerAction={
                    <Switch
                      size='small'
                      checked={isOptionalFieldEnabled('audioOutputPrice')}
                      disabled={!isOptionalFieldEnabled('audioInputPrice')}
                      onChange={(checked) =>
                        handleOptionalFieldToggle('audioOutputPrice', checked)
                      }
                    />
                  }
                  hidden={!isOptionalFieldEnabled('audioOutputPrice')}
                  disabled={!hasValue(modelState.audioInputPrice)}
                  extraText={
                    !isOptionalFieldEnabled('audioInputPrice')
                      ? t('请先开启并填写音频输入价格。')
                      : !isOptionalFieldEnabled('audioOutputPrice')
                        ? t('当前未启用，需要时再打开即可。')
                        : ''
                  }
                />
              </Card>

              <Card
                bodyStyle={{ padding: 16 }}
                style={{
                  marginBottom: 16,
                  background: 'var(--semi-color-fill-0)',
                }}
              >
                <div className='mb-3 flex items-center justify-between gap-3'>
                  <div>
                    <div className='font-medium'>{t('阶梯计费')}</div>
                    <div className='text-xs text-gray-500 mt-1'>
                      {t(
                        '按 prompt 输入 token 数切换不同档位的输入/输出单价。启用后将覆盖上方基础价格。',
                      )}
                    </div>
                  </div>
                  <Switch
                    size='small'
                    checked={!!modelState.tieredEnabled}
                    onChange={(checked) => handleTieredToggle(checked)}
                    aria-label={t('阶梯计费')}
                  />
                </div>
                {modelState.tieredEnabled ? (
                  <div className='space-y-3'>
                    {(modelState.tiers || []).map((tier, idx) => (
                      <Card
                        key={idx}
                        bodyStyle={{ padding: 12 }}
                        style={{ background: 'var(--semi-color-bg-2)' }}
                      >
                        <div className='flex items-center justify-between mb-2'>
                          <Text strong>
                            {idx === 0
                              ? t('首档（默认）')
                              : t('阶梯 {{idx}}', { idx: idx + 1 })}
                          </Text>
                          {idx > 0 ? (
                            <Button
                              icon={<IconDelete />}
                              size='small'
                              type='danger'
                              theme='borderless'
                              onClick={() => handleDeleteTier(idx)}
                            />
                          ) : null}
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile
                              ? '1fr'
                              : 'repeat(2, 1fr)',
                            gap: 12,
                          }}
                        >
                          <PriceInput
                            label={t('开始阈值（prompt tokens）')}
                            value={idx === 0 ? '0' : tier.threshold}
                            placeholder={
                              idx === 0 ? '0' : t('如 32000 表示 ≥32K 时生效')
                            }
                            suffix='tokens'
                            disabled={idx === 0}
                            onChange={(value) =>
                              handleTierFieldChange(idx, 'threshold', value)
                            }
                          />
                          <PriceInput
                            label={t('结束阈值（prompt tokens）')}
                            value={
                              idx === (modelState.tiers || []).length - 1
                                ? ''
                                : ((modelState.tiers || [])[idx + 1]
                                    ?.threshold ?? '')
                            }
                            placeholder={
                              idx === (modelState.tiers || []).length - 1
                                ? t('无上限')
                                : t('如 64000 表示该档覆盖到 64K')
                            }
                            suffix='tokens'
                            disabled={
                              idx === (modelState.tiers || []).length - 1
                            }
                            onChange={(value) =>
                              handleTierEndThresholdChange(idx, value)
                            }
                          />
                          <PriceInput
                            label={t('输入价格')}
                            value={tier.inputPrice}
                            placeholder={t('输入 $/1M tokens')}
                            onChange={(value) =>
                              handleTierFieldChange(idx, 'inputPrice', value)
                            }
                          />
                          <PriceInput
                            label={t('输出价格')}
                            value={tier.completionPrice}
                            placeholder={t('输入 $/1M tokens')}
                            onChange={(value) =>
                              handleTierFieldChange(
                                idx,
                                'completionPrice',
                                value,
                              )
                            }
                          />
                          <PriceInput
                            label={t('缓存读取价格（可选）')}
                            value={tier.cachePrice}
                            placeholder={t('留空则沿用基础缓存价')}
                            onChange={(value) =>
                              handleTierFieldChange(idx, 'cachePrice', value)
                            }
                          />
                          <PriceInput
                            label={t('缓存创建价格（可选）')}
                            value={tier.createCachePrice}
                            placeholder={t('留空则沿用基础缓存写入价')}
                            onChange={(value) =>
                              handleTierFieldChange(
                                idx,
                                'createCachePrice',
                                value,
                              )
                            }
                          />
                        </div>
                      </Card>
                    ))}
                    <Button icon={<IconPlus />} block onClick={handleAddTier}>
                      {t('新增阶梯')}
                    </Button>
                  </div>
                ) : null}
              </Card>
            </>
          )}

          {/* 条件分价 v2 — 与「分组与模型定价设置 → 价格设置」体验一致 */}
          <Card
            bodyStyle={{ padding: 16 }}
            style={{
              marginBottom: 16,
              background: 'var(--semi-color-fill-0)',
            }}
          >
            <div className='mb-3 flex items-start justify-between gap-3'>
              <div>
                <div className='font-medium'>
                  {t('条件分价')}
                  <Tag color='violet' size='small' className='!ml-2'>
                    {(modelState.conditionalRules || []).length}{' '}
                    {t('条规则')}
                  </Tag>
                </div>
                <div className='text-xs text-gray-500 mt-1'>
                  {t(
                    '按请求维度组合切换不同档位的价格(如分辨率/是否含视频)。后端在 BaseBilling.AdjustBillingOnSubmit 自动应用,以"元/百万 token"输入。规则集非空即生效,与阶梯计费可叠加。',
                  )}
                </div>
              </div>
            </div>
            <ModelConditionalRulesEditor
              rules={modelState.conditionalRules || []}
              onChange={handleConditionalRulesChange}
              dimensions={conditionalDimensions}
              compact
            />
          </Card>

          <Card
            bodyStyle={{ padding: 16 }}
            style={{ background: 'var(--semi-color-fill-0)' }}
          >
            <div className='font-medium mb-3'>{t('保存预览')}</div>
            <div className='text-xs text-gray-500 mb-3'>
              {t(
                '下面展示这个模型保存后会写入哪些后端字段，便于和原始 JSON 编辑框保持一致。',
              )}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(140px, 180px) 1fr',
                gap: 8,
              }}
            >
              {previewRows.map((row) => (
                <React.Fragment key={row.key}>
                  <Text strong>{row.label}</Text>
                  <Text>{row.value}</Text>
                </React.Fragment>
              ))}
            </div>
          </Card>
        </div>
      )}
    </SideSheet>
  );
}
