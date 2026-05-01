/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, Button, Toast, Typography, Tooltip } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Send, Code2 } from 'lucide-react';

import ModelPicker from '../../components/creation/ModelPicker';
import PromptComposer from '../../components/creation/PromptComposer';
import ParamPanel from '../../components/creation/ParamPanel';
import AssetCard from '../../components/creation/AssetCard';
import ImageSlot from '../../components/creation/ImageSlot';
import DebugPanel from '../../components/playground/DebugPanel';

import { VIDEO_MODELS, getModelSchema } from '../../constants/creation/models';
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
import { API } from '../../helpers/api';

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

// 单任务的轮询适配组件：把 Hook 包成 child component 才能动态多个
const TaskPoller = ({ taskId, assetId, onUpdate, onTerminal }) => {
  useVideoTaskPolling(taskId, {
    onUpdate: (data) => onUpdate(assetId, data),
    onTerminal: (data) => onTerminal(assetId, data),
  });
  return null;
};

const VideoTab = () => {
  const { t } = useTranslation();

  const initial = loadConfig(MODALITY) || {};
  const [model, setModel] = useState(initial.model || VIDEO_MODELS[0]?.modelName);
  const schema = useMemo(() => getModelSchema(model), [model]);
  const [params, setParams] = useState(
    initial.params || defaultsFromSchema(schema),
  );
  const [prompt, setPrompt] = useState(initial.prompt || '');
  const [mode, setMode] = useState(initial.mode || 't2v');
  const [imageFirst, setImageFirst] = useState(initial.image_first || '');
  const [imageLast, setImageLast] = useState(initial.image_last || '');
  const [submitting, setSubmitting] = useState(false);
  const [assets, setAssets] = useState(loadAssets);
  const debug = useDebugState();

  // 模型支持的子模式集合
  const supportedModes = schema?.modes || ['t2v'];

  // 模型切换：若当前 mode 不支持，强制回退到 t2v
  React.useEffect(() => {
    if (!supportedModes.includes(mode)) {
      setMode('t2v');
      setImageFirst('');
      setImageLast('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // 进入页面时恢复轮询：localStorage:active_tasks 里未结束的任务
  useEffect(() => {
    const active = loadActiveTasks();
    if (active.length === 0) return;
    setAssets((prev) => {
      // 给每个 active task 在 list 中找 / 创建对应 asset
      const known = new Set(prev.map((a) => a.taskId).filter(Boolean));
      const toAdd = active
        .filter((t) => !known.has(t.taskId))
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

  // 实时预览请求体
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
    const nextSchema = getModelSchema(next);
    if (!nextSchema) return;
    const filtered = {};
    for (const k of Object.keys(nextSchema.fields || {})) {
      filtered[k] =
        params[k] !== undefined ? params[k] : nextSchema.fields[k].default;
    }
    setParams(filtered);
    setModel(next);
  }, [params]);

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
    const taskId = (
      assets.find((a) => a.id === assetId) || {}
    ).taskId;
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
      const res = await API.post(req.url, req.body);
      debug.setResponse(res?.data ?? res);
      // 任务接口返回：{ task_id, status } 或直接 OpenAIVideo 形态
      const payload = res?.data?.data ?? res?.data;
      const taskId = payload?.task_id || payload?.id;
      if (!taskId) {
        throw new Error('upstream returned no task_id');
      }
      const updated = {
        status: 'in_progress',
        taskId,
      };
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

  const videoAssets = assets.filter((a) => a.modality === MODALITY);
  const activeTasks = videoAssets.filter(
    (a) => a.taskId && (a.status === 'in_progress' || a.status === 'queued'),
  );

  return (
    <div className='flex h-full overflow-hidden'>
      {/* 隐藏的轮询挂载点 — 每个进行中任务一个 */}
      {activeTasks.map((a) => (
        <TaskPoller
          key={a.taskId + ':' + a.id}
          taskId={a.taskId}
          assetId={a.id}
          onUpdate={handleTaskUpdate}
          onTerminal={handleTaskTerminal}
        />
      ))}

      <div className='w-80 flex-shrink-0 overflow-y-auto border-r border-gray-100 bg-white'>
        <Card bordered={false} bodyStyle={{ padding: 16 }}>
          <div className='space-y-5'>
            <div>
              <Text strong className='!text-sm'>{t('模型')}</Text>
              <div className='mt-2'>
                <ModelPicker
                  models={VIDEO_MODELS}
                  value={model}
                  onChange={switchModel}
                />
              </div>
            </div>
            {schema && (
              <ParamPanel
                schema={schema}
                params={params}
                onParamChange={handleParamChange}
              />
            )}
          </div>
        </Card>
      </div>

      <div className='flex-1 flex flex-col overflow-hidden'>
        <div className='p-4 border-b border-gray-100 bg-white space-y-3'>
          {/* 子模式 Pill */}
          {supportedModes.length > 1 && (
            <div className='flex flex-wrap gap-2'>
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
                      'px-3 py-1 text-xs rounded-full border transition-colors',
                      mode === m.key
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
                    ].join(' ')}
                  >
                    {t(m.label)}
                  </button>
                ))}
            </div>
          )}

          {/* I2V / Keyframes 的图槽 */}
          {(mode === 'i2v' || mode === 'keyframes') && (
            <div
              className={
                mode === 'keyframes'
                  ? 'grid grid-cols-2 gap-3'
                  : 'grid grid-cols-1 gap-3 max-w-xs'
              }
            >
              <ImageSlot
                label='首帧'
                value={imageFirst}
                onChange={setImageFirst}
              />
              {mode === 'keyframes' && (
                <ImageSlot
                  label='尾帧'
                  value={imageLast}
                  onChange={setImageLast}
                />
              )}
            </div>
          )}

          <PromptComposer
            modality={MODALITY}
            modelName={model}
            value={prompt}
            onChange={setPrompt}
            maxLength={1000}
          />
          <div className='flex items-center justify-between'>
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
              >
                {t('生成视频')}
              </Button>
            </div>
          </div>
        </div>

        <div className='flex-1 overflow-y-auto p-4 bg-gray-50'>
          {videoAssets.length === 0 ? (
            <div className='h-full flex items-center justify-center text-gray-400 text-sm'>
              {t('还没有作品，先来生成第一段吧～')}
            </div>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {videoAssets.map((a) => (
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

export default VideoTab;
