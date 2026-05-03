/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useState } from 'react';
import { Card, Button, Tag, Typography, Tooltip } from '@douyinfe/semi-ui';
import { Download, Copy, RotateCcw, Trash2, Image as ImageIcon, Video as VideoIcon, Sparkles, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getProgressNarrative } from '../../utils/creation/progressNarrative';
import { copyText, downloadUrl } from '../../utils/creation/clipboard';

const { Text, Paragraph } = Typography;

// 单个产物卡片：图像 / 视频 / 失败 / 进行中通用
const AssetCard = ({ asset, onReplay, onDelete, onCopyPrompt, onRetry, onSwitchModel }) => {
  const { t } = useTranslation();
  const isVideo = asset.modality === 'video';
  const status = asset.status || 'success';

  // 生成中：每秒刷新进度叙事
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'pending' && status !== 'in_progress' && status !== 'queued') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const renderMedia = () => {
    if (status === 'pending' || status === 'in_progress' || status === 'queued') {
      const p = getProgressNarrative(asset);
      return (
        <div className='aspect-video rounded-md bg-gradient-to-br from-blue-50 via-purple-50/40 to-pink-50/40 border border-blue-100 flex flex-col items-center justify-center gap-3 px-6 text-center relative overflow-hidden'>
          {/* 微动画背景 */}
          <div className='absolute inset-0 opacity-30'>
            <div className='absolute -inset-x-4 top-1/2 h-32 bg-gradient-to-r from-transparent via-blue-200 to-transparent blur-2xl animate-pulse' />
          </div>
          <div className='relative z-10 flex flex-col items-center gap-2'>
            <div className='text-3xl select-none animate-bounce' style={{ animationDuration: '2s' }}>
              {p.icon}
            </div>
            <Text strong className='!text-sm !text-gray-800'>
              {t(p.text)}
            </Text>
            <div className='w-40 h-1.5 bg-white/80 rounded-full overflow-hidden'>
              <div
                className='h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000 ease-out'
                style={{ width: `${p.progress}%` }}
              />
            </div>
            <div className='flex items-center gap-1.5 text-[11px]'>
              <Text type='tertiary' className='!text-[11px] tabular-nums'>
                {p.progress}%
              </Text>
              <span className='text-gray-300'>·</span>
              <Text type='tertiary' className='!text-[11px]'>
                {t(p.etaText)}
              </Text>
            </div>
          </div>
        </div>
      );
    }
    if (status === 'failed' || status === 'timeout') {
      return null; // 失败态由独立的 FailedCard 渲染（见下方）
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
      <div className='relative group/media'>
        <img
          src={asset.assetUrl}
          alt={asset.prompt}
          className='w-full rounded'
          style={{ maxHeight: 480, objectFit: 'contain' }}
          loading='lazy'
        />
        {/* 悬浮放大 */}
        <button
          onClick={() => window.open(asset.assetUrl, '_blank', 'noopener,noreferrer')}
          className='absolute top-2 right-2 bg-black/55 hover:bg-black/75 backdrop-blur-sm text-white rounded p-1.5 opacity-0 group-hover/media:opacity-100 transition-opacity'
          title={t('放大查看')}
        >
          <Maximize2 size={13} />
        </button>
      </div>
    );
  };

  // 失败态用独立卡片
  if (status === 'failed' || status === 'timeout') {
    return <FailedCard asset={asset} onRetry={onRetry} onSwitchModel={onSwitchModel} onDelete={onDelete} />;
  }

  return (
    <Card bordered bodyStyle={{ padding: 12 }} className='!rounded-lg hover:shadow-md transition-shadow group'>
      {renderMedia()}

      <div className='mt-3 space-y-2'>
        <div className='flex items-center gap-1.5 flex-wrap'>
          <Tag size='small' color={isVideo ? 'violet' : 'blue'}>
            {asset.modelName}
          </Tag>
        </div>

        <Paragraph
          ellipsis={{ rows: 2, showTooltip: true }}
          className='!text-xs !mb-0 !text-gray-600'
        >
          {asset.prompt}
        </Paragraph>

        {status === 'success' && (
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
                        downloadUrl(
                          asset.assetUrl,
                          `${asset.modelName || 'asset'}-${asset.id || Date.now()}.png`,
                        )
                      }
                    />
                  </Tooltip>
                  <Tooltip content={t('复制链接')}>
                    <Button
                      size='small'
                      theme='borderless'
                      type='tertiary'
                      icon={<Copy size={13} />}
                      onClick={() => copyText(asset.assetUrl)}
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
              <Tooltip content={t('复制提示词与参数')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='tertiary'
                  icon={<Sparkles size={13} />}
                  onClick={() => {
                    // 复制为 JSON：prompt + 模型 + 参数（接收方一键导入）
                    const payload = {
                      prompt: asset.prompt || '',
                      model: asset.modelName,
                      params: asset.params || {},
                    };
                    copyText(JSON.stringify(payload, null, 2));
                    onCopyPrompt?.(asset);
                  }}
                />
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

// 失败态卡片：明确告知未扣费 + 智能建议 + 多个出路
const FailedCard = ({ asset, onRetry, onSwitchModel, onDelete }) => {
  const { t } = useTranslation();
  const errMsg = asset.errorMessage || t('生成失败');

  // 简单错误归因
  const cause = (() => {
    const msg = errMsg.toLowerCase();
    if (/sensitive|moderation|内容|审核|policy/.test(msg)) {
      return { reason: '内容触发了平台审核', suggest: '试试更柔和、更具体的描述' };
    }
    if (/timeout|超时|deadline/.test(msg)) {
      return { reason: '上游服务响应超时', suggest: '换个模型或稍后重试' };
    }
    if (/rate|429|限流|frequency/.test(msg)) {
      return { reason: '请求过于频繁', suggest: '稍等片刻或切换其它模型' };
    }
    if (/quota|余额|insufficient|配额/.test(msg)) {
      return { reason: '令牌额度不足', suggest: '请联系管理员或更换令牌' };
    }
    if (/upstream|provider|服务/.test(msg)) {
      return { reason: '上游模型服务异常', suggest: '建议切换到其它模型' };
    }
    return { reason: errMsg, suggest: '可以同参重试或换模型试试' };
  })();

  return (
    <Card
      bordered
      bodyStyle={{ padding: 12 }}
      className='!rounded-lg hover:shadow-md transition-shadow !border-red-200/70'
    >
      <div className='aspect-video rounded-md bg-gradient-to-br from-red-50 to-orange-50/60 border border-red-100 flex flex-col items-center justify-center px-5 text-center'>
        <div className='text-2xl mb-2'>😔</div>
        <Text strong type='danger' className='!text-sm mb-1'>
          {t('这次没生成成功')}
        </Text>
        <Text type='tertiary' className='!text-[11px] mb-2 line-clamp-2'>
          {t('原因：')}
          {t(cause.reason)}
        </Text>
        <div className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-100'>
          <Text className='!text-[11px] !text-green-700 font-medium'>
            ✓ {t('本次未扣除你的额度')}
          </Text>
        </div>
      </div>

      <div className='mt-3 space-y-2'>
        <div className='flex items-center gap-1.5 flex-wrap'>
          <Tag size='small' color='red'>
            {asset.modelName}
          </Tag>
        </div>

        <div className='!text-[11px] !text-gray-500 leading-relaxed'>
          💡 {t('建议：')}
          {t(cause.suggest)}
        </div>

        <Paragraph
          ellipsis={{ rows: 1, showTooltip: true }}
          className='!text-[11px] !mb-0 !text-gray-400'
        >
          "{asset.prompt}"
        </Paragraph>

        <div className='flex items-center justify-between pt-1 border-t border-gray-100'>
          <div className='flex items-center gap-1'>
            <Button
              size='small'
              theme='light'
              type='primary'
              icon={<RotateCcw size={13} />}
              onClick={() => onRetry?.(asset)}
            >
              {t('同参重试')}
            </Button>
            <Button
              size='small'
              theme='borderless'
              type='tertiary'
              onClick={() => onSwitchModel?.(asset)}
            >
              {t('换个模型')}
            </Button>
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
      </div>
    </Card>
  );
};

export default AssetCard;

