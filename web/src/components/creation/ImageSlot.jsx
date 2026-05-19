/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useRef, useState, useCallback } from 'react';
import { Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { ImagePlus, X, Link as LinkIcon, Maximize2, Cloud } from 'lucide-react';
import ImageLightbox from './ImageLightbox';
import { useTranslation } from 'react-i18next';
import { uploadImage, uploadToVolcAsset } from '../../services/creation/fileUpload';

const { Text } = Typography;

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif';

// 单图上传槽：支持点击 / 拖拽 / URL 粘贴
//
// Props:
//   - label        显示文案（如「首帧」「尾帧」「参考图」）
//   - value        当前 URL（来自后端 /api/upload/image 返回,或用户直接粘贴,或 asset://xxx）
//   - onChange(newUrl)   值变更时回调；newUrl === '' 表示清空
//   - maxSizeMB    可选，前端预检大小，默认 10
//   - volcAsset    可选,传 modelName(如 'doubao-seedance-2-0-260128')即开启
//                  「上传到火山方舟（持久素材）」按钮,适合含真人脸的参考图。
//                  返回 asset://file-xxxx 而非 https:// 公网 URL。
const ImageSlot = ({ label, value, onChange, maxSizeMB = 10, volcAsset = '' }) => {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const volcFileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlText, setUrlText] = useState('');
  const [lightbox, setLightbox] = useState(false);

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

  // 上传到火山方舟 Files API,返回 asset://file-xxx
  // 适用场景:含真人脸的参考素材(Seedance 2.0 不支持公网 URL 直传真人,但接受 file_id)
  const handleVolcUpload = useCallback(
    async (file) => {
      if (!file) return;
      if (!ACCEPTED.split(',').includes(file.type)) {
        Toast.warning(t('仅支持 JPG / PNG / WebP / GIF'));
        return;
      }
      // 火山 Files API 单文件上限 512 MB,这里复用 maxSizeMB 防止本地过大
      if (file.size > 512 * 1024 * 1024) {
        Toast.warning(t('文件超过 512 MB 上限'));
        return;
      }
      setUploading(true);
      try {
        const data = await uploadToVolcAsset(file, volcAsset);
        onChange?.(data.asset_url);
        Toast.success(t('已上传到火山方舟(7 天有效): {{id}}', { id: data.id }));
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || t('火山方舟上传失败');
        Toast.error(msg);
      } finally {
        setUploading(false);
      }
    },
    [onChange, volcAsset, t],
  );

  const handleUrlSubmit = () => {
    const v = urlText.trim();
    if (!v) return;
    // 放开三种 URL: http(s) / data:image / asset:// (火山方舟资源 ID)
    if (
      !/^https?:\/\//.test(v) &&
      !v.startsWith('data:image/') &&
      !v.startsWith('asset://')
    ) {
      Toast.warning(t('请输入 http(s) / data:image / asset:// URL'));
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
          'relative w-full min-h-[200px] rounded-lg border-2 border-dashed transition-colors flex items-center justify-center overflow-hidden group',
          isFilled
            ? 'border-transparent bg-gray-50'
            : dragOver
              ? 'border-blue-400 bg-blue-50/60 cursor-pointer'
              : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer',
        ].join(' ')}
      >
        {uploading ? (
          <div className='flex flex-col items-center gap-1.5'>
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
              className='w-full h-full object-cover'
            />
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                onChange?.('');
              }}
              className='absolute top-1.5 right-1.5 bg-black/50 hover:bg-black/70 rounded p-1 text-white transition-colors opacity-0 group-hover:opacity-100'
            >
              <X size={14} />
            </button>
            <button
              type='button'
              onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
              className='absolute bottom-1.5 right-1.5 bg-black/50 hover:bg-black/70 rounded p-1 text-white transition-colors opacity-0 group-hover:opacity-100'
            >
              <Maximize2 size={14} />
            </button>
          </>
        ) : (
          <div className='flex flex-col items-center gap-1.5 text-gray-400 px-3 text-center'>
            <ImagePlus size={22} strokeWidth={1.5} />
            <Text type='tertiary' className='!text-xs'>
              {t('点击 / 拖拽 / 粘贴')}
            </Text>
            <div className='flex items-center gap-3'>
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUrlInput((v) => !v);
                }}
                className='inline-flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 mt-0.5'
              >
                <LinkIcon size={11} />
                {t('或粘贴 URL / asset')}
              </button>
              {volcAsset && (
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    volcFileRef.current?.click();
                  }}
                  className='inline-flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 mt-0.5'
                  title={t('上传到火山方舟,适用于含真人脸素材,默认 7 天有效')}
                >
                  <Cloud size={11} />
                  {t('火山方舟上传')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showUrlInput && !isFilled && (
        <div className='flex gap-1.5'>
          <input
            type='text'
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder='https://... 或 asset://file-xxx'
            className='flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400'
          />
          <button
            type='button'
            onClick={handleUrlSubmit}
            className='px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors'
          >
            {t('确定')}
          </button>
        </div>
      )}
      {lightbox && value && (
        <ImageLightbox images={[value]} index={0} onClose={() => setLightbox(false)} />
      )}

      <input
        ref={fileRef}
        type='file'
        accept={ACCEPTED}
        className='hidden'
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={volcFileRef}
        type='file'
        accept={ACCEPTED}
        className='hidden'
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleVolcUpload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
};

export default ImageSlot;
