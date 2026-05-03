/*
Copyright (C) 2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later

批量对比卡片：同一 prompt 并发到多个模型的结果横向并排展示
*/

import React from 'react';
import { Card, Tag, Typography, Tooltip, Button } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Download,
  Copy,
  Maximize2,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { copyText, downloadUrl } from '../../utils/creation/clipboard';

const { Text, Paragraph } = Typography;

const StatusBadge = ({ status }) => {
  if (status === 'success')
    return (
      <span className='inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded'>
        ✓
      </span>
    );
  if (status === 'failed')
    return (
      <span className='inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-50 text-red-700 text-[10px] rounded'>
        <AlertCircle size={10} />
      </span>
    );
  return (
    <span className='inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded'>
      <Loader2 size={10} className='animate-spin' />
    </span>
  );
};

const Tile = ({ asset, onDelete }) => {
  const { t } = useTranslation();
  const url = asset?.assetUrl;
  const status = asset?.status || 'pending';
  const isVideo = asset?.modality === 'video';

  return (
    <div className='relative rounded-md overflow-hidden bg-gray-100 ring-1 ring-gray-200/70 group/tile aspect-square'>
      {url && status === 'success' ? (
        isVideo ? (
          <video src={url} className='w-full h-full object-cover' muted loop playsInline />
        ) : (
          <img src={url} alt='' loading='lazy' className='w-full h-full object-cover' />
        )
      ) : status === 'failed' ? (
        <div className='w-full h-full flex flex-col items-center justify-center px-3 text-center bg-red-50/40'>
          <AlertCircle size={20} className='text-red-400 mb-1' />
          <Text type='danger' className='!text-[10px] line-clamp-3'>
            {asset?.errorMessage || t('生成失败')}
          </Text>
        </div>
      ) : (
        <div className='w-full h-full flex items-center justify-center bg-gray-50'>
          <Loader2 size={22} className='text-gray-400 animate-spin' />
        </div>
      )}

      {/* 顶部：模型名 + 状态 */}
      <div className='absolute top-1.5 left-1.5 right-1.5 flex items-center gap-1'>
        <span className='inline-flex items-center px-1.5 py-0.5 bg-black/60 text-white text-[10px] font-medium rounded backdrop-blur-sm truncate max-w-[160px]'>
          {asset?.modelName}
        </span>
        <span className='ml-auto'>
          <StatusBadge status={status} />
        </span>
      </div>

      {/* hover 操作 */}
      {url && status === 'success' && (
        <div className='absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover/tile:opacity-100 transition-opacity'>
          <Tooltip content={t('放大')}>
            <button
              type='button'
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
              className='p-1 bg-white/95 hover:bg-white rounded text-gray-700 shadow-sm'
            >
              <Maximize2 size={11} />
            </button>
          </Tooltip>
          <Tooltip content={t('下载')}>
            <button
              type='button'
              onClick={() =>
                downloadUrl(
                  url,
                  `${asset.modelName || 'asset'}-${asset.id || Date.now()}${isVideo ? '.mp4' : '.png'}`,
                )
              }
              className='p-1 bg-white/95 hover:bg-white rounded text-gray-700 shadow-sm'
            >
              <Download size={11} />
            </button>
          </Tooltip>
          <Tooltip content={t('复制链接')}>
            <button
              type='button'
              onClick={() => copyText(url)}
              className='p-1 bg-white/95 hover:bg-white rounded text-gray-700 shadow-sm'
            >
              <Copy size={11} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};

const BatchCompareCard = ({ batch, onDelete }) => {
  const { t } = useTranslation();
  const items = batch.items || [];
  const cols = items.length <= 2 ? 'grid-cols-2' : items.length === 3 ? 'grid-cols-3' : 'grid-cols-4';

  const successCount = items.filter((i) => i.status === 'success').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const pendingCount = items.length - successCount - failedCount;

  return (
    <Card
      bordered
      bodyStyle={{ padding: 12 }}
      className='!rounded-lg hover:shadow-md transition-shadow !border-blue-200/60'
    >
      <div className='flex items-center gap-1.5 mb-2'>
        <Layers size={13} className='text-blue-500' />
        <Text strong className='!text-[12px] !text-blue-700'>
          {t('批量对比')}
        </Text>
        <Tag size='small' color='blue'>
          {items.length} {t('个模型')}
        </Tag>
        {successCount > 0 && (
          <Tag size='small' color='green'>
            ✓ {successCount}
          </Tag>
        )}
        {failedCount > 0 && (
          <Tag size='small' color='red'>
            ✗ {failedCount}
          </Tag>
        )}
        {pendingCount > 0 && (
          <Tag size='small' color='blue'>
            … {pendingCount}
          </Tag>
        )}
        {onDelete && (
          <Tooltip content={t('删除整批')}>
            <Button
              size='small'
              theme='borderless'
              type='danger'
              icon={<Trash2 size={12} />}
              onClick={() => onDelete(batch)}
              className='!ml-auto'
            />
          </Tooltip>
        )}
      </div>

      <div className={`grid ${cols} gap-1.5`}>
        {items.map((it) => (
          <Tile key={it.id} asset={it} />
        ))}
      </div>

      {batch.prompt && (
        <Paragraph
          ellipsis={{ rows: 2, showTooltip: true }}
          className='!text-[11px] !mt-2 !mb-0 !text-gray-600'
        >
          {batch.prompt}
        </Paragraph>
      )}
    </Card>
  );
};

export default BatchCompareCard;
