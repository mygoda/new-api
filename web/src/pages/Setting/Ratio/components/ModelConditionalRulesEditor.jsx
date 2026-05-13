/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  IconButton,
  Input,
  InputNumber,
  Select,
  Switch,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconDelete, IconPlus } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../../../helpers';

/**
 * ModelConditionalRulesEditor — 单个模型的「条件分价」规则编辑器(纯展示组件)。
 *
 * 业务无关:外层负责数据 IO,本组件只接收 rules + 触发 onChange。
 *
 * Props:
 *   - rules: ConditionalRuleV2[]
 *       每项: { conditions: {dim:value}, price_rmb_per_million: number, label?: string }
 *   - onChange(newRules)
 *   - dimensions: Dimension[] (后端注册的维度元数据)
 *       每项: { key, label, type:'string'|'bool'|'int', options?:[], modality?:[] }
 *   - modality (可选):'video'|'image'|'audio',用于按 modality 过滤可用维度
 *   - compact (可选): true 时压缩间距(适合嵌入更大表单)
 *
 * 设计要点:
 *   - 条件 = AND 语义,字段缺一即不匹配
 *   - 多条规则同时匹配时,后端按"条件数量最多"取最具体的(本组件不展示这个细节)
 *   - 价格单位固定为"元/百万 token",数值经后端 RMBPriceToRatio 换算
 */
export default function ModelConditionalRulesEditor({
  rules,
  onChange,
  dimensions,
  modality,
  compact = false,
}) {
  const { t } = useTranslation();

  // 维度按 modality 过滤,空 modality 视为通用维度
  const filteredDimensions = useMemo(() => {
    if (!modality) return dimensions;
    return dimensions.filter(
      (d) =>
        !d.modality ||
        d.modality.length === 0 ||
        d.modality.includes(modality),
    );
  }, [dimensions, modality]);

  const dimensionMap = useMemo(() => {
    const m = {};
    for (const d of filteredDimensions) m[d.key] = d;
    return m;
  }, [filteredDimensions]);

  const setRules = (next) => onChange?.(next);

  const addRule = () => {
    setRules([
      ...(rules || []),
      { conditions: {}, price_rmb_per_million: 0, label: '' },
    ]);
  };

  const removeRule = (idx) => {
    setRules((rules || []).filter((_, i) => i !== idx));
  };

  const updateRule = (idx, patch) => {
    setRules(
      (rules || []).map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  };

  const addCondition = (idx, dimKey) => {
    const dim = dimensionMap[dimKey];
    if (!dim) return;
    const defaultVal =
      dim.type === 'bool'
        ? false
        : dim.type === 'int'
          ? 0
          : (dim.options?.[0] ?? '');
    updateRule(idx, {
      conditions: { ...((rules || [])[idx]?.conditions || {}), [dimKey]: defaultVal },
    });
  };

  const removeCondition = (idx, dimKey) => {
    const cur = { ...((rules || [])[idx]?.conditions || {}) };
    delete cur[dimKey];
    updateRule(idx, { conditions: cur });
  };

  const updateConditionValue = (idx, dimKey, value) => {
    updateRule(idx, {
      conditions: { ...((rules || [])[idx]?.conditions || {}), [dimKey]: value },
    });
  };

  if (filteredDimensions.length === 0) {
    return (
      <Typography.Text type='tertiary' size='small'>
        {t(
          '当前请求模态尚未注册任何条件分价维度。维度由各 channel adapter 在 init() 调 common.RegisterDimension 注册。',
        )}
      </Typography.Text>
    );
  }

  const rowGap = compact ? 'space-y-2' : 'space-y-3';
  const cardPad = compact ? 'p-2' : 'p-3';

  return (
    <div className={rowGap}>
      {(rules || []).map((rule, idx) => (
        <div
          key={idx}
          className={`${cardPad} border border-slate-200 rounded-lg bg-slate-50/40`}
        >
          <div className='flex items-center justify-between mb-2 gap-2'>
            <div className='flex items-center gap-2 flex-1 min-w-0'>
              <Typography.Text strong size='small'>
                {t('规则')} #{idx + 1}
              </Typography.Text>
              <Input
                size='small'
                placeholder={t('备注(可选)')}
                value={rule.label || ''}
                onChange={(v) => updateRule(idx, { label: v })}
                style={{ width: 200 }}
              />
            </div>
            <IconButton
              icon={<IconDelete />}
              size='small'
              theme='borderless'
              type='danger'
              onClick={() => removeRule(idx)}
            />
          </div>

          {/* 条件键值对 */}
          <div className='space-y-1.5 mb-2'>
            {Object.entries(rule.conditions || {}).map(([k, v]) => {
              const dim = dimensionMap[k];
              return (
                <div key={k} className='flex items-center gap-2 flex-wrap'>
                  <Tag size='small' color='violet'>
                    {dim?.label || k}
                  </Tag>
                  <span className='text-xs text-slate-400'>=</span>
                  {!dim || dim.type === 'string' ? (
                    dim?.options?.length ? (
                      <Select
                        size='small'
                        value={v}
                        onChange={(val) => updateConditionValue(idx, k, val)}
                        style={{ width: 140 }}
                      >
                        {dim.options.map((opt) => (
                          <Select.Option key={opt} value={opt}>
                            {opt}
                          </Select.Option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        size='small'
                        value={v}
                        onChange={(val) => updateConditionValue(idx, k, val)}
                        style={{ width: 140 }}
                      />
                    )
                  ) : dim.type === 'bool' ? (
                    <Switch
                      size='small'
                      checked={!!v}
                      onChange={(val) => updateConditionValue(idx, k, val)}
                    />
                  ) : (
                    <InputNumber
                      size='small'
                      value={v}
                      onChange={(val) =>
                        updateConditionValue(idx, k, Number(val) || 0)
                      }
                      style={{ width: 100 }}
                    />
                  )}
                  <IconButton
                    icon={<IconDelete />}
                    size='small'
                    theme='borderless'
                    onClick={() => removeCondition(idx, k)}
                  />
                </div>
              );
            })}

            {/* 加条件:用 optionList 数据驱动而非 children,避免 dimensions
                异步加载完成后 Select children 不刷新的兼容问题 */}
            <Select
              size='small'
              placeholder={t('+ 加条件')}
              value={null}
              onChange={(val) => addCondition(idx, val)}
              style={{ width: 220 }}
              optionList={filteredDimensions
                .filter((d) => !(d.key in (rule.conditions || {})))
                .map((d) => ({
                  value: d.key,
                  label: `${d.label} (${d.key})`,
                }))}
            />
          </div>

          {/* 价格 */}
          <div className='flex items-center gap-2 pt-2 border-t border-slate-200'>
            <Typography.Text type='tertiary' size='small'>
              {t('价格')}
            </Typography.Text>
            <InputNumber
              size='small'
              min={0}
              step={0.01}
              precision={4}
              value={rule.price_rmb_per_million}
              onChange={(v) =>
                updateRule(idx, { price_rmb_per_million: Number(v) || 0 })
              }
              style={{ width: 140 }}
              suffix={<Tag size='small'>{t('元/百万 token')}</Tag>}
            />
          </div>
        </div>
      ))}

      <Button
        size='small'
        icon={<IconPlus />}
        theme='light'
        onClick={addRule}
      >
        {t('加规则')}
      </Button>
    </div>
  );
}

/**
 * useConditionalDimensions — 加载后端注册的维度元数据(单例缓存)。
 *
 * 跨多个模型 Card 共用同一份维度元数据,避免每个 Card 单独 fetch。
 */
let cachedDimensions = null;
let cachedPromise = null;

export function useConditionalDimensions() {
  const { t } = useTranslation();
  const [dimensions, setDimensions] = useState(cachedDimensions || []);
  const [loading, setLoading] = useState(!cachedDimensions);

  useEffect(() => {
    if (cachedDimensions) return;
    if (!cachedPromise) {
      cachedPromise = (async () => {
        try {
          const res = await API.get('/api/option/conditional_ratios/dimensions');
          const { success, message, data } = res.data || {};
          if (success && Array.isArray(data)) {
            cachedDimensions = data;
            return data;
          }
          showError(message || t('加载条件分价维度失败'));
        } catch (e) {
          showError(t('加载条件分价维度失败'));
        }
        cachedDimensions = [];
        return [];
      })();
    }
    cachedPromise.then((data) => {
      setDimensions(data);
      setLoading(false);
    });
  }, [t]);

  return { dimensions, loading };
}
