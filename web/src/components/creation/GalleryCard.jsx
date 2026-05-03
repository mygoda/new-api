/*
Copyright (C) 2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later

作品库卡片：
- 图片本体保持干净，不做任何文字叠加
- 图片下方一排小图标按钮，按钮承载具体功能
- 提示词、参数等详细信息通过 Popover 弹出展示，避免遮挡图片
*/

import React, { useState } from 'react';
import { Typography, Tooltip, Popover, Tag, Toast, Modal } from '@douyinfe/semi-ui';
import {
  Download,
  Copy,
  Trash2,
  Sparkles,
  Maximize2,
  Info,
  Video as VideoIcon,
  ImageOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { copyText, downloadUrl } from '../../utils/creation/clipboard';

const { Text, Paragraph } = Typography;

const InfoBubble = ({ asset }) => {
  const { t } = useTranslation();
  return (
    <div className='w-72 p-3 space-y-2 text-[12px]'>
      <div className='flex items-center gap-1.5 flex-wrap'>
        <Tag size='small' color='blue'>{asset.modelName}</Tag>
        {asset.modality === 'video' && (
          <Tag size='small' color='violet'>
            {t('视频')}
          </Tag>
        )}
        {asset.createdAt && (
          <Text type='tertiary' className='!text-[10px]'>
            {new Date(asset.createdAt).toLocaleString()}
          </Text>
        )}
      </div>
      {asset.prompt && (
        <div>
          <Text type='tertiary' className='!text-[10px] !block mb-1'>
            {t('提示词')}
          </Text>
          <Paragraph
            ellipsis={{ rows: 4, showTooltip: true, expandText: t('展开'), collapseText: t('收起') }}
            copyable={{ content: asset.prompt }}
            className='!text-[12px] !mb-0 !text-gray-700'
          >
            {asset.prompt}
          </Paragraph>
        </div>
      )}
      {asset.params && Object.keys(asset.params).length > 0 && (
        <div>
          <Text type='tertiary' className='!text-[10px] !block mb-1'>
            {t('参数')}
          </Text>
          <div className='grid grid-cols-2 gap-x-2 gap-y-0.5'>
            {Object.entries(asset.params).map(([k, v]) => (
              <div key={k} className='text-[11px] truncate'>
                <span className='text-gray-500'>{k}: </span>
                <span className='text-gray-800'>{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const GalleryCard = ({ asset, onDelete }) => {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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

  const handleDelete = () => {
    Modal.confirm({
      title: t('确认删除？'),
      content: t('删除后将无法恢复。'),
      okText: t('删除'),
      cancelText: t('取消'),
      okButtonProps: { type: 'danger' },
      onOk: () => onDelete?.(asset),
    });
  };

  const ActionBtn = ({ icon: Icon, tip, onClick, danger }) => (
    <Tooltip content={tip} position='top'>
      <button
        type='button'
        onClick={onClick}
        className={[
          'flex-1 inline-flex items-center justify-center h-7 rounded transition-colors',
          danger
            ? 'text-gray-500 hover:bg-red-50 hover:text-red-600'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
        ].join(' ')}
      >
        <Icon size={13} />
      </button>
    </Tooltip>
  );

  return (
    <div className='rounded-xl overflow-hidden bg-white ring-1 ring-gray-200/70 hover:ring-gray-300 hover:shadow-md transition-all flex flex-col'>
      {/* 图片本体：保持干净 */}
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => url && setPreviewOpen(true)}
        className='relative aspect-square bg-gray-100 cursor-zoom-in group'
      >
        {url ? (
          isVideo ? (
            <video
              src={url}
              className='w-full h-full object-cover'
              muted
              loop
              playsInline
              autoPlay={hover}
            />
          ) : (
            <img
              src={url}
              alt=''
              loading='lazy'
              className='w-full h-full object-cover'
            />
          )
        ) : (
          <div className='w-full h-full flex items-center justify-center text-gray-300'>
            <ImageOff size={28} />
          </div>
        )}

        {/* 视频角标（不遮挡内容） */}
        {isVideo && (
          <div className='absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded backdrop-blur-sm'>
            <VideoIcon size={10} />
            {t('视频')}
          </div>
        )}

        {/* hover：仅放大镜，不遮挡过多 */}
        {url && (
          <div className='absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100'>
            <Maximize2 size={20} className='text-white drop-shadow-md' />
          </div>
        )}
      </div>

      {/* 操作栏：图片下方 */}
      <div className='flex items-center px-1 py-0.5 border-t border-gray-100 bg-white'>
        <Popover
          trigger='click'
          position='topLeft'
          showArrow
          content={<InfoBubble asset={asset} />}
        >
          <button
            type='button'
            className='flex-1 inline-flex items-center justify-center h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            title={t('查看提示词与参数')}
          >
            <Info size={13} />
          </button>
        </Popover>
        <ActionBtn icon={Download} tip={t('下载')} onClick={download} />
        <ActionBtn icon={Copy} tip={t('复制链接')} onClick={copyLink} />
        <ActionBtn
          icon={Sparkles}
          tip={t('复制提示词与参数（JSON）')}
          onClick={copyPromptJson}
        />
        {onDelete && (
          <ActionBtn icon={Trash2} tip={t('删除')} onClick={handleDelete} danger />
        )}
      </div>

      {/* 模型名 + 提示词预览：极薄一行，提供上下文 */}
      <div className='px-2 pb-1.5 -mt-0.5'>
        <Text className='!text-[10px] !text-gray-400 !block truncate'>
          {asset.modelName}
          {asset.prompt && <span className='text-gray-300'> · </span>}
          {asset.prompt && <span className='text-gray-500'>{asset.prompt}</span>}
        </Text>
      </div>

      {/* 大图预览 */}
      <Modal
        visible={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width='auto'
        style={{ maxWidth: '90vw', maxHeight: '90vh' }}
        bodyStyle={{ padding: 0, background: '#000' }}
        closable={false}
        maskClosable
      >
        <div
          className='flex items-center justify-center cursor-zoom-out'
          onClick={() => setPreviewOpen(false)}
          style={{ maxWidth: '90vw', maxHeight: '90vh' }}
        >
          {isVideo ? (
            <video
              src={url}
              controls
              autoPlay
              className='max-w-[90vw] max-h-[85vh]'
            />
          ) : (
            <img
              src={url}
              alt=''
              className='max-w-[90vw] max-h-[85vh] object-contain'
            />
          )}
        </div>
      </Modal>
    </div>
  );
};

export default GalleryCard;
