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
import DebugPanel from '../../components/playground/DebugPanel';

import { IMAGE_MODELS, getModelSchema } from '../../constants/creation/models';
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
import { API } from '../../helpers/api';

const { Text } = Typography;
const MODALITY = 'image';

// MJ 任务轮询适配组件
const MjTaskPoller = ({ taskId, assetId, onUpdate, onTerminal }) => {
  useMjTaskPolling(taskId, {
    onUpdate: (data) => onUpdate(assetId, data),
    onTerminal: (data) => onTerminal(assetId, data),
  });
  return null;
};

// 从 schema 推导默认参数
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

  // 上次使用的模型 + 参数 + prompt（持久化在 localStorage）
  const initial = loadConfig(MODALITY) || {};
  const [model, setModel] = useState(initial.model || IMAGE_MODELS[0]?.modelName);
  const schema = useMemo(() => getModelSchema(model), [model]);
  const [params, setParams] = useState(
    initial.params || defaultsFromSchema(schema),
  );
  const [prompt, setPrompt] = useState(initial.prompt || '');
  const [submitting, setSubmitting] = useState(false);
  const [assets, setAssets] = useState(loadAssets);
  const debug = useDebugState();

  // 恢复活跃任务（MJ 异步）
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

  // 持久化
  React.useEffect(() => {
    saveConfig(MODALITY, { model, params, prompt });
  }, [model, params, prompt]);

  // 实时预览请求体
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
    const nextSchema = getModelSchema(next);
    if (!nextSchema) return;
    // 模型切换：保留同名字段，剥离不支持字段，缺失字段补默认
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
    const url = data?.metadata?.url || data?.url || '';
    const patch = isSuccess
      ? {
          status: 'success',
          assetUrl: url,
          progress: 100,
        }
      : {
          status: 'failed',
          errorMessage: data?.error?.message || '生成失败',
        };
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

    // 分支：同步 vs 异步
    const isAsync = schema.isAsync;

    try {
      const res = await API.post(req.url, req.body);
      debug.setResponse(res?.data ?? res);

      if (isAsync) {
        // MJ 等异步模型：返回 task_id，开始轮询
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
        // OpenAI Image 同步响应：data: [{ url, b64_json }]
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
    <div className='flex h-full overflow-hidden bg-gradient-to-br from-gray-50 to-white'>
      {/* MJ 任务轮询挂载点 */}
      {activeTasks.map((a) => (
        <MjTaskPoller
          key={a.taskId + ':' + a.id}
          taskId={a.taskId}
          assetId={a.id}
          onUpdate={handleTaskUpdate}
          onTerminal={handleTaskTerminal}
        />
      ))}

      {/* 左侧 - 设置面板 */}
      <div className='w-[340px] flex-shrink-0 overflow-y-auto border-r border-gray-200/60 bg-white/95 backdrop-blur-sm'>
        <div className='p-5 space-y-6'>
          {/* 模型选择 */}
          <div>
            <div className='flex items-center gap-2 mb-3'>
              <div className='w-1 h-4 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full'></div>
              <Text strong className='!text-sm !text-gray-900'>
                {t('选择模型')}
              </Text>
            </div>
            <ModelPicker
              models={IMAGE_MODELS}
              value={model}
              onChange={switchModel}
            />
          </div>

          {/* 参数面板 */}
          {schema && (
            <div>
              <div className='flex items-center gap-2 mb-3'>
                <div className='w-1 h-4 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full'></div>
                <Text strong className='!text-sm !text-gray-900'>
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
      </div>

      {/* 中央 - 创作画布 */}
      <div className='flex-1 flex flex-col overflow-hidden'>
        {/* 提示词输入区 */}
        <div className='p-5 border-b border-gray-200/60 bg-white/95 backdrop-blur-sm shadow-sm'>
          <PromptComposer
            modality={MODALITY}
            modelName={model}
            value={prompt}
            onChange={setPrompt}
            maxLength={1000}
          />
          <div className='mt-4 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <div className='px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100'>
                <Text className='!text-xs !text-blue-700 font-medium'>
                  {estimate != null
                    ? t('预计消耗 {{n}} 点', { n: estimate })
                    : t('提交后按实际计费')}
                </Text>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <Tooltip content={t('调试面板')}>
                <Button
                  theme={debug.showPanel ? 'solid' : 'light'}
                  type={debug.showPanel ? 'primary' : 'tertiary'}
                  icon={<Code2 size={15} />}
                  onClick={debug.togglePanel}
                  className='shadow-sm'
                />
              </Tooltip>
              <Button
                theme='solid'
                type='primary'
                size='large'
                icon={<Send size={16} />}
                loading={submitting}
                onClick={handleSubmit}
                className='shadow-lg shadow-blue-500/30 px-6'
              >
                {t('生成图像')}
              </Button>
            </div>
          </div>
        </div>

        {/* 作品展示区 */}
        <div className='flex-1 overflow-y-auto p-6'>
          {imageAssets.length === 0 ? (
            <div className='h-full flex flex-col items-center justify-center'>
              <div className='w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center mb-4'>
                <Send size={32} className='text-blue-600' strokeWidth={1.5} />
              </div>
              <Text className='!text-gray-400 !text-sm'>
                {t('还没有作品，先来生成第一张吧～')}
              </Text>
            </div>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5'>
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
        <div className='w-[420px] flex-shrink-0 border-l border-gray-200/60 bg-white/95 backdrop-blur-sm overflow-hidden shadow-xl'>
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
