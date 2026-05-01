/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, Button, Toast, Typography, Tooltip } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Send, Code2, Sparkles } from 'lucide-react';

import ModelPicker from '../../components/creation/ModelPicker';
import PromptComposer from '../../components/creation/PromptComposer';
import ParamPanel from '../../components/creation/ParamPanel';
import AssetCard from '../../components/creation/AssetCard';
import DebugPanel from '../../components/playground/DebugPanel';

import { normalize, validate, buildCurl } from '../../services/creation/normalizer';
import {
  loadConfig,
  saveConfig,
  loadAssets,
  appendAsset,
  removeAsset,
  updateAsset,
  trackActiveTask,
  untrackActiveTask,
  loadActiveTasks,
  genId,
} from '../../services/creation/storage';
import { useDebugState } from '../../hooks/creation/useDebugState';
import { useMjTaskPolling } from '../../hooks/creation/useMjTaskPolling';
import { useDynamicModels } from '../../hooks/creation/useDynamicModels';
import { API } from '../../helpers/api';

const { Text } = Typography;
const MODALITY = 'image';

const MjTaskPoller = ({ taskId, assetId, onUpdate, onTerminal }) => {
  useMjTaskPolling(taskId, {
    onUpdate: (data) => onUpdate(assetId, data),
    onTerminal: (data) => onTerminal(assetId, data),
  });
  return null;
};

function defaultsFromSchema(schema) {
  const out = {};
  if (!schema?.fields) return out;
  for (const [name, field] of Object.entries(schema.fields)) {
    if (field.default !== undefined) out[name] = field.default;
  }
  return out;
}

const ImageTab = () => {
  const { t } = useTranslation();
  const { models, loading: modelsLoading, getSchemaFor } = useDynamicModels(MODALITY);

  const initial = loadConfig(MODALITY) || {};
  const [model, setModel] = useState(initial.model || '');
  const schema = useMemo(() => getSchemaFor(model), [model, getSchemaFor]);
  const [params, setParams] = useState(initial.params || {});
  const [prompt, setPrompt] = useState(initial.prompt || '');
  const [submitting, setSubmitting] = useState(false);
  const [assets, setAssets] = useState(loadAssets);
  const debug = useDebugState();

  // 模型加载完成后自动选中
  useEffect(() => {
    if (modelsLoading || models.length === 0) return;
    const exists = models.some((m) => m.modelName === model);
    if (!exists) {
      const firstModel = models[0].modelName;
      setModel(firstModel);
      const sch = getSchemaFor(firstModel);
      if (sch) setParams(defaultsFromSchema(sch));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsLoading, models]);

  // 恢复活跃任务
  useEffect(() => {
    const active = loadActiveTasks();
    if (active.length === 0) return;
    setAssets((prev) => {
      const known = new Set(prev.map((a) => a.taskId).filter(Boolean));
      const toAdd = active
        .filter((t) => !known.has(t.taskId) && t.modality === MODALITY)
        .map((t) => ({
          id: genId(),
          modality: MODALITY,
          modelName: t.modelName,
          prompt: t.prompt,
          params: t.params,
          status: 'in_progress',
          taskId: t.taskId,
          createdAt: t.createdAt || Date.now(),
        }));
      return [...toAdd, ...prev];
    });
  }, []);

  React.useEffect(() => {
    saveConfig(MODALITY, { model, params, prompt });
  }, [model, params, prompt]);

  useEffect(() => {
    if (!schema || !prompt) {
      debug.setPreview(null);
      return;
    }
    try {
      const req = normalize({ model, prompt, ...params }, schema);
      debug.setPreview(req.body, buildCurl(req));
    } catch {
      debug.setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, params, prompt]);

  const switchModel = useCallback((next) => {
    const nextSchema = getSchemaFor(next);
    if (!nextSchema) return;
    const filtered = {};
    for (const k of Object.keys(nextSchema.fields || {})) {
      filtered[k] =
        params[k] !== undefined ? params[k] : nextSchema.fields[k].default;
    }
    setParams(filtered);
    setModel(next);
  }, [params, getSchemaFor]);

  const handleParamChange = useCallback((name, value) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  }, []);

  const estimate = useMemo(() => {
    if (!schema?.pricing?.estimate) return null;
    try {
      return schema.pricing.estimate({ ...params, prompt });
    } catch {
      return null;
    }
  }, [schema, params, prompt]);

  const handleTaskUpdate = useCallback((assetId, data) => {
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId
          ? {
              ...a,
              status: data.status || a.status,
              progress: data.progress ?? a.progress,
            }
          : a,
      ),
    );
    if (data.status) updateAsset(assetId, { status: data.status, progress: data.progress });
  }, []);

  const handleTaskTerminal = useCallback((assetId, data) => {
    const isSuccess = data.status === 'completed';
    const url = data?.metadata?.url || data?.url || '';
    const patch = isSuccess
      ? { status: 'success', assetUrl: url, progress: 100 }
      : { status: 'failed', errorMessage: data?.error?.message || '生成失败' };
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, ...patch } : a)),
    );
    updateAsset(assetId, patch);
    const taskId = (assets.find((a) => a.id === assetId) || {}).taskId;
    if (taskId) untrackActiveTask(taskId);
  }, [assets]);

  const handleSubmit = async () => {
    const unified = { model, prompt, ...params };
    const errs = validate(unified, schema);
    if (errs.length) {
      Toast.warning(t(errs[0].msg));
      return;
    }

    let req;
    try {
      req = normalize(unified, schema);
    } catch (e) {
      Toast.error(`${t('协议适配失败')}: ${e.message}`);
      return;
    }

    setSubmitting(true);
    debug.setRequest(req.body);
    const placeholderId = genId();
    const placeholder = {
      id: placeholderId,
      modality: MODALITY,
      modelName: model,
      prompt,
      params: { ...params },
      status: 'pending',
      createdAt: Date.now(),
      estimatedQuota: estimate,
    };
    setAssets((prev) => [placeholder, ...prev]);
    appendAsset(placeholder);

    const isAsync = schema.isAsync;

    try {
      const res = await API.post(req.url, req.body);
      debug.setResponse(res?.data ?? res);

      if (isAsync) {
        const payload = res?.data?.data ?? res?.data;
        const taskId = payload?.result || payload?.task_id || payload?.id;
        if (!taskId) throw new Error('upstream returned no task_id');
        const updated = { status: 'in_progress', taskId };
        setAssets((prev) =>
          prev.map((a) => (a.id === placeholderId ? { ...a, ...updated } : a)),
        );
        updateAsset(placeholderId, updated);
        trackActiveTask({
          taskId,
          modelName: model,
          prompt,
          params: { ...params },
          createdAt: Date.now(),
          modality: MODALITY,
        });
        Toast.info(t('任务已提交，开始生成…'));
      } else {
        const items = res?.data?.data || [];
        if (!items.length) throw new Error('upstream returned no data');

        const created = items.map((it, idx) => ({
          id: genId() + '-' + idx,
          modality: MODALITY,
          modelName: model,
          prompt,
          params: { ...params },
          status: 'success',
          assetUrl: it.url || (it.b64_json ? `data:image/png;base64,${it.b64_json}` : ''),
          createdAt: Date.now(),
          estimatedQuota: estimate,
        }));

        setAssets((prev) => {
          const withoutPlaceholder = prev.filter((a) => a.id !== placeholderId);
          const next = [...created, ...withoutPlaceholder];
          try {
            localStorage.setItem(
              'creation:assets:v1',
              JSON.stringify(next.slice(0, 1000)),
            );
          } catch {}
          return next;
        });
        Toast.success(t('生成成功'));
      }
    } catch (e) {
      const msg =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        '请求失败';
      debug.setResponse(e?.response?.data ?? { error: msg });
      const patch = { status: 'failed', errorMessage: msg };
      setAssets((prev) =>
        prev.map((a) => (a.id === placeholderId ? { ...a, ...patch } : a)),
      );
      updateAsset(placeholderId, patch);
      Toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplay = (asset) => {
    if (asset.modelName !== model) switchModel(asset.modelName);
    if (asset.params) setParams(asset.params);
    setPrompt(asset.prompt || '');
  };

  const handleDelete = (asset) => {
    setAssets(removeAsset(asset.id));
    if (asset.taskId) untrackActiveTask(asset.taskId);
  };

  const imageAssets = assets.filter((a) => a.modality === MODALITY);
  const activeTasks = imageAssets.filter(
    (a) => a.taskId && (a.status === 'in_progress' || a.status === 'queued'),
  );

  return (
    <div className='flex h-full overflow-hidden'>
      {activeTasks.map((a) => (
        <MjTaskPoller
          key={a.taskId + ':' + a.id}
          taskId={a.taskId}
          assetId={a.id}
          onUpdate={handleTaskUpdate}
          onTerminal={handleTaskTerminal}
        />
      ))}

      {/* 左侧 - 设置面板（与 Playground 风格一致） */}
      <div className='w-80 flex-shrink-0 overflow-y-auto border-r border-gray-100 bg-white'>
        <Card bordered={false} bodyStyle={{ padding: 16 }}>
          <div className='space-y-5'>
            {/* 模型选择 */}
            <div>
              <div className='flex items-center gap-2 mb-2'>
                <Sparkles size={16} className='text-gray-500' />
                <Text strong className='!text-sm'>
                  {t('模型')}
                </Text>
                <Text type='tertiary' className='!text-xs ml-auto'>
                  {models.length} {t('个可用')}
                </Text>
              </div>
              <ModelPicker
                models={models}
                value={model}
                onChange={switchModel}
                loading={modelsLoading}
              />
            </div>

            {/* 参数 */}
            {schema && (
              <div>
                <div className='flex items-center gap-2 mb-2'>
                  <Text strong className='!text-sm'>
                    {t('生成参数')}
                  </Text>
                </div>
                <ParamPanel
                  schema={schema}
                  params={params}
                  onParamChange={handleParamChange}
                />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 中央 - 创作画布 */}
      <div className='flex-1 flex flex-col overflow-hidden'>
        <div className='p-4 border-b border-gray-100 bg-white'>
          <PromptComposer
            modality={MODALITY}
            modelName={model}
            value={prompt}
            onChange={setPrompt}
            maxLength={1000}
          />
          <div className='mt-3 flex items-center justify-between'>
            <Text type='tertiary' className='!text-xs'>
              {estimate != null
                ? t('预计消耗 {{n}} 点', { n: estimate })
                : t('提交后按实际计费')}
            </Text>
            <div className='flex items-center gap-2'>
              <Tooltip content={t('调试面板')}>
                <Button
                  theme={debug.showPanel ? 'solid' : 'borderless'}
                  type='tertiary'
                  icon={<Code2 size={14} />}
                  onClick={debug.togglePanel}
                />
              </Tooltip>
              <Button
                theme='solid'
                type='primary'
                icon={<Send size={14} />}
                loading={submitting}
                onClick={handleSubmit}
                disabled={!model || !prompt.trim()}
              >
                {t('生成图像')}
              </Button>
            </div>
          </div>
        </div>

        <div className='flex-1 overflow-y-auto p-4 bg-gray-50'>
          {imageAssets.length === 0 ? (
            <div className='h-full flex items-center justify-center text-gray-400 text-sm'>
              {t('还没有作品，先来生成第一张吧～')}
            </div>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4'>
              {imageAssets.map((a) => (
                <AssetCard
                  key={a.id}
                  asset={a}
                  onReplay={handleReplay}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {debug.showPanel && (
        <div className='w-96 flex-shrink-0 border-l border-gray-100 bg-white overflow-hidden'>
          <DebugPanel
            debugData={debug.debugData}
            activeDebugTab={debug.activeTab}
            onActiveDebugTabChange={debug.setActiveTab}
            styleState={{ isMobile: false }}
            onCloseDebugPanel={debug.togglePanel}
            customRequestMode={false}
          />
        </div>
      )}
    </div>
  );
};

export default ImageTab;
