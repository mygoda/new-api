/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React from 'react';
import { Card, Button, Spin, Tag, Typography, Tooltip } from '@douyinfe/semi-ui';
import { Download, Copy, RotateCcw, Trash2, AlertCircle, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const { Text, Paragraph } = Typography;

// 单个产物卡片：图像 / 视频 / 失败 / 进行中通用
const AssetCard = ({ asset, onReplay, onDelete, onCopyPrompt }) => {
  const { t } = useTranslation();
  const isVideo = asset.modality === 'video';
  const status = asset.status || 'success';

  const renderMedia = () => {
    if (status === 'pending' || status === 'in_progress' || status === 'queued') {
      return (
        <div className='aspect-video bg-gray-50 rounded flex flex-col items-center justify-center gap-2 border border-gray-100'>
          <Spin size='middle' />
          <Text type='tertiary' className='!text-xs'>
            {asset.progress ? `${asset.progress}%` : t('生成中…')}
          </Text>
          {asset.progress > 0 && (
            <div className='w-32 h-1 bg-gray-200 rounded-full overflow-hidden'>
              <div
                className='h-full bg-blue-500 transition-all'
                style={{ width: `${asset.progress}%` }}
              />
            </div>
          )}
        </div>
      );
    }
    if (status === 'failed' || status === 'timeout') {
      return (
        <div className='aspect-video bg-red-50 rounded flex flex-col items-center justify-center px-4 text-center border border-red-100'>
          <AlertCircle size={20} className='text-red-500 mb-1' />
          <Text type='danger' className='!text-xs font-medium mb-0.5'>
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
        <div className='aspect-video bg-gray-50 rounded flex items-center justify-center'>
          {isVideo ? (
            <VideoIcon size={28} className='text-gray-300' />
          ) : (
            <ImageIcon size={28} className='text-gray-300' />
          )}
        </div>
      );
    }
    if (isVideo) {
      return (
        <video
          controls
          src={asset.assetUrl}
          className='w-full rounded bg-black'
          style={{ maxHeight: 360 }}
          preload='metadata'
        />
      );
    }
    return (
      <img
        src={asset.assetUrl}
        alt={asset.prompt}
        className='w-full rounded'
        style={{ maxHeight: 480, objectFit: 'contain' }}
        loading='lazy'
      />
    );
  };

  return (
    <Card bordered bodyStyle={{ padding: 12 }} className='!rounded-lg hover:shadow-md transition-shadow'>
      {renderMedia()}

      <div className='mt-3 space-y-2'>
        <div className='flex items-center gap-1.5 flex-wrap'>
          <Tag size='small' color={isVideo ? 'violet' : 'blue'}>
            {asset.modelName}
          </Tag>
          {asset.actualQuota != null && (
            <Tag size='small' color='grey'>
              {asset.actualQuota} {t('点')}
            </Tag>
          )}
          {asset.estimatedQuota != null && asset.actualQuota == null && (
            <Tag size='small' color='grey'>
              ≈{asset.estimatedQuota} {t('点')}
            </Tag>
          )}
        </div>

        <Paragraph
          ellipsis={{ rows: 2, showTooltip: true }}
          className='!text-xs !mb-0 !text-gray-600'
        >
          {asset.prompt}
        </Paragraph>

        {(status === 'success' || status === 'failed' || status === 'timeout') && (
          <div className='flex items-center justify-between pt-1 border-t border-gray-100'>
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
                    />
                  </Tooltip>
                  <Tooltip content={t('复制链接')}>
                    <Button
                      size='small'
                      theme='borderless'
                      type='tertiary'
                      icon={<Copy size={13} />}
                      onClick={() => navigator.clipboard?.writeText(asset.assetUrl)}
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
                />
              </Tooltip>
              <Tooltip content={t('复制提示词')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='tertiary'
                  className='!text-xs'
                  onClick={() => {
                    navigator.clipboard?.writeText(asset.prompt || '');
                    onCopyPrompt?.(asset);
                  }}
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
              />
            </Tooltip>
          </div>
        )}
      </div>
    </Card>
  );
};

export default AssetCard;
