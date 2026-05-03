/*
Copyright (C) 2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later

批量对比卡片：
- 同一 prompt 并发到多个模型的结果横向并排展示
- 每张图带模型名 + 状态徽标 + 单图操作（详情 / 下载 / 复制链接 / 复制 JSON / 重试 / 删除）
- 进行中显示 spinner + 已耗时 + "生成中"
- 顶部显示总进度条（成功+失败 / 总数）
*/

import React, { useState, useEffect } from 'react';
import { Card, Tag, Typography, Tooltip, Button, Popover, Modal, Progress } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Download,
  Copy,
  Maximize2,
  Trash2,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Info,
} from 'lucide-react';
import { copyText, downloadUrl } from '../../utils/creation/clipboard';
import { getProgressNarrative } from '../../utils/creation/progressNarrative';

const { Text, Paragraph } = Typography;

// 简易计时器：用于触发 narrative / 进度的实时刷新
function useTick(active, intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
}

const StatusBadge = ({ status }) => {
  if (status === 'success')
    return (
      <span className='inline-flex items-center px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded'>
        ✓
      </span>
    );
  if (status === 'failed')
    return (
      <span className='inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-700 text-[10px] rounded'>
        <AlertCircle size={10} /> 失败
      </span>
    );
  return (
    <span className='inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded'>
      <Sparkles size={10} className='animate-pulse' /> 生成中
    </span>
  );
};

// 进行中的占位：复用默认 AssetCard 的"构思 / 渲染 / 润色"叙事 + 渐变背景 + 进度条
const PendingPlaceholder = ({ asset }) => {
  const isPending = true;
  useTick(isPending);
  const p = getProgressNarrative(asset);
  return (
    <div className='absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50/40 to-pink-50/40 flex flex-col items-center justify-center gap-2 px-3 text-center overflow-hidden'>
      {/* 背景流光 */}
      <div className='absolute inset-0 opacity-30 pointer-events-none'>
        <div className='absolute -inset-x-4 top-1/2 h-24 bg-gradient-to-r from-transparent via-blue-200 to-transparent blur-2xl animate-pulse' />
      </div>
      <div className='relative z-10 flex flex-col items-center gap-1.5 w-full'>
        <div className='text-2xl select-none animate-bounce' style={{ animationDuration: '2s' }}>
          {p.icon}
        </div>
        <Text strong className='!text-[12px] !text-gray-800'>
          {p.text}
        </Text>
        <div className='w-3/4 h-1 bg-white/80 rounded-full overflow-hidden'>
          <div
            className='h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000 ease-out'
            style={{ width: `${p.progress}%` }}
          />
        </div>
        <div className='flex items-center gap-1 text-[10px] text-gray-500'>
          <span className='tabular-nums'>{p.progress}%</span>
          <span className='text-gray-300'>·</span>
          <span>{p.etaText}</span>
        </div>
      </div>
    </div>
  );
};

const InfoBubble = ({ asset }) => (
  <div className='w-72 p-3 space-y-2 text-[12px]'>
    <div className='flex items-center gap-1.5 flex-wrap'>
      <Tag size='small' color='blue'>{asset.modelName}</Tag>
      {asset.createdAt && (
        <Text type='tertiary' className='!text-[10px]'>
          {new Date(asset.createdAt).toLocaleTimeString()}
        </Text>
      )}
    </div>
    {asset.prompt && (
      <div>
        <Text type='tertiary' className='!text-[10px] !block mb-1'>提示词</Text>
        <Paragraph
          ellipsis={{ rows: 4, showTooltip: true, expandText: '展开', collapseText: '收起' }}
          copyable={{ content: asset.prompt }}
          className='!text-[12px] !mb-0 !text-gray-700'
        >
          {asset.prompt}
        </Paragraph>
      </div>
    )}
    {asset.errorMessage && (
      <div>
        <Text type='tertiary' className='!text-[10px] !block mb-1'>错误</Text>
        <Paragraph copyable={{ content: asset.errorMessage }} className='!text-[12px] !mb-0 !text-red-600'>
          {asset.errorMessage}
        </Paragraph>
      </div>
    )}
  </div>
);

const Tile = ({ asset, onReplay, onRetry, onDelete }) => {
  const { t } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const url = asset?.assetUrl;
  const status = asset?.status || 'pending';
  const isVideo = asset?.modality === 'video';

  const copyLink = () => copyText(url);
  const download = () =>
    downloadUrl(
      url,
      `${asset.modelName || 'asset'}-${asset.id || Date.now()}${isVideo ? '.mp4' : '.png'}`,
    );
  const copyPromptJson = () =>
    copyText(
      JSON.stringify(
        {
          prompt: asset.prompt || '',
          model: asset.modelName,
          params: asset.params || {},
        },
        null,
        2,
      ),
    );

  return (
    <div className='rounded-md overflow-hidden bg-gray-50 ring-1 ring-gray-200/70 flex flex-col'>
      {/* 图片本体 */}
      <div
        className={[
          'relative aspect-square bg-gray-100 group/media',
          status === 'success' && url ? 'cursor-zoom-in' : '',
        ].join(' ')}
        onClick={() => status === 'success' && url && setPreviewOpen(true)}
      >
        {url && status === 'success' ? (
          isVideo ? (
            <video src={url} className='w-full h-full object-cover' muted loop playsInline />
          ) : (
            <img src={url} alt='' loading='lazy' className='w-full h-full object-cover' />
          )
        ) : status === 'failed' ? (
          <div className='w-full h-full flex flex-col items-center justify-center px-3 text-center bg-red-50/40'>
            <AlertCircle size={22} className='text-red-400 mb-1' />
            <Text type='danger' className='!text-[10px] line-clamp-3'>
              {asset?.errorMessage || t('生成失败')}
            </Text>
          </div>
        ) : (
          <PendingPlaceholder asset={asset} />
        )}

        {/* 模型 + 状态徽标（不遮挡过多） */}
        <div className='absolute top-1.5 left-1.5 right-1.5 flex items-start gap-1 pointer-events-none'>
          <span className='inline-flex items-center px-1.5 py-0.5 bg-black/60 text-white text-[10px] font-medium rounded backdrop-blur-sm truncate max-w-[60%]'>
            {asset?.modelName}
          </span>
          <span className='ml-auto'>
            <StatusBadge status={status} />
          </span>
        </div>

        {/* 悬浮放大按钮（与默认 AssetCard 一致） */}
        {status === 'success' && url && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPreviewOpen(true);
            }}
            className='absolute top-2 right-2 bg-black/55 hover:bg-black/75 backdrop-blur-sm text-white rounded p-1.5 opacity-0 group-hover/media:opacity-100 transition-opacity'
            title={t('放大查看')}
          >
            <Maximize2 size={11} />
          </button>
        )}
      </div>

      {/* 操作栏：完全对齐默认 AssetCard 的样式 */}
      <div className='px-2 py-1 border-t border-gray-100 bg-white'>
        {status === 'success' && url && (
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-0.5'>
              <Tooltip content={t('下载')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='tertiary'
                  icon={<Download size={13} />}
                  onClick={download}
                />
              </Tooltip>
              <Tooltip content={t('复制链接')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='tertiary'
                  icon={<Copy size={13} />}
                  onClick={copyLink}
                />
              </Tooltip>
              {onReplay && (
                <Tooltip content={t('沿用参数再生成')}>
                  <Button
                    size='small'
                    theme='borderless'
                    type='tertiary'
                    icon={<RotateCcw size={13} />}
                    onClick={() => onReplay(asset)}
                  />
                </Tooltip>
              )}
              <Tooltip content={t('复制提示词与参数')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='tertiary'
                  icon={<Sparkles size={13} />}
                  onClick={copyPromptJson}
                />
              </Tooltip>
              <Popover
                trigger='click'
                position='topLeft'
                showArrow
                content={<InfoBubble asset={asset} />}
              >
                <Button
                  size='small'
                  theme='borderless'
                  type='tertiary'
                  icon={<Info size={13} />}
                />
              </Popover>
            </div>
            {onDelete && (
              <Tooltip content={t('删除')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='danger'
                  icon={<Trash2 size={13} />}
                  onClick={() => onDelete(asset)}
                />
              </Tooltip>
            )}
          </div>
        )}

        {status === 'failed' && (
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-1'>
              {onRetry && (
                <Button
                  size='small'
                  theme='light'
                  type='primary'
                  icon={<RotateCcw size={13} />}
                  onClick={() => onRetry(asset)}
                >
                  {t('同参重试')}
                </Button>
              )}
              {onReplay && (
                <Button
                  size='small'
                  theme='borderless'
                  type='tertiary'
                  onClick={() => onReplay(asset)}
                >
                  {t('换个模型')}
                </Button>
              )}
              <Popover
                trigger='click'
                position='topLeft'
                showArrow
                content={<InfoBubble asset={asset} />}
              >
                <Button
                  size='small'
                  theme='borderless'
                  type='tertiary'
                  icon={<Info size={13} />}
                />
              </Popover>
            </div>
            {onDelete && (
              <Tooltip content={t('删除')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='danger'
                  icon={<Trash2 size={13} />}
                  onClick={() => onDelete(asset)}
                />
              </Tooltip>
            )}
          </div>
        )}

        {/* pending 时只留一个删除按钮（避免操作误触正在生成的任务） */}
        {status !== 'success' && status !== 'failed' && (
          <div className='flex items-center justify-end'>
            {onDelete && (
              <Tooltip content={t('放弃这次生成')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='danger'
                  icon={<Trash2 size={13} />}
                  onClick={() => onDelete(asset)}
                />
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* 大图预览 */}
      {url && (
        <Modal
          visible={previewOpen}
          onCancel={() => setPreviewOpen(false)}
          footer={null}
          width='auto'
          style={{ maxWidth: '90vw' }}
          bodyStyle={{ padding: 0, background: '#000' }}
          closable={false}
          maskClosable
        >
          <div
            className='flex items-center justify-center cursor-zoom-out'
            onClick={() => setPreviewOpen(false)}
          >
            {isVideo ? (
              <video src={url} controls autoPlay className='max-w-[90vw] max-h-[85vh]' />
            ) : (
              <img src={url} alt='' className='max-w-[90vw] max-h-[85vh] object-contain' />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

const BatchCompareCard = ({ batch, onReplay, onRetry, onTileDelete, onDelete }) => {
  const { t } = useTranslation();
  const items = batch.items || [];
  const cols =
    items.length <= 2 ? 'grid-cols-2' :
    items.length === 3 ? 'grid-cols-3' :
    items.length === 4 ? 'grid-cols-4' : 'grid-cols-4';

  const successCount = items.filter((i) => i.status === 'success').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const pendingCount = items.length - successCount - failedCount;
  const finished = successCount + failedCount;
  const percent = items.length > 0 ? Math.floor((finished / items.length) * 100) : 0;

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

      {/* 总进度条 */}
      {pendingCount > 0 && (
        <div className='mb-2'>
          <Progress percent={percent} size='small' showInfo={false} />
          <Text type='tertiary' className='!text-[10px] !mt-0.5 !block'>
            {t('已完成 {{done}} / {{total}}', { done: finished, total: items.length })}
          </Text>
        </div>
      )}

      <div className={`grid ${cols} gap-1.5`}>
        {items.map((it) => (
          <Tile
            key={it.id}
            asset={it}
            onReplay={onReplay}
            onRetry={onRetry}
            onDelete={onTileDelete}
          />
        ))}
      </div>

      {batch.prompt && (
        <Paragraph
          ellipsis={{ rows: 2, showTooltip: true }}
          className='!text-[11px] !mt-2 !mb-0 !text-gray-500'
        >
          {batch.prompt}
        </Paragraph>
      )}
    </Card>
  );
};

export default BatchCompareCard;
