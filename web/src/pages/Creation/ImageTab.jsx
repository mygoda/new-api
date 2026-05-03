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
import AssetGroupCard from '../../components/creation/AssetGroupCard';
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
import { useDebugState } from '../../hooks/creation/useDebugState';
import { useMjTaskPolling } from '../../hooks/creation/useMjTaskPolling';
import { useDynamicModels } from '../../hooks/creation/useDynamicModels';
import { groupAssets } from '../../utils/creation/groupAssets';
import { showErrorModal } from '../../utils/creation/errorReporter';
import { API } from '../../helpers/api';
import { tokenAuthHeader, loadActiveToken } from '../../services/creation/tokens';

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

  // 模型加载完成后自动选中 + 合并默认参数
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
    // 已选中模型仍然要补全缺失的字段默认值（用户上次保存可能不全）
    const sch = getSchemaFor(model);
    if (sch) {
      const defaults = defaultsFromSchema(sch);
      setParams((prev) => {
        // 只在缺失字段时补，不覆盖已有值
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
    // 保留同名字段（用户体验优化：切换模型不丢失参数）
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

  // 应用 preset：一键填入 prompt + 模型 + 参数
  const applyPreset = useCallback(({ prompt: p, model: m, params: presetParams }) => {
    if (m && m !== model) switchModel(m);
    setPrompt(p || '');
    if (presetParams) {
      setParams((prev) => ({ ...prev, ...presetParams }));
    }
    Toast.info(t('已为你填入推荐参数，点击「生成图像」开始 ✨'));
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
      status: 'pending',
      createdAt: Date.now(),
      estimatedQuota: estimate,
    };
    setAssets((prev) => [placeholder, ...prev]);
    appendAsset(placeholder);

    const isAsync = schema.isAsync;

    try {
      const res = await API.post(req.url, req.body, { headers: tokenAuthHeader() });
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

        // 同次提交的多张图共享 groupId（用于聚合卡片）
        const groupId = placeholderId;
        const created = items.map((it, idx) => ({
          id: genId() + '-' + idx,
          groupId,
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
      showErrorModal(e, { title: t('图像生成失败') });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplay = (asset) => {
    if (asset.modelName !== model) switchModel(asset.modelName);
    if (asset.params) setParams(asset.params);
    setPrompt(asset.prompt || '');
  };

  // 失败 → 同参重试（直接 submit，不修改任何状态）
  const handleRetry = (asset) => {
    if (asset.modelName !== model) switchModel(asset.modelName);
    if (asset.params) setParams(asset.params);
    setPrompt(asset.prompt || '');
    // 给一个短延迟，等参数 setState 完成
    setTimeout(() => handleSubmit(), 80);
  };

  // 失败 → 换个模型（保留 prompt 参数，让用户从模型列表挑）
  const handleSwitchModel = (asset) => {
    setPrompt(asset.prompt || '');
    if (asset.params) setParams(asset.params);
    Toast.info(t('请在左侧选择一个新模型，再点击「生成图像」'));
  };

  const handleDelete = (asset) => {
    setAssets(removeAsset(asset.id));
    if (asset.taskId) untrackActiveTask(asset.taskId);
  };

  // 删除整组（多图聚合）
  const handleDeleteGroup = (group) => {
    if (!group?.items) return;
    let next = assets;
    for (const it of group.items) {
      next = next.filter((a) => a.id !== it.id);
      if (it.taskId) untrackActiveTask(it.taskId);
    }
    setAssets(next);
    try {
      localStorage.setItem('creation:assets:v1', JSON.stringify(next.slice(0, 1000)));
    } catch {}
  };

  // 高质量重生成单张：把 quality 拉到 high，n=1
  const handleUpscale = (group, idx) => {
    if (group.modelName !== model) switchModel(group.modelName);
    setPrompt(group.prompt || '');
    setParams({ ...(group.params || {}), n: 1, quality: 'high' });
    Toast.info(t('已切换到高质量模式，点击「生成图像」获取更精细版本'));
  };

  // 基于某张生成变体：保留 prompt，n=4
  const handleVariation = (group, idx) => {
    if (group.modelName !== model) switchModel(group.modelName);
    setPrompt(group.prompt || '');
    setParams({ ...(group.params || {}), n: 4 });
    Toast.info(t('已准备好生成 4 张变体，点击「生成图像」'));
  };

  const imageAssets = assets.filter((a) => a.modality === MODALITY);
  const activeTasks = imageAssets.filter(
    (a) => a.taskId && (a.status === 'in_progress' || a.status === 'queued'),
  );
  const groupedAssets = useMemo(() => groupAssets(imageAssets), [imageAssets]);

  return (
    <div className='flex h-full overflow-hidden bg-[#fafafa]'>
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
      <aside className='w-[280px] flex-shrink-0 overflow-y-auto bg-white border-r border-gray-200/70'>
        {/* 模型区 */}
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

        {/* 参数区 */}
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
        {/* 作品流（占大头） */}
        <div className='flex-1 overflow-y-auto'>
          {imageAssets.length === 0 ? (
            <div className='min-h-full flex items-center'>
              <PresetGrid
                modality={MODALITY}
                availableModels={models}
                onApply={applyPreset}
              />
            </div>
          ) : (
            <div className='p-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4'>
                {groupedAssets.map((g) => {
                  const allSuccess = (g.items || []).every((it) => it.status === 'success');
                  const isMulti = (g.items || []).length > 1 && allSuccess;
                  if (isMulti) {
                    return (
                      <AssetGroupCard
                        key={g.id}
                        group={g}
                        onReplay={handleReplay}
                        onUpscale={handleUpscale}
                        onVariation={handleVariation}
                        onDelete={handleDeleteGroup}
                      />
                    );
                  }
                  const single = g.items[0];
                  return (
                    <AssetCard
                      key={single.id}
                      asset={single}
                      onReplay={handleReplay}
                      onRetry={handleRetry}
                      onSwitchModel={handleSwitchModel}
                      onDelete={handleDelete}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 底部固定 - Prompt 输入 + 提交（仪式感） */}
        <div className='flex-shrink-0 px-6 pt-4 pb-5 bg-white border-t border-gray-200/70 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.06)]'>
          <div className='max-w-4xl mx-auto'>
            <PromptComposer
              modality={MODALITY}
              modelName={model}
              value={prompt}
              onChange={setPrompt}
              maxLength={1000}
              onSubmit={handleSubmit}
            />
            <div className='mt-3 flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                {estimate != null ? (
                  <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-600'>
                    <span className='w-1 h-1 rounded-full bg-blue-500' />
                    {t('预计 {{n}} 点', { n: estimate })}
                  </span>
                ) : (
                  <Text type='tertiary' className='!text-[11px]'>
                    {t('按实际生成量计费')}
                  </Text>
                )}
              </div>
              <div className='flex items-center gap-2'>
                <Tooltip content={t('调试面板（查看请求体 / cURL）')}>
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
                  {t('生成图像')}
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

export default ImageTab;
