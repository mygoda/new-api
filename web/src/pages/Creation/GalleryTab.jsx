/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useMemo, useEffect } from 'react';
import { Empty, Input, Select, Spin, Toast, Button, Tag } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Cloud, HardDrive } from 'lucide-react';
import AssetCard from '../../components/creation/AssetCard';
import { loadAssets, removeAsset } from '../../services/creation/storage';
import {
  isCloudEnabled,
  listCloudAssets,
  deleteCloudAsset,
  migrateLocalToCloud,
} from '../../services/creation/cloudGallery';

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
    return assets.filter((a) => {
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
    <div className='h-full overflow-y-auto p-4 bg-gray-50'>
      <div className='flex flex-wrap gap-2 mb-4 items-center'>
        <Input
          value={keyword}
          onChange={setKeyword}
          placeholder={t('按提示词搜索')}
          style={{ width: 280 }}
          showClear
        />
        <Select
          value={filter}
          onChange={setFilter}
          style={{ width: 140 }}
          optionList={[
            { label: t('全部'), value: 'all' },
            { label: t('图像'), value: 'image' },
            { label: t('视频'), value: 'video' },
          ]}
        />

        {cloudEnabled && (
          <>
            <Button
              theme={useCloud ? 'solid' : 'borderless'}
              type={useCloud ? 'primary' : 'tertiary'}
              icon={useCloud ? <Cloud size={14} /> : <HardDrive size={14} />}
              onClick={toggleSource}
            >
              {useCloud ? t('云端') : t('本地')}
            </Button>
            {useCloud && (
              <Button
                size='small'
                theme='borderless'
                loading={migrating}
                onClick={handleMigrate}
              >
                {t('迁移本地作品')}
              </Button>
            )}
          </>
        )}

        <Tag size='small' className='ml-auto'>
          {t('共 {{n}} 条', { n: filtered.length })}
        </Tag>
      </div>

      <Spin spinning={loading}>
        {filtered.length === 0 ? (
          <Empty
            title={t('暂无作品')}
            description={t(
              '在「图像」/「视频」Tab 完成第一次生成后，作品会自动归档到这里',
            )}
          />
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
            {filtered.map((a) => (
              <AssetCard key={a.id} asset={a} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </Spin>
    </div>
  );
};

export default GalleryTab;
