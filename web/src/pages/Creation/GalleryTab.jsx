/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useMemo, useEffect } from 'react';
import { Empty, Input, Spin, Toast, Button, Typography } from '@douyinfe/semi-ui';
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

const { Text, Title } = Typography;

const FILTERS = [
  { key: 'all', label: '全部', icon: Grid3x3 },
  { key: 'image', label: '图像', icon: ImageIcon },
  { key: 'video', label: '视频', icon: VideoIcon },
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

  const toggleSource = () => {
    if (!useCloud) {
      loadCloud();
    } else {
      setAssets(loadAssets());
    }
    setUseCloud((v) => !v);
  };

  const filtered = useMemo(() => {
    return assets
      .filter((a) => a.status === 'success' || !a.status)
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

  const counts = useMemo(() => {
    const out = { all: 0, image: 0, video: 0 };
    for (const a of assets) {
      if (a.status && a.status !== 'success') continue;
      out.all += 1;
      if (a.modality === 'image') out.image += 1;
      if (a.modality === 'video') out.video += 1;
    }
    return out;
  }, [assets]);

  return (
    <div className='h-full overflow-y-auto bg-[#fafafa]'>
      {/* 顶部标题 + 数据源切换 */}
      <div className='sticky top-0 z-10 bg-[#fafafa]/85 backdrop-blur-md border-b border-gray-200/60'>
        <div className='max-w-[1400px] mx-auto px-6 pt-5 pb-3'>
          <div className='flex items-baseline justify-between mb-4'>
            <div>
              <Title heading={5} className='!m-0 !text-gray-900'>
                {t('作品库')}
              </Title>
              <Text type='tertiary' className='!text-[12px]'>
                {useCloud ? t('云端归档') : t('本地浏览器记录')} · {filtered.length} {t('件作品')}
              </Text>
            </div>

            {cloudEnabled && (
              <div className='flex items-center gap-2'>
                <div className='inline-flex rounded-md border border-gray-200 bg-white p-0.5'>
                  <button
                    onClick={() => !useCloud || toggleSource()}
                    className={[
                      'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] transition-colors',
                      !useCloud
                        ? 'bg-gray-900 text-white font-medium shadow-sm'
                        : 'text-gray-600 hover:text-gray-900',
                    ].join(' ')}
                  >
                    <HardDrive size={12} />
                    {t('本地')}
                  </button>
                  <button
                    onClick={() => useCloud || toggleSource()}
                    className={[
                      'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] transition-colors',
                      useCloud
                        ? 'bg-gray-900 text-white font-medium shadow-sm'
                        : 'text-gray-600 hover:text-gray-900',
                    ].join(' ')}
                  >
                    <Cloud size={12} />
                    {t('云端')}
                  </button>
                </div>
                {useCloud && (
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
              </div>
            )}
          </div>

          {/* 过滤 + 搜索 */}
          <div className='flex items-center gap-2'>
            <div className='inline-flex rounded-md border border-gray-200 bg-white p-0.5'>
              {FILTERS.map(({ key, label, icon: Icon }) => {
                const active = filter === key;
                const cnt = counts[key];
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={[
                      'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] transition-colors',
                      active
                        ? 'bg-gray-900 text-white font-medium shadow-sm'
                        : 'text-gray-600 hover:text-gray-900',
                    ].join(' ')}
                  >
                    <Icon size={12} />
                    {t(label)}
                    <span
                      className={[
                        'ml-0.5 px-1 rounded text-[10px] tabular-nums',
                        active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500',
                      ].join(' ')}
                    >
                      {cnt}
                    </span>
                  </button>
                );
              })}
            </div>

            <Input
              value={keyword}
              onChange={setKeyword}
              prefix={<Search size={13} className='text-gray-400 ml-1' />}
              placeholder={t('按提示词搜索…')}
              className='!max-w-[320px]'
              showClear
            />
          </div>
        </div>
      </div>

      {/* 网格 */}
      <div className='max-w-[1400px] mx-auto px-6 py-5'>
        <Spin spinning={loading}>
          {filtered.length === 0 ? (
            <div className='py-20'>
              <Empty
                title={t('暂无作品')}
                description={
                  keyword || filter !== 'all'
                    ? t('换个关键词或筛选条件试试')
                    : t('到「图像」或「视频」Tab 生成第一件作品，它会自动归档到这里')
                }
              />
            </div>
          ) : (
            <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3'>
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
