/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useRef, useState, useCallback } from 'react';
import { Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { ImagePlus, X, Link as LinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { uploadImage } from '../../services/creation/imageUpload';

const { Text } = Typography;

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif';

// 单图上传槽：支持点击 / 拖拽 / URL 粘贴
//
// Props:
//   - label   显示文案（如「首帧」「尾帧」「参考图」）
//   - value   当前 URL（来自后端 /api/upload/image 返回，或用户直接粘贴）
//   - onChange(newUrl)   值变更时回调；newUrl === '' 表示清空
//   - maxSizeMB    可选，前端预检大小，默认 10
const ImageSlot = ({ label, value, onChange, maxSizeMB = 10 }) => {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlText, setUrlText] = useState('');

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!ACCEPTED.split(',').includes(file.type)) {
      Toast.warning(t('仅支持 JPG / PNG / WebP / GIF'));
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      Toast.warning(t('图片超过 {{n}} MB 上限', { n: maxSizeMB }));
      return;
    }
    setUploading(true);
    try {
      const data = await uploadImage(file);
      onChange?.(data.url);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        t('上传失败');
      Toast.error(msg);
    } finally {
      setUploading(false);
    }
  }, [onChange, maxSizeMB, t]);

  const handleClick = () => {
    if (uploading) return;
    fileRef.current?.click();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.type?.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
          return;
        }
      }
    }
  };

  const handleUrlSubmit = () => {
    const v = urlText.trim();
    if (!v) return;
    if (!/^https?:\/\//.test(v) && !v.startsWith('data:image/')) {
      Toast.warning(t('请输入合法的 http(s) 或 data:image URL'));
      return;
    }
    onChange?.(v);
    setShowUrlInput(false);
    setUrlText('');
  };

  const isFilled = value && value.length > 0;

  return (
    <div className='space-y-1'>
      {label && (
        <Text strong className='!text-xs'>
          {t(label)}
        </Text>
      )}
      <div
        onClick={isFilled ? undefined : handleClick}
        onPaste={handlePaste}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={[
          'relative w-full aspect-[4/3] rounded-lg border-2 border-dashed transition-colors flex items-center justify-center overflow-hidden',
          isFilled
            ? 'border-transparent bg-gray-50'
            : dragOver
              ? 'border-blue-500 bg-blue-50 cursor-pointer'
              : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer',
        ].join(' ')}
      >
        {uploading ? (
          <div className='flex flex-col items-center gap-1'>
            <Spin size='middle' />
            <Text type='tertiary' className='!text-xs'>
              {t('上传中…')}
            </Text>
          </div>
        ) : isFilled ? (
          <>
            <img
              src={value}
              alt={label}
              className='w-full h-full object-contain'
            />
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                onChange?.('');
              }}
              className='absolute top-1.5 right-1.5 bg-black/50 hover:bg-black/75 rounded-full p-1 text-white'
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <div className='flex flex-col items-center gap-1 text-gray-400 px-2 text-center'>
            <ImagePlus size={22} />
            <Text type='tertiary' className='!text-xs'>
              {t('点击 / 拖拽 / 粘贴')}
            </Text>
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                setShowUrlInput((v) => !v);
              }}
              className='inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1'
            >
              <LinkIcon size={12} />
              {t('或粘贴图片 URL')}
            </button>
          </div>
        )}
      </div>

      {showUrlInput && !isFilled && (
        <div className='flex gap-1.5'>
          <input
            type='text'
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder='https://...'
            className='flex-1 px-2 py-1 text-xs border border-gray-200 rounded'
          />
          <button
            type='button'
            onClick={handleUrlSubmit}
            className='px-2 py-1 text-xs bg-blue-500 text-white rounded'
          >
            {t('确定')}
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type='file'
        accept={ACCEPTED}
        className='hidden'
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
};

export default ImageSlot;
