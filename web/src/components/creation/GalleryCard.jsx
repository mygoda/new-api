/*
Copyright (C) 2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later

作品库卡片：image-first 设计
- 主体为方形媒体（图/视频）；悬浮时显示提示词与操作
- 不显示计费信息
*/

import React, { useState } from 'react';
import { Typography, Tooltip } from '@douyinfe/semi-ui';
import {
  Download,
  Copy,
  Trash2,
  Sparkles,
  Maximize2,
  Video as VideoIcon,
  ImageOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { copyText, downloadUrl } from '../../utils/creation/clipboard';

const { Text } = Typography;

const GalleryCard = ({ asset, onDelete }) => {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);

  const isVideo = asset.modality === 'video';
  const url = asset.assetUrl;

  const copyLink = () => copyText(url);
  const download = () =>
    downloadUrl(
      url,
      `${asset.modelName || 'asset'}-${asset.id || Date.now()}${isVideo ? '.mp4' : '.png'}`,
    );
  const copyPromptJson = () => {
    const payload = {
      prompt: asset.prompt || '',
      model: asset.modelName,
      params: asset.params || {},
    };
    copyText(JSON.stringify(payload, null, 2));
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className='group relative rounded-xl overflow-hidden bg-gray-100 aspect-square ring-1 ring-gray-200/70 hover:ring-2 hover:ring-blue-300 transition-all shadow-sm hover:shadow-md'
    >
      {url ? (
        isVideo ? (
          <video
            src={url}
            className='w-full h-full object-cover transition-transform group-hover:scale-[1.02]'
            muted
            loop
            playsInline
            autoPlay={hover}
          />
        ) : (
          <img
            src={url}
            alt={asset.prompt || ''}
            loading='lazy'
            className='w-full h-full object-cover transition-transform group-hover:scale-[1.02]'
          />
        )
      ) : (
        <div className='w-full h-full flex items-center justify-center text-gray-300'>
          <ImageOff size={32} />
        </div>
      )}

      {/* 左上角：模态徽标 */}
      <div className='absolute top-2 left-2 flex items-center gap-1'>
        <span className='inline-flex items-center gap-1 px-1.5 py-0.5 bg-black/55 text-white text-[10px] font-medium rounded backdrop-blur-sm'>
          {isVideo && <VideoIcon size={10} />}
          {asset.modelName}
        </span>
      </div>

      {/* 底部渐变 + 提示词（常显缩略 1 行） */}
      {asset.prompt && (
        <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent pt-8 pb-2 px-3 pointer-events-none'>
          <Text className='!text-white !text-[11px] !block line-clamp-1 drop-shadow'>
            {asset.prompt}
          </Text>
        </div>
      )}

      {/* 悬浮操作栏 */}
      {url && (
        <div className='absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
          <Tooltip content={t('新窗口放大')}>
            <button
              type='button'
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
              className='p-1.5 bg-white/95 hover:bg-white text-gray-700 rounded shadow-sm'
            >
              <Maximize2 size={12} />
            </button>
          </Tooltip>
          <Tooltip content={t('下载')}>
            <button
              type='button'
              onClick={download}
              className='p-1.5 bg-white/95 hover:bg-white text-gray-700 rounded shadow-sm'
            >
              <Download size={12} />
            </button>
          </Tooltip>
          <Tooltip content={t('复制链接')}>
            <button
              type='button'
              onClick={copyLink}
              className='p-1.5 bg-white/95 hover:bg-white text-gray-700 rounded shadow-sm'
            >
              <Copy size={12} />
            </button>
          </Tooltip>
          <Tooltip content={t('复制提示词与参数')}>
            <button
              type='button'
              onClick={copyPromptJson}
              className='p-1.5 bg-white/95 hover:bg-white text-gray-700 rounded shadow-sm'
            >
              <Sparkles size={12} />
            </button>
          </Tooltip>
          {onDelete && (
            <Tooltip content={t('删除')}>
              <button
                type='button'
                onClick={() => onDelete(asset)}
                className='p-1.5 bg-white/95 hover:bg-red-50 text-red-600 rounded shadow-sm'
              >
                <Trash2 size={12} />
              </button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
};

export default GalleryCard;
