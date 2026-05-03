/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useMemo, useEffect } from 'react';
import { Empty, Input, Spin, Toast, Button } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Cloud, HardDrive, Search, Image as ImageIcon, Video as VideoIcon, Grid3x3 } from 'lucide-react';
import GalleryCard from '../../components/creation/GalleryCard';
import { loadAssets, removeAsset } from '../../services/creation/storage';
import {
  isCloudEnabled,
  listCloudAssets,
  deleteCloudAsset,
  migrateLocalToCloud,
} from '../../services/creation/cloudGallery';

const FILTERS = [
  { key: 'all', icon: Grid3x3, label: '全部' },
  { key: 'image', icon: ImageIcon, label: '图像' },
  { key: 'video', icon: VideoIcon, label: '视频' },
];

const GalleryTab = () => {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState('all');
  const [assets, setAssets] = useState(loadAssets);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [useCloud, setUseCloud] = useState(false);
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    (async () => {
      const enabled = await isCloudEnabled();
      setCloudEnabled(enabled);
      if (enabled) {
        setUseCloud(true);
        loadCloud();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCloud = async () => {
    setLoading(true);
    try {
      const data = await listCloudAssets({ size: 200 });
      const mapped = (data.items || []).map((it) => ({
        id: it.id,
        cloudId: it.id,
        modality: it.modality,
        modelName: it.model_name,
        prompt: it.prompt,
        assetUrl: it.asset_url,
        status: it.status,
        taskId: it.task_id,
        params: it.params ? JSON.parse(it.params) : {},
        createdAt: new Date(it.created_at).getTime(),
      }));
      setAssets(mapped);
    } catch (e) {
      Toast.error(e?.message || t('加载云端作品失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      const r = await migrateLocalToCloud();
      Toast.success(t('已迁移 {{n}} 条作品到云端', { n: r.migrated }));
      loadCloud();
    } catch (e) {
      Toast.error(e?.message || t('迁移失败'));
    } finally {
      setMigrating(false);
    }
  };

  const handleDelete = async (asset) => {
    if (useCloud && asset.cloudId) {
      try {
        await deleteCloudAsset(asset.cloudId);
        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
        Toast.success(t('已删除'));
      } catch (e) {
        Toast.error(e?.message || t('删除失败'));
      }
    } else {
      setAssets(removeAsset(asset.id));
    }
  };

  const toggleSource = (next) => {
    if (next === useCloud) return;
    if (next) loadCloud();
    else setAssets(loadAssets());
    setUseCloud(next);
  };

  const filtered = useMemo(() => {
    return assets
      .filter((a) => (a.status === 'success' || !a.status) && a.assetUrl)
      .filter((a) => {
        if (filter !== 'all' && a.modality !== filter) return false;
        if (
          keyword &&
          !(a.prompt || '').toLowerCase().includes(keyword.toLowerCase())
        )
          return false;
        return true;
      });
  }, [assets, keyword, filter]);

  return (
    <div className='h-full overflow-y-auto bg-[#fafafa]'>
      {/* 单行精简工具栏 */}
      <div className='sticky top-0 z-10 bg-[#fafafa]/90 backdrop-blur border-b border-gray-200/60'>
        <div className='max-w-[1500px] mx-auto px-5 py-2.5 flex items-center gap-2 flex-wrap'>
          {/* 模态 segmented */}
          <div className='inline-flex rounded-md border border-gray-200 bg-white p-0.5'>
            {FILTERS.map(({ key, icon: Icon, label }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={[
                    'inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] transition-colors',
                    active
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-900',
                  ].join(' ')}
                >
                  <Icon size={11} />
                  {t(label)}
                </button>
              );
            })}
          </div>

          {/* 搜索框 */}
          <Input
            value={keyword}
            onChange={setKeyword}
            prefix={<Search size={12} className='text-gray-400 ml-1.5' />}
            placeholder={t('搜索提示词…')}
            size='small'
            className='!max-w-[260px]'
            showClear
          />

          {/* 数据源 */}
          {cloudEnabled && (
            <div className='inline-flex rounded-md border border-gray-200 bg-white p-0.5'>
              <button
                onClick={() => toggleSource(false)}
                className={[
                  'inline-flex items-center gap-1 h-6 px-2 rounded text-[11px]',
                  !useCloud ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900',
                ].join(' ')}
              >
                <HardDrive size={11} />
                {t('本地')}
              </button>
              <button
                onClick={() => toggleSource(true)}
                className={[
                  'inline-flex items-center gap-1 h-6 px-2 rounded text-[11px]',
                  useCloud ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900',
                ].join(' ')}
              >
                <Cloud size={11} />
                {t('云端')}
              </button>
            </div>
          )}

          {cloudEnabled && useCloud && (
            <Button
              size='small'
              theme='borderless'
              type='tertiary'
              loading={migrating}
              onClick={handleMigrate}
              className='!text-[11px]'
            >
              {t('迁移本地作品')}
            </Button>
          )}

          <span className='ml-auto text-[11px] text-gray-400 tabular-nums'>
            {filtered.length} {t('件')}
          </span>
        </div>
      </div>

      {/* 网格 */}
      <div className='max-w-[1500px] mx-auto px-5 py-4'>
        <Spin spinning={loading}>
          {filtered.length === 0 ? (
            <div className='py-24'>
              <Empty
                title={t('暂无作品')}
                description={
                  keyword || filter !== 'all'
                    ? t('换个关键词或筛选条件试试')
                    : t('到「图像」或「视频」生成第一件作品，它会自动归档到这里')
                }
              />
            </div>
          ) : (
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2.5'>
              {filtered.map((a) => (
                <GalleryCard key={a.id} asset={a} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </Spin>
      </div>
    </div>
  );
};

export default GalleryTab;
