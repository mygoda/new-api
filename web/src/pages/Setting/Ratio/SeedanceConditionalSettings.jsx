/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  InputNumber,
  Space,
  Switch,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../../helpers';

/**
 * SeedanceConditionalSettings — Seedance 视频条件分价的可视化编辑器。
 *
 * 数据流:
 *   - 父级 RatioSetting 已经把 SeedanceConditionalRatios option 加进 inputs(JSON 字符串)
 *   - 本组件解析成 cfg state,提供 Switch + InputNumber 两个交互
 *   - 保存时 stringify 回 JSON,PUT /api/option/
 *
 * 条件 key 与 backend pricing.go 的 lookup 一一对应:
 *   seedance-1-5-pro: silent / draft_audio / draft_silent
 *   seedance-2-0:     1080p_no_video / 720p_with_video / 1080p_with_video
 *   seedance-2-0-fast: with_video
 */

const FAMILIES = [
  {
    key: 'seedance-1-5-pro',
    label: 'Seedance 1.5 pro',
    base: '基准:有声 720p (16 元/M token)',
    conditions: [
      {
        key: 'silent',
        label: '无声',
        match: 'generate_audio = false',
        defaultMul: 0.5,
        hint: '官方:8 元/M(基准 16 → 50%)',
      },
      {
        key: 'draft_audio',
        label: 'Draft 有声',
        match: 'draft = true 且 generate_audio = true',
        defaultMul: 0.6,
        hint: '官方折算系数 0.6',
      },
      {
        key: 'draft_silent',
        label: 'Draft 无声',
        match: 'draft = true 且 generate_audio = false',
        defaultMul: 0.35,
        hint: '官方:无声 0.5 × Draft 0.7',
      },
    ],
  },
  {
    key: 'seedance-2-0',
    label: 'Seedance 2.0',
    base: '基准:720p 输入不含视频 (46 元/M token)',
    conditions: [
      {
        key: '1080p_no_video',
        label: '1080p (输入不含视频)',
        match: 'resolution = 1080p 且 输入不含视频',
        defaultMul: 1.109,
        hint: '官方:51 元/M(46 → 51,1.109×)',
      },
      {
        key: '720p_with_video',
        label: '输入含视频 (480p/720p)',
        match: '输入含视频 且 resolution ≠ 1080p',
        defaultMul: 0.609,
        hint: '官方:28 元/M(46 → 28,0.609×)',
      },
      {
        key: '1080p_with_video',
        label: '输入含视频 (1080p)',
        match: 'resolution = 1080p 且 输入含视频',
        defaultMul: 0.674,
        hint: '官方:31 元/M(46 → 31,0.674×)',
      },
    ],
  },
  {
    key: 'seedance-2-0-fast',
    label: 'Seedance 2.0 fast',
    base: '基准:720p 输入不含视频 (37 元/M token)',
    conditions: [
      {
        key: 'with_video',
        label: '输入含视频',
        match: '输入含视频(2.0 fast 不支持 1080p)',
        defaultMul: 0.595,
        hint: '官方:22 元/M(37 → 22,0.595×)',
      },
    ],
  },
];

function buildDefaultCfg() {
  const models = {};
  for (const f of FAMILIES) {
    const conds = {};
    for (const c of f.conditions) {
      conds[c.key] = { enabled: true, multiplier: c.defaultMul };
    }
    models[f.key] = conds;
  }
  return { enabled: true, models };
}

function parseCfg(jsonStr) {
  if (!jsonStr || !jsonStr.trim()) return buildDefaultCfg();
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
  return buildDefaultCfg();
}

export default function SeedanceConditionalSettings(props) {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState(buildDefaultCfg());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = props.options?.SeedanceConditionalRatios || '';
    setCfg(parseCfg(raw));
  }, [props.options]);

  const setMaster = (enabled) => setCfg({ ...cfg, enabled });

  const setCondition = (familyKey, condKey, patch) => {
    const models = { ...cfg.models };
    const conds = { ...(models[familyKey] || {}) };
    conds[condKey] = { ...(conds[condKey] || { enabled: true, multiplier: 1 }), ...patch };
    models[familyKey] = conds;
    setCfg({ ...cfg, models });
  };

  const reset = () => setCfg(buildDefaultCfg());

  const submit = async () => {
    setLoading(true);
    try {
      const value = JSON.stringify(cfg);
      const res = await API.put('/api/option/', {
        key: 'SeedanceConditionalRatios',
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
      setLoading(false);
    }
  };

  return (
    <div className='space-y-4'>
      <Banner
        type='info'
        description={t(
          'Seedance 系列视频按 token 计费,但单价随条件浮动(有声/无声、Draft、是否含视频输入、分辨率等)。' +
            '基准价在「模型倍率设置」里以 ModelRatio 配置;这里配置相对基准的乘子。' +
            '关闭总开关或单条则该条件不应用乘子(走基准价)。',
        )}
        closeIcon={null}
      />

      <Card
        title={t('总开关')}
        bordered
        headerStyle={{ paddingBottom: 8 }}
      >
        <Space align='center'>
          <Switch
            checked={cfg.enabled}
            onChange={setMaster}
            checkedText={t('启用条件分价')}
            uncheckedText={t('已禁用')}
          />
          <Typography.Text type='tertiary' size='small'>
            {t('关闭后所有 Seedance 模型只按基准 ModelRatio 计费,不应用任何乘子。')}
          </Typography.Text>
        </Space>
      </Card>

      {FAMILIES.map((family) => (
        <Card
          key={family.key}
          title={family.label}
          bordered
          headerStyle={{ paddingBottom: 8 }}
        >
          <Typography.Text type='tertiary' size='small' className='!block !mb-3'>
            {family.base}
          </Typography.Text>
          <div className='space-y-3'>
            {family.conditions.map((cond) => {
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
                    <div className='font-medium text-sm'>{t(cond.label)}</div>
                    <div className='text-xs text-slate-500 mt-0.5'>
                      {t('匹配条件')}: {cond.match}
                    </div>
                    <div className='text-xs text-slate-400 mt-0.5'>{cond.hint}</div>
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
        <Button theme='solid' type='primary' loading={loading} onClick={submit}>
          {t('保存')}
        </Button>
        <Button onClick={reset}>{t('重置为默认值')}</Button>
      </div>
    </div>
  );
}
