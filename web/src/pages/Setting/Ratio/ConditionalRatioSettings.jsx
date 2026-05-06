/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Empty,
  InputNumber,
  Space,
  Spin,
  Switch,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../../helpers';

/**
 * ConditionalRatioSettings — 通用「模型条件分价」可视化编辑器。
 *
 * 数据流:
 *   - 父级 RatioSetting 把 ConditionalRatios option(JSON 字符串)透传过来
 *   - 进入页面时拉一次 GET /api/option/conditional_ratios/families 拿后端注册的 family 元数据
 *   - 前端按 family 渲染 Switch + InputNumber,save 时 stringify 回 JSON,PUT /api/option/
 *
 * 通用化设计:
 *   - 每个 family(seedance / kling / vidu ...)都由对应 channel adapter 的 init() 自助注册
 *   - 前端不感知具体业务,纯按注册表渲染
 *   - 新加 family 后端 register.go 写完,重启后 admin UI 自动出现新 Card
 */

function buildDefaultCfg(families) {
  const models = {};
  for (const f of families) {
    const conds = {};
    for (const c of f.conditions || []) {
      conds[c.key] = { enabled: true, multiplier: c.defaultMul };
    }
    models[f.key] = conds;
  }
  return { enabled: true, models };
}

function parseCfg(jsonStr, families) {
  if (!jsonStr || !jsonStr.trim()) return buildDefaultCfg(families);
  try {
    const obj = JSON.parse(jsonStr);
    if (obj && typeof obj === 'object') {
      return {
        enabled: obj.enabled !== false,
        models: obj.models || {},
      };
    }
  } catch (e) {
    // ignore — 损坏时回退默认
  }
  return buildDefaultCfg(families);
}

export default function ConditionalRatioSettings(props) {
  const { t } = useTranslation();
  const [families, setFamilies] = useState([]);
  const [familiesLoading, setFamiliesLoading] = useState(true);
  const [cfg, setCfg] = useState({ enabled: true, models: {} });
  const [saving, setSaving] = useState(false);

  // 拉一次 family 元数据(后端注册表)
  useEffect(() => {
    let alive = true;
    (async () => {
      setFamiliesLoading(true);
      try {
        const res = await API.get('/api/option/conditional_ratios/families');
        const { success, message, data } = res.data || {};
        if (!alive) return;
        if (success) {
          setFamilies(Array.isArray(data) ? data : []);
        } else {
          showError(message || t('加载条件分价配置失败'));
        }
      } catch (e) {
        if (alive) showError(t('加载条件分价配置失败'));
      } finally {
        if (alive) setFamiliesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  // option 字符串 + family 元数据都到位后,合成 cfg state
  useEffect(() => {
    if (familiesLoading) return;
    const raw = props.options?.ConditionalRatios || '';
    setCfg(parseCfg(raw, families));
  }, [props.options, families, familiesLoading]);

  const setMaster = (enabled) => setCfg({ ...cfg, enabled });

  const setCondition = (familyKey, condKey, patch) => {
    const models = { ...cfg.models };
    const conds = { ...(models[familyKey] || {}) };
    conds[condKey] = {
      ...(conds[condKey] || { enabled: true, multiplier: 1 }),
      ...patch,
    };
    models[familyKey] = conds;
    setCfg({ ...cfg, models });
  };

  const reset = () => setCfg(buildDefaultCfg(families));

  const submit = async () => {
    setSaving(true);
    try {
      const value = JSON.stringify(cfg);
      const res = await API.put('/api/option/', {
        key: 'ConditionalRatios',
        value,
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('保存成功'));
        props.refresh?.();
      } else {
        showError(message || t('保存失败'));
      }
    } catch (e) {
      showError(t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const empty = useMemo(
    () => !familiesLoading && (!families || families.length === 0),
    [families, familiesLoading],
  );

  return (
    <Spin spinning={familiesLoading} size='large'>
      <div className='space-y-4'>
        <Banner
          type='info'
          description={t(
            '模型条件分价 — 部分模型(如 Seedance 视频)按 token / 张数计费,但单价随条件浮动(有声/无声、Draft、是否含视频输入、分辨率、时长等)。' +
              '基准价在「模型倍率设置」里以 ModelRatio 配置;这里配置相对基准的乘子。' +
              '关闭总开关或单条则该条件不应用乘子(走基准价)。新增模型族需要后端在对应 channel 的 init() 中注册。',
          )}
          closeIcon={null}
        />

        <Card title={t('总开关')} bordered headerStyle={{ paddingBottom: 8 }}>
          <Space align='center'>
            <Switch
              checked={cfg.enabled}
              onChange={setMaster}
              checkedText={t('启用条件分价')}
              uncheckedText={t('已禁用')}
            />
            <Typography.Text type='tertiary' size='small'>
              {t(
                '关闭后所有族只按基准 ModelRatio 计费,不应用任何乘子。',
              )}
            </Typography.Text>
          </Space>
        </Card>

        {empty && (
          <Card>
            <Empty
              description={t(
                '尚未注册任何条件分价族。后端 adapter 在 init() 中调 RegisterConditionalRatioFamily 后,这里会自动出现。',
              )}
            />
          </Card>
        )}

        {families.map((family) => (
          <Card
            key={family.key}
            title={family.label || family.key}
            bordered
            headerStyle={{ paddingBottom: 8 }}
          >
            {family.baseHint && (
              <Typography.Text
                type='tertiary'
                size='small'
                className='!block !mb-3'
              >
                {family.baseHint}
              </Typography.Text>
            )}
            <div className='space-y-3'>
              {(family.conditions || []).map((cond) => {
                const cur = cfg.models?.[family.key]?.[cond.key] || {
                  enabled: true,
                  multiplier: cond.defaultMul,
                };
                return (
                  <div
                    key={cond.key}
                    className='flex items-center gap-4 p-3 border border-slate-200 rounded-lg'
                  >
                    <Switch
                      size='small'
                      checked={cur.enabled !== false}
                      onChange={(v) =>
                        setCondition(family.key, cond.key, { enabled: v })
                      }
                    />
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-sm'>
                        {t(cond.label || cond.key)}
                      </div>
                      {cond.match && (
                        <div className='text-xs text-slate-500 mt-0.5'>
                          {t('匹配条件')}: {cond.match}
                        </div>
                      )}
                      {cond.hint && (
                        <div className='text-xs text-slate-400 mt-0.5'>
                          {cond.hint}
                        </div>
                      )}
                    </div>
                    <div className='flex items-center gap-2'>
                      <Typography.Text type='tertiary' size='small'>
                        {t('乘子')}
                      </Typography.Text>
                      <InputNumber
                        size='small'
                        min={0}
                        max={10}
                        step={0.001}
                        precision={4}
                        value={cur.multiplier}
                        onChange={(v) =>
                          setCondition(family.key, cond.key, {
                            multiplier: Number(v) || 0,
                          })
                        }
                        style={{ width: 100 }}
                        disabled={!cur.enabled}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        <div className='flex items-center gap-2'>
          <Button
            theme='solid'
            type='primary'
            loading={saving}
            onClick={submit}
            disabled={familiesLoading}
          >
            {t('保存')}
          </Button>
          <Button onClick={reset} disabled={familiesLoading || empty}>
            {t('重置为默认值')}
          </Button>
        </div>
      </div>
    </Spin>
  );
}
