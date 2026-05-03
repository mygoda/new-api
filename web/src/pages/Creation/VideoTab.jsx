/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Button, Toast, Typography, Tooltip } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Send, Code2 } from 'lucide-react';

import ModelPicker from '../../components/creation/ModelPicker';
import PromptComposer from '../../components/creation/PromptComposer';
import ParamPanel from '../../components/creation/ParamPanel';
import AssetCard from '../../components/creation/AssetCard';
import ImageSlot from '../../components/creation/ImageSlot';
import PresetGrid from '../../components/creation/PresetGrid';
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
import { useVideoTaskPolling } from '../../hooks/creation/useVideoTaskPolling';
import { useDebugState } from '../../hooks/creation/useDebugState';
import { useDynamicModels } from '../../hooks/creation/useDynamicModels';
import { showErrorModal } from '../../utils/creation/errorReporter';
import { API } from '../../helpers/api';
import { tokenAuthHeader, loadActiveToken } from '../../services/creation/tokens';

const { Text } = Typography;
const MODALITY = 'video';

function defaultsFromSchema(schema) {
  const out = {};
  if (!schema?.fields) return out;
  for (const [name, field] of Object.entries(schema.fields)) {
    if (field.default !== undefined) out[name] = field.default;
  }
  return out;
}

const TaskPoller = ({ taskId, assetId, onUpdate, onTerminal }) => {
  useVideoTaskPolling(taskId, {
    onUpdate: (data) => onUpdate(assetId, data),
    onTerminal: (data) => onTerminal(assetId, data),
  });
  return null;
};

const VideoTab = () => {
  const { t } = useTranslation();
  const { models, loading: modelsLoading, getSchemaFor } = useDynamicModels(MODALITY);

  const initial = loadConfig(MODALITY) || {};
  const [model, setModel] = useState(initial.model || '');
  const schema = useMemo(() => getSchemaFor(model), [model, getSchemaFor]);
  const [params, setParams] = useState(initial.params || {});
  const [prompt, setPrompt] = useState(initial.prompt || '');
  const [mode, setMode] = useState(initial.mode || 't2v');
  const [imageFirst, setImageFirst] = useState(initial.image_first || '');
  const [imageLast, setImageLast] = useState(initial.image_last || '');
  const [submitting, setSubmitting] = useState(false);
  const [assets, setAssets] = useState(loadAssets);
  const debug = useDebugState();

  const supportedModes = schema?.modes || ['t2v'];

  // 自动选中 + 合并默认参数
  useEffect(() => {
    if (modelsLoading || models.length === 0) return;
    const exists = models.some((m) => m.modelName === model);
    if (!exists) {
      const firstModel = models[0].modelName;
      setModel(firstModel);
      const sch = getSchemaFor(firstModel);
      if (sch) setParams(defaultsFromSchema(sch));
      return;
    }
    const sch = getSchemaFor(model);
    if (sch) {
      const defaults = defaultsFromSchema(sch);
      setParams((prev) => {
        let needPatch = false;
        const next = { ...prev };
        for (const k of Object.keys(defaults)) {
          if (next[k] === undefined) {
            next[k] = defaults[k];
            needPatch = true;
          }
        }
        return needPatch ? next : prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsLoading, models]);

  React.useEffect(() => {
    if (!supportedModes.includes(mode)) {
      setMode('t2v');
      setImageFirst('');
      setImageLast('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

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

  useEffect(() => {
    saveConfig(MODALITY, { model, params, prompt, mode, image_first: imageFirst, image_last: imageLast });
  }, [model, params, prompt, mode, imageFirst, imageLast]);

  useEffect(() => {
    if (!schema || !prompt) {
      debug.setPreview(null);
      return;
    }
    try {
      const req = normalize(
        {
          model, prompt, mode,
          image_first: imageFirst || undefined,
          image_last: imageLast || undefined,
          ...params,
        },
        schema,
      );
      debug.setPreview(req.body, buildCurl(req));
    } catch {
      debug.setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, params, prompt, mode, imageFirst, imageLast]);

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

  const applyPreset = useCallback(({ prompt: p, model: m, params: presetParams }) => {
    if (m && m !== model) switchModel(m);
    setPrompt(p || '');
    if (presetParams) {
      setParams((prev) => ({ ...prev, ...presetParams }));
    }
    Toast.info(t('已为你填入推荐参数，点击「生成视频」开始 ✨'));
  }, [model, switchModel, t]);

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
    const url =
      data?.metadata?.url ||
      data?.metadata?.proxy_url ||
      data?.url ||
      '';
    const patch = isSuccess
      ? {
          status: 'success',
          assetUrl: url,
          actualQuota: data?.metadata?.quota,
          progress: 100,
        }
      : {
          status: 'failed',
          errorMessage:
            data?.error?.message || (data.status === 'timeout' ? '任务超时' : '生成失败'),
        };
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, ...patch } : a)),
    );
    updateAsset(assetId, patch);
    const taskId = (assets.find((a) => a.id === assetId) || {}).taskId;
    if (taskId) untrackActiveTask(taskId);
  }, [assets]);

  const handleSubmit = async () => {
    const unified = {
      model,
      prompt,
      mode,
      image_first: imageFirst || undefined,
      image_last: imageLast || undefined,
      ...params,
    };
    const errs = validate(unified, schema);
    if (errs.length) {
      Toast.warning(t(errs[0].msg));
      return;
    }

    if (!loadActiveToken()?.key) {
      Toast.warning(t('请先在右上角选择或创建一个 Token'));
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
      status: 'queued',
      createdAt: Date.now(),
      estimatedQuota: estimate,
    };
    setAssets((prev) => [placeholder, ...prev]);
    appendAsset(placeholder);

    try {
      const res = await API.post(req.url, req.body, { headers: tokenAuthHeader() });
      debug.setResponse(res?.data ?? res);
      const payload = res?.data?.data ?? res?.data;
      const taskId = payload?.task_id || payload?.id;
      if (!taskId) {
        throw new Error('upstream returned no task_id');
      }
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
      showErrorModal(e, { title: t('视频生成失败') });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplay = (asset) => {
    if (asset.modelName !== model) switchModel(asset.modelName);
    if (asset.params) setParams(asset.params);
    setPrompt(asset.prompt || '');
  };

  const handleRetry = (asset) => {
    if (asset.modelName !== model) switchModel(asset.modelName);
    if (asset.params) setParams(asset.params);
    setPrompt(asset.prompt || '');
    setTimeout(() => handleSubmit(), 80);
  };

  const handleSwitchModel = (asset) => {
    setPrompt(asset.prompt || '');
    if (asset.params) setParams(asset.params);
    Toast.info(t('请在左侧选择一个新模型，再点击「生成视频」'));
  };

  const handleDelete = (asset) => {
    setAssets(removeAsset(asset.id));
    if (asset.taskId) untrackActiveTask(asset.taskId);
  };

  const videoAssets = assets.filter((a) => a.modality === MODALITY);
  const activeTasks = videoAssets.filter(
    (a) => a.taskId && (a.status === 'in_progress' || a.status === 'queued'),
  );

  return (
    <div className='flex h-full overflow-hidden bg-[#fafafa]'>
      {activeTasks.map((a) => (
        <TaskPoller
          key={a.taskId + ':' + a.id}
          taskId={a.taskId}
          assetId={a.id}
          onUpdate={handleTaskUpdate}
          onTerminal={handleTaskTerminal}
        />
      ))}

      {/* 左侧 - 设置面板 */}
      <aside className='w-[280px] flex-shrink-0 overflow-y-auto bg-white border-r border-gray-200/70'>
        <section className='p-4 border-b border-gray-100'>
          <div className='flex items-center justify-between mb-3'>
            <Text strong className='!text-[13px] !text-gray-900'>
              {t('模型')}
            </Text>
            {models.length > 0 && (
              <Text type='tertiary' className='!text-[11px]'>
                {models.length} {t('个可用')}
              </Text>
            )}
          </div>
          <ModelPicker
            models={models}
            value={model}
            onChange={switchModel}
            loading={modelsLoading}
          />
        </section>

        {schema && (
          <section className='p-4'>
            <div className='flex items-center justify-between mb-4'>
              <Text strong className='!text-[13px] !text-gray-900'>
                {t('生成参数')}
              </Text>
            </div>
            <ParamPanel
              schema={schema}
              params={params}
              onParamChange={handleParamChange}
            />
          </section>
        )}
      </aside>

      {/* 中央 - 创作区 */}
      <main className='flex-1 flex flex-col overflow-hidden'>
        {/* 作品流 */}
        <div className='flex-1 overflow-y-auto'>
          {videoAssets.length === 0 ? (
            <div className='min-h-full flex items-center'>
              <PresetGrid
                modality={MODALITY}
                availableModels={models}
                onApply={applyPreset}
              />
            </div>
          ) : (
            <div className='p-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
                {videoAssets.map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    onReplay={handleReplay}
                    onRetry={handleRetry}
                    onSwitchModel={handleSwitchModel}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部固定 - 子模式 + 图槽 + Prompt + 提交 */}
        <div className='flex-shrink-0 px-6 pt-4 pb-5 bg-white border-t border-gray-200/70 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.06)] space-y-3'>
          <div className='max-w-4xl mx-auto space-y-3'>
            {/* 子模式 */}
            {supportedModes.length > 1 && (
              <div className='flex items-center gap-2'>
                <Text className='!text-[11px] !text-gray-500'>{t('生成模式')}</Text>
                <div className='inline-flex gap-0.5 p-0.5 bg-gray-100 rounded-md'>
                  {[
                    { key: 't2v', label: '文生视频' },
                    { key: 'i2v', label: '图生视频' },
                    { key: 'keyframes', label: '首尾帧' },
                  ]
                    .filter((m) => supportedModes.includes(m.key))
                    .map((m) => (
                      <button
                        key={m.key}
                        type='button'
                        onClick={() => setMode(m.key)}
                        className={[
                          'px-3 py-1 text-xs rounded transition-colors',
                          mode === m.key
                            ? 'bg-white text-gray-900 shadow-sm font-medium'
                            : 'text-gray-600 hover:text-gray-900',
                        ].join(' ')}
                      >
                        {t(m.label)}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {(mode === 'i2v' || mode === 'keyframes') && (
              <div
                className={
                  mode === 'keyframes'
                    ? 'grid grid-cols-2 gap-3 max-w-md'
                    : 'grid grid-cols-1 gap-3 max-w-xs'
                }
              >
                <ImageSlot label='首帧' value={imageFirst} onChange={setImageFirst} />
                {mode === 'keyframes' && (
                  <ImageSlot label='尾帧' value={imageLast} onChange={setImageLast} />
                )}
              </div>
            )}

            <PromptComposer
              modality={MODALITY}
              modelName={model}
              value={prompt}
              onChange={setPrompt}
              maxLength={1000}
              onSubmit={handleSubmit}
            />
            <div className='flex items-center justify-end'>
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
                  size='large'
                  icon={<Send size={15} />}
                  loading={submitting}
                  onClick={handleSubmit}
                  disabled={!model || !prompt.trim()}
                  className='!px-6'
                >
                  {t('生成视频')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {debug.showPanel && (
        <aside className='w-[400px] flex-shrink-0 border-l border-gray-200/70 bg-white overflow-hidden'>
          <DebugPanel
            debugData={debug.debugData}
            activeDebugTab={debug.activeTab}
            onActiveDebugTabChange={debug.setActiveTab}
            styleState={{ isMobile: false }}
            onCloseDebugPanel={debug.togglePanel}
            customRequestMode={false}
          />
        </aside>
      )}
    </div>
  );
};

export default VideoTab;
