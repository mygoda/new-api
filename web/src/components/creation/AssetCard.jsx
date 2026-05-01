/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState } from 'react';
import { Button, Spin, Tag, Typography, Tooltip } from '@douyinfe/semi-ui';
import { Download, Copy, RotateCcw, Trash2, AlertCircle, Sparkles, ImageIcon, Video as VideoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const { Text, Paragraph } = Typography;

// 单个产物卡片：图像 / 视频 / 失败 / 进行中通用
const AssetCard = ({ asset, onReplay, onDelete, onCopyPrompt }) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const isVideo = asset.modality === 'video';
  const status = asset.status || 'success';

  const renderMedia = () => {
    if (status === 'pending' || status === 'in_progress' || status === 'queued') {
      return (
        <div className='aspect-video rounded-xl flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 relative overflow-hidden'>
          {/* 动态光效背景 */}
          <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse' />
          <div className='relative z-10 flex flex-col items-center gap-3'>
            <div className='relative'>
              <div className='w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg'>
                <Sparkles size={20} className='text-white animate-spin' style={{ animationDuration: '3s' }} />
              </div>
              <div className='absolute -inset-1 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 opacity-30 animate-ping' />
            </div>
            <div className='flex flex-col items-center gap-1'>
              <Text strong className='!text-sm !text-gray-800'>
                {asset.progress ? `${asset.progress}%` : t('生成中…')}
              </Text>
              <Text type='tertiary' className='!text-[11px]'>
                {t('AI 正在为你创作')}
              </Text>
            </div>
            {asset.progress > 0 && (
              <div className='w-32 h-1 bg-white/60 rounded-full overflow-hidden'>
                <div
                  className='h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500'
                  style={{ width: `${asset.progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      );
    }
    if (status === 'failed' || status === 'timeout') {
      return (
        <div className='aspect-video rounded-xl bg-gradient-to-br from-red-50 to-orange-50 flex flex-col items-center justify-center px-4 text-center border border-red-100'>
          <div className='w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2'>
            <AlertCircle size={20} className='text-red-500' />
          </div>
          <Text type='danger' strong className='!text-xs mb-1'>
            {t('生成失败')}
          </Text>
          <Text type='tertiary' className='!text-[11px] line-clamp-2'>
            {asset.errorMessage || t('未知错误')}
          </Text>
        </div>
      );
    }
    if (!asset.assetUrl) {
      return (
        <div className='aspect-video rounded-xl bg-gray-100 flex items-center justify-center'>
          {isVideo ? (
            <VideoIcon size={32} className='text-gray-300' />
          ) : (
            <ImageIcon size={32} className='text-gray-300' />
          )}
        </div>
      );
    }
    if (isVideo) {
      return (
        <div className='relative rounded-xl overflow-hidden bg-black shadow-md'>
          <video
            controls
            src={asset.assetUrl}
            className='w-full block'
            style={{ maxHeight: 360 }}
            preload='metadata'
          />
        </div>
      );
    }
    return (
      <div className='relative rounded-xl overflow-hidden bg-gray-100 shadow-md group'>
        <img
          src={asset.assetUrl}
          alt={asset.prompt}
          className='w-full block transition-transform duration-300 group-hover:scale-105'
          style={{ maxHeight: 480, objectFit: 'cover' }}
          loading='lazy'
        />
      </div>
    );
  };

  return (
    <div
      className='group bg-white rounded-2xl border border-gray-200/60 hover:border-gray-300 hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 overflow-hidden p-3'
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {renderMedia()}

      <div className='mt-3 space-y-2.5 px-1'>
        {/* 元数据标签 */}
        <div className='flex items-center gap-1.5 flex-wrap'>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
              isVideo
                ? 'bg-purple-50 text-purple-700 border border-purple-100'
                : 'bg-blue-50 text-blue-700 border border-blue-100'
            }`}
          >
            {isVideo ? <VideoIcon size={10} /> : <ImageIcon size={10} />}
            {asset.modelName}
          </span>
          {asset.actualQuota != null && (
            <span className='inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-700'>
              {asset.actualQuota} {t('点')}
            </span>
          )}
          {asset.estimatedQuota != null && asset.actualQuota == null && (
            <span className='inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-500'>
              ≈{asset.estimatedQuota} {t('点')}
            </span>
          )}
        </div>

        {/* 提示词 */}
        <Paragraph
          ellipsis={{ rows: 2, showTooltip: true }}
          className='!text-[12px] !mb-0 !text-gray-600 !leading-relaxed'
        >
          {asset.prompt}
        </Paragraph>

        {/* 操作按钮 */}
        {(status === 'success' || status === 'failed' || status === 'timeout') && (
          <div className='flex items-center justify-between pt-2 border-t border-gray-100'>
            <div className='flex items-center gap-0.5'>
              {asset.assetUrl && (
                <>
                  <Tooltip content={t('下载')}>
                    <Button
                      size='small'
                      theme='borderless'
                      type='tertiary'
                      icon={<Download size={13} />}
                      onClick={() =>
                        window.open(asset.assetUrl, '_blank', 'noopener,noreferrer')
                      }
                      className='!rounded-lg hover:!bg-blue-50 hover:!text-blue-600'
                    />
                  </Tooltip>
                  <Tooltip content={t('复制链接')}>
                    <Button
                      size='small'
                      theme='borderless'
                      type='tertiary'
                      icon={<Copy size={13} />}
                      onClick={() => navigator.clipboard?.writeText(asset.assetUrl)}
                      className='!rounded-lg hover:!bg-blue-50 hover:!text-blue-600'
                    />
                  </Tooltip>
                </>
              )}
              <Tooltip content={t('沿用参数再生成')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='tertiary'
                  icon={<RotateCcw size={13} />}
                  onClick={() => onReplay?.(asset)}
                  className='!rounded-lg hover:!bg-purple-50 hover:!text-purple-600'
                />
              </Tooltip>
              <Tooltip content={t('复制提示词')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='tertiary'
                  onClick={() => {
                    navigator.clipboard?.writeText(asset.prompt || '');
                    onCopyPrompt?.(asset);
                  }}
                  className='!rounded-lg !text-[11px] hover:!bg-blue-50 hover:!text-blue-600'
                >
                  {t('复制提示词')}
                </Button>
              </Tooltip>
            </div>
            <Tooltip content={t('删除')}>
              <Button
                size='small'
                theme='borderless'
                type='danger'
                icon={<Trash2 size={13} />}
                onClick={() => onDelete?.(asset)}
                className='!rounded-lg hover:!bg-red-50'
              />
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetCard;
