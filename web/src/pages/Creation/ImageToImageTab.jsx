/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { Button, Toast, Typography, Tooltip } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Send, Code2 } from 'lucide-react';

import ModelPicker from '../../components/creation/ModelPicker';
import PromptComposer from '../../components/creation/PromptComposer';
import ParamPanel from '../../components/creation/ParamPanel';
import AssetCard from '../../components/creation/AssetCard';
import AssetGroupCard from '../../components/creation/AssetGroupCard';
import ImageSlot from '../../components/creation/ImageSlot';
import CreationDebugPanel from '../../components/creation/CreationDebugPanel';
import ModelFilterInfo from '../../components/creation/ModelFilterInfo';

import { normalize, validate } from '../../services/creation/normalizer';
import {
  createCloudAsset,
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
  genId,
} from '../../services/creation/storage';
import { useDebugState } from '../../hooks/creation/useDebugState';
import { useDynamicModels } from '../../hooks/creation/useDynamicModels';
import { groupAssets } from '../../utils/creation/groupAssets';
import { showErrorModal } from '../../utils/creation/errorReporter';
import { API } from '../../helpers/api';
import {
  tokenAuthHeader,
  loadActiveToken,
} from '../../services/creation/tokens';

const { Text } = Typography;
const MODALITY = 'image-to-image';

// 时间轴单条目：左侧时间标签 + 时间轴竖线 + 右侧卡片
const TimelineItem = ({ createdAt, children }) => {
  const d = new Date(createdAt || Date.now());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return (
    <div className='flex gap-3'>
      <div className='flex flex-col items-center pt-2'>
        <Text
          type='tertiary'
          className='!text-[10px] !text-gray-500 tabular-nums leading-none'
        >
          {hh}:{mm}
        </Text>
        <div className='w-2 h-2 rounded-full bg-blue-300 mt-1.5 ring-4 ring-blue-50' />
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

function defaultsFromSchema(schema) {
  const out = {};
  if (!schema?.fields) return out;
  for (const [name, field] of Object.entries(schema.fields)) {
    if (field.default !== undefined) out[name] = field.default;
  }
  return out;
}

const ImageToImageTab = () => {
  const { t } = useTranslation();
  const {
    models,
    loading: modelsLoading,
    getSchemaFor,
  } = useDynamicModels(MODALITY);

  const initial = loadConfig(MODALITY) || {};
  const [model, setModel] = useState(initial.model || '');
  const schema = useMemo(() => getSchemaFor(model), [model, getSchemaFor]);
  const [params, setParams] = useState(initial.params || {});
  const [prompt, setPrompt] = useState(initial.prompt || '');
  const [imageRef, setImageRef] = useState(initial.imageRef || '');
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

  // 修复中断的占位符（同 ImageTab 的逻辑）
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

  useEffect(() => {
    saveConfig(MODALITY, { model, params, prompt, imageRef });
  }, [model, params, prompt, imageRef]);

  // 挂载时拉云端作品库,与本地状态合并(按 cloudId/asset_url 去重)。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listCloudAssets({ size: 200, modality: MODALITY });
        if (cancelled) return;
        const items = data?.items || [];
        if (items.length === 0) return;
        setAssets((prev) => {
          const byUrl = new Set(prev.map((a) => a.assetUrl).filter(Boolean));
          const merged = [...prev];
          for (const c of items) {
            if (c.asset_url && byUrl.has(c.asset_url)) continue;
            merged.push({
              id: `cloud-${c.id}`,
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
            });
          }
          return merged;
        });
      } catch (err) {
        console.warn('[creation] i2i cloud gallery load failed', err?.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!schema || !prompt) {
      debug.setPreview(null);
      return;
    }
    try {
      const req = normalize(
        { model, prompt, image_first: imageRef, ...params },
        schema,
      );
      debug.setPreview(req);
    } catch {
      debug.setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, model, params, prompt, imageRef]);

  const switchModel = useCallback(
    (next) => {
      const nextSchema = getSchemaFor(next);
      if (!nextSchema) return;
      const filtered = {};
      for (const k of Object.keys(nextSchema.fields || {})) {
        filtered[k] =
          params[k] !== undefined ? params[k] : nextSchema.fields[k].default;
      }
      setParams(filtered);
      setModel(next);
    },
    [params, getSchemaFor],
  );

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

  const handleSubmit = async () => {
    const unified = { model, prompt, image_first: imageRef, ...params };
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

    // OpenAI /v1/images/edits 强制 multipart/form-data。
    // 把 normalizer 输出的 JSON body 改写成 FormData：
    //   - 参考图 URL → fetch → Blob → FormData("image", blob)
    //   - 其它字段（model/prompt/n/size/quality 等）原样 append
    //   - axios 检测到 FormData 会自动设 Content-Type: multipart/form-data; boundary=...
    if (
      req.url === '/v1/images/edits' &&
      imageRef &&
      !(req.body instanceof FormData)
    ) {
      try {
        // cache: 'no-store' — 绕开浏览器磁盘缓存（之前 CORS preflight 失败的响应
        // 可能被缓存在内存/disk cache 里，即使 TOS 已配好 CORS，浏览器仍会沿用旧
        // 失败响应）。
        // mode: 'cors' — 显式声明跨域请求，缺省也是 cors，写明只是为了可读性。
        // credentials: 'omit' — 不带 cookies，TOS 签名 URL 鉴权靠 query string，
        // 带 credentials 反而触发更严格的 CORS 检查（Access-Control-Allow-Origin
        // 不能是 *，必须明确 origin），所以显式不带。
        const fetchRes = await fetch(imageRef, {
          cache: 'no-store',
          mode: 'cors',
          credentials: 'omit',
        });
        if (!fetchRes.ok) {
          throw new Error(`HTTP ${fetchRes.status}`);
        }
        const blob = await fetchRes.blob();
        const fd = new FormData();
        for (const [k, v] of Object.entries(req.body || {})) {
          if (k === 'image') continue;
          if (v === undefined || v === null || v === '') continue;
          fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
        const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        fd.append('image', blob, `image.${ext}`);
        req.body = fd;
      } catch (e) {
        Toast.error(`${t('参考图加载失败')}: ${e.message || e}`);
        return;
      }
    }

    setSubmitting(true);
    debug.setRequest(req);
    const placeholderId = genId();
    const placeholder = {
      id: placeholderId,
      modality: MODALITY,
      modelName: model,
      prompt,
      params: { ...params, image_first: imageRef },
      status: 'pending',
      createdAt: Date.now(),
      estimatedQuota: estimate,
    };
    setAssets((prev) => [placeholder, ...prev]);
    appendAsset(placeholder);

    try {
      const res = await API.post(req.url, req.body, {
        headers: tokenAuthHeader(),
      });
      debug.setResponse(res?.data ?? res);

      const items = res?.data?.data || [];
      if (!items.length) throw new Error('upstream returned no data');

      const groupId = placeholderId;
      const created = items.map((it, idx) => ({
        id: genId() + '-' + idx,
        groupId,
        modality: MODALITY,
        modelName: model,
        prompt,
        params: { ...params, image_first: imageRef },
        status: 'success',
        assetUrl:
          it.url || (it.b64_json ? `data:image/png;base64,${it.b64_json}` : ''),
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

      // 同步写云作品库:图生图同步出图,每张图直接 createCloudAsset。
      created.forEach((a) => {
        createCloudAsset({
          modality: a.modality,
          modelName: a.modelName,
          prompt: a.prompt,
          params: a.params,
          assetUrl: a.assetUrl,
          status: 'success',
          taskId: '',
        })
          .then((cloudAsset) => {
            if (cloudAsset?.id) {
              setAssets((prev) =>
                prev.map((it) =>
                  it.id === a.id ? { ...it, cloudId: cloudAsset.id } : it,
                ),
              );
            }
          })
          .catch((err) => {
            console.warn('[creation] i2i cloud create failed', err?.message);
          });
      });
      Toast.success(t('生成成功'));
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
      showErrorModal(e, { title: t('图生图失败') });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplay = (asset) => {
    if (asset.modelName !== model) switchModel(asset.modelName);
    if (asset.params) {
      const { image_first, ...rest } = asset.params;
      setParams(rest);
      if (image_first) setImageRef(image_first);
    }
    setPrompt(asset.prompt || '');
  };

  const handleRetry = (asset) => {
    handleReplay(asset);
    setTimeout(() => handleSubmit(), 80);
  };

  const handleSwitchModel = (asset) => {
    handleReplay(asset);
    Toast.info(t('请在左侧选择一个新模型，再点击「生成图像」'));
  };

  const handleDelete = (asset) => {
    setAssets(removeAsset(asset.id));
  };

  const handleDeleteGroup = (group) => {
    if (!group?.items) return;
    let next = assets;
    for (const it of group.items) {
      next = next.filter((a) => a.id !== it.id);
    }
    setAssets(next);
    try {
      localStorage.setItem(
        'creation:assets:v1',
        JSON.stringify(next.slice(0, 1000)),
      );
    } catch {}
  };

  const myAssets = assets.filter((a) => a.modality === MODALITY);
  const groupedAssets = useMemo(() => groupAssets(myAssets), [myAssets]);

  const timelineDays = useMemo(() => {
    const sorted = [...groupedAssets].sort(
      (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
    );
    const days = [];
    let lastKey = '';
    for (const row of sorted) {
      const d = new Date(row.createdAt || Date.now());
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      if (key !== lastKey) {
        days.push({ key, date: d, rows: [] });
        lastKey = key;
      }
      days[days.length - 1].rows.push(row);
    }
    return days;
  }, [groupedAssets]);

  const timelineRef = useRef(null);
  const lastCountRef = useRef(0);
  useEffect(() => {
    const cnt = myAssets.length;
    if (cnt > lastCountRef.current) {
      const el = timelineRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
      }
    }
    lastCountRef.current = cnt;
  }, [myAssets.length]);

  return (
    <div className='flex h-full overflow-hidden bg-[#fafafa]'>
      {/* 左侧 - 设置面板 */}
      <aside className='w-[280px] flex-shrink-0 overflow-y-auto bg-white border-r border-gray-200/70'>
        {/* 模型区 */}
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

        {/* 参考图区 */}
        <section className='p-4 border-b border-gray-100'>
          <div className='mb-3'>
            <Text strong className='!text-[13px] !text-gray-900'>
              {t('参考图')}
            </Text>
            <Text type='tertiary' className='!text-[11px] block mt-1'>
              {t('上传一张图作为生成基础')}
            </Text>
          </div>
          <ImageSlot
            label={t('参考图')}
            value={imageRef}
            onChange={setImageRef}
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
        <div ref={timelineRef} className='flex-1 overflow-y-auto'>
          {myAssets.length === 0 ? (
            <div className='min-h-full flex items-center justify-center text-center px-6'>
              <div className='max-w-md'>
                <Text type='tertiary' className='!text-[13px] block mb-2'>
                  {t('图生图')}
                </Text>
                <Text className='!text-gray-500 !text-[12px]'>
                  {t(
                    '上传一张参考图，输入提示词，让模型基于这张图生成新的图像。常用于风格转换、变体生成、局部修改。',
                  )}
                </Text>
              </div>
            </div>
          ) : (
            <div className='max-w-4xl mx-auto px-6 py-6 space-y-8'>
              {timelineDays.map(({ key, date, rows }) => (
                <section key={key} className='space-y-3'>
                  <div className='flex items-center gap-3 sticky top-0 z-[1] py-1 bg-[#fafafa]/85 backdrop-blur'>
                    <div className='h-px flex-1 bg-gray-200/70' />
                    <Text
                      type='tertiary'
                      className='!text-[11px] !text-gray-500'
                    >
                      {formatDayLabel(date)}
                    </Text>
                    <div className='h-px flex-1 bg-gray-200/70' />
                  </div>

                  {rows.map((row) => {
                    const allSuccess = (row.items || []).every(
                      (it) => it.status === 'success',
                    );
                    const isMulti = (row.items || []).length > 1 && allSuccess;
                    if (isMulti) {
                      return (
                        <TimelineItem key={row.id} createdAt={row.createdAt}>
                          <AssetGroupCard
                            group={row}
                            onReplay={handleReplay}
                            onDelete={handleDeleteGroup}
                          />
                        </TimelineItem>
                      );
                    }
                    const single = row.items[0];
                    return (
                      <TimelineItem key={row.id} createdAt={row.createdAt}>
                        <AssetCard
                          asset={single}
                          onReplay={handleReplay}
                          onRetry={handleRetry}
                          onSwitchModel={handleSwitchModel}
                          onDelete={handleDelete}
                        />
                      </TimelineItem>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
        </div>

        {/* 底部固定 - Prompt 输入 + 提交 */}
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
            <div className='mt-3 flex items-center justify-end'>
              <div className='flex items-center gap-2'>
                <Tooltip content={t('调试面板（查看请求体 / 响应）')}>
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
                  disabled={!model || !prompt.trim() || !imageRef}
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
        <aside className='w-[420px] flex-shrink-0 border-l border-gray-200/70 bg-white overflow-hidden'>
          <CreationDebugPanel debug={debug} onClose={debug.togglePanel} />
        </aside>
      )}
    </div>
  );
};

export default ImageToImageTab;
