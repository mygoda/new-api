/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later

聚合卡片：
- 当一次提交生成 N>1 张图时，聚合成一个网格（参考 Midjourney）
- 用户可选「放大某张」「基于某张生成变体」「编辑」
- 如果 N=1 直接退化为普通 AssetCard
*/

import React, { useState } from 'react';
import { Card, Button, Tag, Typography, Tooltip } from '@douyinfe/semi-ui';
import { Download, Copy, RotateCcw, Trash2, Sparkles, Maximize2, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AssetCard from './AssetCard';

const { Text, Paragraph } = Typography;

const AssetGroupCard = ({
  group,           // { id, modality, modelName, prompt, params, items: [...] }
  onReplay,        // 沿用参数再生成（4 张）
  onUpscale,       // 单张放大（高质量重生成）
  onVariation,     // 单张变体（n=4，基于种子）
  onDelete,
  onCopyPrompt,
}) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(null);

  const items = group.items || [];
  if (items.length === 0) return null;

  // 退化：单图 → 普通卡片
  if (items.length === 1) {
    return (
      <AssetCard
        asset={{ ...items[0], modality: group.modality, modelName: group.modelName, prompt: group.prompt, params: group.params }}
        onReplay={() => onReplay?.(group)}
        onDelete={() => onDelete?.(group)}
        onCopyPrompt={() => onCopyPrompt?.(group)}
      />
    );
  }

  // 多图：2×2 网格（4张）/ 1×N 横向（其它）
  const gridCols = items.length === 2 ? 'grid-cols-2' :
                   items.length === 4 ? 'grid-cols-2' :
                   items.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <Card bordered bodyStyle={{ padding: 12 }} className='!rounded-lg hover:shadow-md transition-shadow'>
      <div className={`grid ${gridCols} gap-1.5`}>
        {items.map((it, idx) => (
          <div
            key={it.id || idx}
            className='relative group/item rounded-md overflow-hidden bg-gray-100 aspect-square'
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
          >
            {it.assetUrl ? (
              <img
                src={it.assetUrl}
                alt={`${group.prompt} - ${idx + 1}`}
                className='w-full h-full object-cover transition-transform group-hover/item:scale-105'
                loading='lazy'
              />
            ) : (
              <div className='w-full h-full flex items-center justify-center text-gray-300'>
                {idx + 1}
              </div>
            )}

            {/* 序号徽标 */}
            <div className='absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/55 text-white text-[10px] font-semibold rounded backdrop-blur-sm'>
              V{idx + 1}
            </div>

            {/* 悬浮操作 */}
            {it.assetUrl && (
              <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity flex items-end justify-center gap-1 pb-2'>
                <Tooltip content={t('放大查看')}>
                  <button
                    onClick={() => window.open(it.assetUrl, '_blank', 'noopener,noreferrer')}
                    className='p-1.5 bg-white/95 hover:bg-white text-gray-700 rounded shadow-sm transition-colors'
                  >
                    <Maximize2 size={11} />
                  </button>
                </Tooltip>
                {onUpscale && (
                  <Tooltip content={t('高质量重生成')}>
                    <button
                      onClick={() => onUpscale?.(group, idx)}
                      className='p-1.5 bg-white/95 hover:bg-white text-gray-700 rounded shadow-sm transition-colors'
                    >
                      <Sparkles size={11} />
                    </button>
                  </Tooltip>
                )}
                {onVariation && (
                  <Tooltip content={t('生成变体')}>
                    <button
                      onClick={() => onVariation?.(group, idx)}
                      className='p-1.5 bg-white/95 hover:bg-white text-gray-700 rounded shadow-sm transition-colors'
                    >
                      <Wand2 size={11} />
                    </button>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className='mt-3 space-y-2'>
        <div className='flex items-center gap-1.5 flex-wrap'>
          <Tag size='small' color='blue'>
            {group.modelName}
          </Tag>
          <Tag size='small' color='grey'>
            {items.length} {t('张')}
          </Tag>
        </div>

        <Paragraph
          ellipsis={{ rows: 2, showTooltip: true }}
          className='!text-xs !mb-0 !text-gray-600'
        >
          {group.prompt}
        </Paragraph>

        <div className='flex items-center justify-between pt-1 border-t border-gray-100'>
          <div className='flex items-center gap-0.5'>
            <Tooltip content={t('沿用参数再生成')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<RotateCcw size={13} />}
                onClick={() => onReplay?.(group)}
              />
            </Tooltip>
            <Tooltip content={t('复制提示词与参数')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<Copy size={13} />}
                onClick={() => {
                  const payload = {
                    prompt: group.prompt || '',
                    model: group.modelName,
                    params: group.params || {},
                  };
                  navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
                  onCopyPrompt?.(group);
                }}
              />
            </Tooltip>
          </div>
          <Tooltip content={t('删除整组')}>
            <Button
              size='small'
              theme='borderless'
              type='danger'
              icon={<Trash2 size={13} />}
              onClick={() => onDelete?.(group)}
            />
          </Tooltip>
        </div>
      </div>
    </Card>
  );
};

export default AssetGroupCard;
