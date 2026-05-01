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
          'relative w-full aspect-[4/3] rounded-xl border-2 border-dashed transition-all duration-200 flex items-center justify-center overflow-hidden group',
          isFilled
            ? 'border-transparent bg-gray-100 shadow-sm'
            : dragOver
              ? 'border-blue-500 bg-blue-50/80 cursor-pointer scale-[1.02]'
              : 'border-gray-300 bg-gradient-to-br from-gray-50 to-white hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer',
        ].join(' ')}
      >
        {uploading ? (
          <div className='flex flex-col items-center gap-2'>
            <div className='w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center'>
              <Spin size='middle' />
            </div>
            <Text type='tertiary' className='!text-xs'>
              {t('上传中…')}
            </Text>
          </div>
        ) : isFilled ? (
          <>
            <img
              src={value}
              alt={label}
              className='w-full h-full object-cover'
            />
            <div className='absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity' />
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                onChange?.('');
              }}
              className='absolute top-2 right-2 bg-black/60 hover:bg-red-500 backdrop-blur-sm rounded-lg p-1.5 text-white transition-all opacity-0 group-hover:opacity-100 shadow-lg'
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <div className='flex flex-col items-center gap-2 text-gray-400 px-3 text-center'>
            <div className='w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors'>
              <ImagePlus size={22} strokeWidth={1.5} />
            </div>
            <Text type='tertiary' className='!text-xs !text-gray-500 font-medium'>
              {t('点击 / 拖拽 / 粘贴')}
            </Text>
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                setShowUrlInput((v) => !v);
              }}
              className='inline-flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 mt-0.5 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors'
            >
              <LinkIcon size={11} />
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
            className='flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500'
          />
          <button
            type='button'
            onClick={handleUrlSubmit}
            className='px-3 py-1.5 text-xs bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg shadow-sm hover:shadow-md transition-shadow'
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
