/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Button, Toast, Typography, Tooltip } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Send, Code2 } from 'lucide-react';

import ModelPicker from '../../components/creation/ModelPicker';
import PromptComposer from '../../components/creation/PromptComposer';
import ParamPanel from '../../components/creation/ParamPanel';
import AssetCard from '../../components/creation/AssetCard';
import ImageSlot from '../../components/creation/ImageSlot';
import VideoSlot from '../../components/creation/VideoSlot';
import AudioSlot from '../../components/creation/AudioSlot';
import PresetGrid from '../../components/creation/PresetGrid';
import CreationDebugPanel from '../../components/creation/CreationDebugPanel';
import ModelFilterInfo from '../../components/creation/ModelFilterInfo';

import { normalize, validate } from '../../services/creation/normalizer';
import {
  upsertCloudAssetByTaskId,
  updateCloudAsset,
  listCloudAssets,
} from '../../services/creation/cloudGallery';
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

const TimelineItem = ({ createdAt, children }) => {
  const d = new Date(createdAt || Date.now());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return (
    <div className='flex gap-3'>
      <div className='flex flex-col items-center pt-2'>
        <Text type='tertiary' className='!text-[10px] !text-gray-400 tabular-nums leading-none'>
          {hh}:{mm}
        </Text>
        <div className='w-2 h-2 rounded-full bg-violet-300 mt-1.5 ring-4 ring-violet-50' />
        <div className='w-px flex-1 bg-gray-200/60 mt-1' />
      </div>
      <div className='flex-1 min-w-0 pb-2'>{children}</div>
    </div>
  );
};

function formatDayLabel(d) {
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isToday) return '今天';
  if (isYesterday) return '昨天';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 多模态参考槽位面板:管理 1~9 图 / 0~3 视频 / 0~3 音频。
// 内部按 PDF 上限做软约束;后端 normalizer 再做硬校验。
const RefSlotPanel = ({
  t,
  imagesRef,
  setImagesRef,
  videosRef,
  setVideosRef,
  audiosRef,
  setAudiosRef,
}) => {
  const MAX_IMG = 9;
  const MAX_VID = 3;
  const MAX_AUD = 3;

  const updateAt = (list, setter, idx, val) => {
    const next = [...list];
    next[idx] = val;
    if (!val) {
      // 删除时压缩数组,避免空位散落
      const cleaned = next.filter(Boolean);
      setter(cleaned);
    } else {
      setter(next);
    }
  };

  const addSlot = (list, setter, max) => {
    if (list.length >= max) return;
    setter([...list, '']);
  };

  return (
    <div className='space-y-3 max-w-2xl'>
      {/* 参考图(1~9) */}
      <div className='space-y-1.5'>
        <div className='flex items-center justify-between'>
          <span className='text-xs font-medium text-gray-700'>
            {t('参考图')}
            <span className='text-gray-400 ml-1.5'>
              ({imagesRef.length}/{MAX_IMG})
            </span>
          </span>
          {imagesRef.length < MAX_IMG && (
            <button
              type='button'
              onClick={() => addSlot(imagesRef, setImagesRef, MAX_IMG)}
              className='text-[11px] text-blue-500 hover:text-blue-700'
            >
              + {t('加一张')}
            </button>
          )}
        </div>
        {imagesRef.length === 0 ? (
          <div className='grid grid-cols-3 gap-2'>
            <ImageSlot
              value=''
              onChange={(v) => v && setImagesRef([v])}
            />
          </div>
        ) : (
          <div className='grid grid-cols-3 gap-2'>
            {imagesRef.map((url, i) => (
              <ImageSlot
                key={i}
                value={url}
                onChange={(v) => updateAt(imagesRef, setImagesRef, i, v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 参考视频(0~3) */}
      <div className='space-y-1.5'>
        <div className='flex items-center justify-between'>
          <span className='text-xs font-medium text-gray-700'>
            {t('参考视频')}
            <span className='text-gray-400 ml-1.5'>
              ({videosRef.length}/{MAX_VID})
            </span>
          </span>
          {videosRef.length < MAX_VID && (
            <button
              type='button'
              onClick={() => addSlot(videosRef, setVideosRef, MAX_VID)}
              className='text-[11px] text-blue-500 hover:text-blue-700'
            >
              + {t('加一段')}
            </button>
          )}
        </div>
        {videosRef.length === 0 ? (
          <div className='grid grid-cols-3 gap-2'>
            <VideoSlot
              value=''
              onChange={(v) => v && setVideosRef([v])}
            />
          </div>
        ) : (
          <div className='grid grid-cols-3 gap-2'>
            {videosRef.map((url, i) => (
              <VideoSlot
                key={i}
                value={url}
                onChange={(v) => updateAt(videosRef, setVideosRef, i, v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 参考音频(0~3) */}
      <div className='space-y-1.5'>
        <div className='flex items-center justify-between'>
          <span className='text-xs font-medium text-gray-700'>
            {t('参考音频')}
            <span className='text-gray-400 ml-1.5'>
              ({audiosRef.length}/{MAX_AUD})
            </span>
          </span>
          {audiosRef.length < MAX_AUD && (
            <button
              type='button'
              onClick={() => addSlot(audiosRef, setAudiosRef, MAX_AUD)}
              className='text-[11px] text-blue-500 hover:text-blue-700'
            >
              + {t('加一段')}
            </button>
          )}
        </div>
        {audiosRef.length === 0 ? (
          <AudioSlot
            value=''
            onChange={(v) => v && setAudiosRef([v])}
          />
        ) : (
          <div className='space-y-2'>
            {audiosRef.map((url, i) => (
              <AudioSlot
                key={i}
                value={url}
                onChange={(v) => updateAt(audiosRef, setAudiosRef, i, v)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
  // refs 模式:多模态参考输入(Seedance 2.0)。数组,每个元素是 URL 字符串。
  // 删除某槽时用 '' 占位,提交时由 normalizer 过滤掉空值。
  const [imagesRef, setImagesRef] = useState(
    Array.isArray(initial.images_ref) ? initial.images_ref : [],
  );
  const [videosRef, setVideosRef] = useState(
    Array.isArray(initial.videos_ref) ? initial.videos_ref : [],
  );
  const [audiosRef, setAudiosRef] = useState(
    Array.isArray(initial.audios_ref) ? initial.audios_ref : [],
  );
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
      setImagesRef([]);
      setVideosRef([]);
      setAudiosRef([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // 挂载时从云端拉作品库,合并到本地状态(taskId 相同视为同一条作品,
  // 云端字段覆盖 localStorage 旧字段,避免 localStorage 卡在错误的"卡死"态)。
  // 失败/未启用云作品库时静默回退。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listCloudAssets({ size: 200, modality: MODALITY });
        if (cancelled) return;
        const items = data?.items || [];
        if (items.length === 0) return;
        setAssets((prev) => {
          const byTask = new Map();
          for (const a of prev) {
            if (a.taskId) byTask.set(a.taskId, a);
          }
          const merged = [...prev];
          for (const c of items) {
            const local = c.task_id ? byTask.get(c.task_id) : null;
            const cloudShape = {
              id: local?.id || `cloud-${c.id}`,
              cloudId: c.id,
              modality: c.modality,
              modelName: c.model_name,
              prompt: c.prompt,
              params: (() => {
                try {
                  return c.params ? JSON.parse(c.params) : {};
                } catch {
                  return {};
                }
              })(),
              status: c.status,
              assetUrl: c.asset_url || '',
              taskId: c.task_id || undefined,
              createdAt: new Date(c.created_at).getTime() || Date.now(),
            };
            if (local) {
              // 已有本地条目,合并云端字段(以云端为准,因为 task_polling 会回写)
              const idx = merged.findIndex((a) => a.id === local.id);
              if (idx >= 0)
                merged[idx] = { ...local, ...cloudShape, id: local.id };
            } else {
              merged.push(cloudShape);
            }
          }
          return merged;
        });
      } catch (err) {
        console.warn('[creation] cloud gallery load failed', err?.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // 修复：卡死在 pending 且无 taskId 的同步占位符标记为 failed
  useEffect(() => {
    const STALE_MS = 60 * 1000;
    setAssets((prev) => {
      let changed = false;
      const next = prev.map((a) => {
        const isStuck =
          (a.status === 'pending' || a.status === 'in_progress') &&
          !a.taskId &&
          Date.now() - (a.createdAt || 0) > STALE_MS;
        if (!isStuck) return a;
        changed = true;
        const patch = {
          status: 'failed',
          errorMessage: '生成被中断（页面已切换或刷新）',
        };
        updateAsset(a.id, patch);
        return { ...a, ...patch };
      });
      return changed ? next : prev;
    });
  }, []);

  // 修复:挂载时主动补拉"已成功但 assetUrl 缺失"的 task。
  // 触发场景:浏览器切走页面没收到 onTerminal、polling 中途网络异常、
  // 或后端协议升级前的旧 asset 卡在 localStorage 里。直接调 /v1/video/generations/{id}
  // 拿 metadata.url 回填,作品库和时间轴都能正确展示。
  useEffect(() => {
    const needBackfill = assets.filter(
      (a) =>
        a.modality === MODALITY &&
        a.taskId &&
        !a.assetUrl &&
        (a.status === 'success' ||
          a.status === 'completed' ||
          a.status === 'SUCCESS'),
    );
    if (needBackfill.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      for (const a of needBackfill) {
        if (cancelled) return;
        try {
          const res = await API.get(
            `/v1/video/generations/${encodeURIComponent(a.taskId)}`,
            { headers: tokenAuthHeader() },
          );
          const payload = res?.data?.data ?? res?.data;
          const url =
            payload?.metadata?.url ||
            payload?.metadata?.proxy_url ||
            payload?.url ||
            '';
          if (cancelled) return;
          if (url) {
            const patch = { status: 'success', assetUrl: url, progress: 100 };
            setAssets((prev) =>
              prev.map((it) => (it.id === a.id ? { ...it, ...patch } : it)),
            );
            updateAsset(a.id, patch);
          }
        } catch (e) {
          // task 可能已过期/删除,静默
          console.warn('[creation] backfill failed', a.taskId, e?.message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveConfig(MODALITY, {
      model,
      params,
      prompt,
      mode,
      image_first: imageFirst,
      image_last: imageLast,
      images_ref: imagesRef,
      videos_ref: videosRef,
      audios_ref: audiosRef,
    });
  }, [
    model,
    params,
    prompt,
    mode,
    imageFirst,
    imageLast,
    imagesRef,
    videosRef,
    audiosRef,
  ]);

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
          images_ref: imagesRef.filter(Boolean),
          videos_ref: videosRef.filter(Boolean),
          audios_ref: audiosRef.filter(Boolean),
          ...params,
        },
        schema,
      );
      debug.setPreview(req);
    } catch {
      debug.setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, model, params, prompt, mode, imageFirst, imageLast, imagesRef, videosRef, audiosRef]);

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
    // 每次轮询都尝试写入视频 URL,不只依赖 onTerminal 那一次触发。
    // 这样即使 polling 中途页面切走/网络抖动,只要有一次拿到 url 就能落地;
    // 终态切换为 'completed' 时 AssetCard 会自动用 assetUrl 渲染 video。
    const incomingUrl =
      data?.metadata?.url || data?.metadata?.proxy_url || data?.url || '';
    // 把 OpenAI 风格的 'completed' 归一化为 'success',与作品库/卡片识别保持一致。
    const rawStatus = data.status;
    const normalizedStatus =
      rawStatus === 'completed' || rawStatus === 'SUCCESS' ? 'success' : rawStatus;
    let cloudId;
    setAssets((prev) =>
      prev.map((a) => {
        if (a.id !== assetId) return a;
        cloudId = a.cloudId;
        return {
          ...a,
          status: normalizedStatus || a.status,
          progress: data.progress ?? a.progress,
          assetUrl: incomingUrl || a.assetUrl,
        };
      }),
    );
    if (normalizedStatus) {
      const patch = { status: normalizedStatus, progress: data.progress };
      if (incomingUrl) patch.assetUrl = incomingUrl;
      updateAsset(assetId, patch);
      // 同步回云端:即使后端 task_polling 也会回写,前端这一路是「补丁」,
      // 让作品库实时反映 UI 状态(避免延迟)。无 cloudId 时跳过。
      if (cloudId && (incomingUrl || normalizedStatus !== 'in_progress')) {
        updateCloudAsset(cloudId, {
          assetUrl: incomingUrl || undefined,
          status: normalizedStatus,
        }).catch((err) => {
          console.warn('[creation] cloud asset update failed', err?.message);
        });
      }
    }
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
    let cloudId;
    setAssets((prev) =>
      prev.map((a) => {
        if (a.id !== assetId) return a;
        cloudId = a.cloudId;
        return { ...a, ...patch };
      }),
    );
    updateAsset(assetId, patch);
    // 终态写回云端(前端兜底,即使后端 task_polling 还没写也能即时同步)
    if (cloudId) {
      updateCloudAsset(cloudId, {
        assetUrl: patch.assetUrl,
        status: patch.status,
      }).catch((err) => {
        console.warn('[creation] cloud asset terminal write failed', err?.message);
      });
    }
    const taskId = (assets.find((a) => a.id === assetId) || {}).taskId;
    if (taskId) untrackActiveTask(taskId);
  }, [assets]);

  const handleSubmit = async () => {
    // 重入保护:按钮 onClick + PromptComposer Ctrl+Enter + 用户手快双击
    // 任意组合都可能在 submitting 切到 true 之前再次进入,导致同一提交发两次请求。
    if (submitting) return;
    const unified = {
      model,
      prompt,
      mode,
      image_first: imageFirst || undefined,
      image_last: imageLast || undefined,
      images_ref: imagesRef.filter(Boolean),
      videos_ref: videosRef.filter(Boolean),
      audios_ref: audiosRef.filter(Boolean),
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
    debug.setRequest(req);
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
      // 同步到云作品库:第一次以 in_progress 入库,绑定 task_id,
      // 后续轮询会按 task_id 把 asset_url+status 回写。
      // 失败不阻塞主流程(后端轮询终态时也会自动回写)。
      upsertCloudAssetByTaskId({
        modality: MODALITY,
        modelName: model,
        prompt,
        params: { ...params },
        taskId,
        status: 'in_progress',
        assetUrl: '',
      })
        .then((cloudAsset) => {
          if (cloudAsset?.id) {
            const cloudPatch = { cloudId: cloudAsset.id };
            setAssets((prev) =>
              prev.map((a) =>
                a.id === placeholderId ? { ...a, ...cloudPatch } : a,
              ),
            );
            updateAsset(placeholderId, cloudPatch);
          }
        })
        .catch((err) => {
          console.warn('[creation] cloud asset create failed', err?.message);
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

  // 时间轴：升序 + 按日分组
  const timelineDays = useMemo(() => {
    const sorted = [...videoAssets].sort(
      (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
    );
    const days = [];
    let lastKey = '';
    for (const a of sorted) {
      const d = new Date(a.createdAt || Date.now());
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      if (key !== lastKey) {
        days.push({ key, date: d, items: [] });
        lastKey = key;
      }
      days[days.length - 1].items.push(a);
    }
    return days;
  }, [videoAssets]);

  const timelineRef = useRef(null);
  const lastCountRef = useRef(0);
  useEffect(() => {
    const cnt = videoAssets.length;
    if (cnt > lastCountRef.current) {
      const el = timelineRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
      }
    }
    lastCountRef.current = cnt;
  }, [videoAssets.length]);

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
            <div className='flex items-center gap-1'>
              <Text strong className='!text-[13px] !text-gray-900'>
                {t('模型')}
              </Text>
              <ModelFilterInfo modality={MODALITY} hit={models.length} />
            </div>
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
        {/* 作品流（时间轴） */}
        <div ref={timelineRef} className='flex-1 overflow-y-auto'>
          {videoAssets.length === 0 ? (
            <div className='min-h-full flex items-center'>
              <PresetGrid
                modality={MODALITY}
                availableModels={models}
                onApply={applyPreset}
              />
            </div>
          ) : (
            <div className='max-w-4xl mx-auto px-6 py-6 space-y-8'>
              {timelineDays.map(({ key, date, items }) => (
                <section key={key} className='space-y-3'>
                  <div className='flex items-center gap-3 sticky top-0 z-[1] py-1 bg-[#fafafa]/85 backdrop-blur'>
                    <div className='h-px flex-1 bg-gray-200/70' />
                    <Text type='tertiary' className='!text-[11px] !text-gray-500'>
                      {formatDayLabel(date)}
                    </Text>
                    <div className='h-px flex-1 bg-gray-200/70' />
                  </div>
                  {items.map((a) => (
                    <TimelineItem key={a.id} createdAt={a.createdAt}>
                      <AssetCard
                        asset={a}
                        onReplay={handleReplay}
                        onRetry={handleRetry}
                        onSwitchModel={handleSwitchModel}
                        onDelete={handleDelete}
                      />
                    </TimelineItem>
                  ))}
                </section>
              ))}
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
                    { key: 'refs', label: '多模态参考' },
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

            {mode === 'refs' && (
              <RefSlotPanel
                t={t}
                imagesRef={imagesRef}
                setImagesRef={setImagesRef}
                videosRef={videosRef}
                setVideosRef={setVideosRef}
                audiosRef={audiosRef}
                setAudiosRef={setAudiosRef}
              />
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
                  disabled={submitting || !model || !prompt.trim()}
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
        <aside className='w-[420px] flex-shrink-0 border-l border-gray-200/70 bg-white overflow-hidden'>
          <CreationDebugPanel debug={debug} onClose={debug.togglePanel} />
        </aside>
      )}
    </div>
  );
};

export default VideoTab;
