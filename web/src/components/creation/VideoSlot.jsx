/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useRef, useState, useCallback } from 'react';
import { Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { Film, X, Link as LinkIcon, Cloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { uploadVideo, uploadToVolcAsset } from '../../services/creation/fileUpload';

const { Text } = Typography;

const ACCEPTED = 'video/mp4,video/quicktime';

// 单视频上传槽。Seedance 2.0 参考视频:单段 2~15s,单文件 ≤50MB。
// Props:
//   - label   显示文案
//   - value   当前 URL
//   - onChange(newUrl)   值变更回调,'' 表示清空
//   - maxSizeMB    可选,默认 50
//   - minSeconds   可选,默认 2
//   - maxSeconds   可选,默认 15
const VideoSlot = ({
  label,
  value,
  onChange,
  maxSizeMB = 50,
  minSeconds = 2,
  maxSeconds = 15,
  volcAsset = '',
}) => {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const volcFileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlText, setUrlText] = useState('');

  const checkDuration = useCallback(
    (file) =>
      new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          resolve(v.duration || 0);
        };
        v.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(0);
        };
        v.src = url;
      }),
    [],
  );

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!ACCEPTED.split(',').includes(file.type)) {
        Toast.warning(t('仅支持 MP4 / MOV'));
        return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        Toast.warning(t('视频超过 {{n}} MB 上限', { n: maxSizeMB }));
        return;
      }
      const dur = await checkDuration(file);
      if (dur > 0 && (dur < minSeconds || dur > maxSeconds)) {
        Toast.warning(
          t('视频时长 {{d}}s 不在 {{min}}~{{max}}s 范围内', {
            d: dur.toFixed(1),
            min: minSeconds,
            max: maxSeconds,
          }),
        );
        return;
      }
      setUploading(true);
      try {
        const data = await uploadVideo(file);
        onChange?.(data.url);
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || t('上传失败');
        Toast.error(msg);
      } finally {
        setUploading(false);
      }
    },
    [onChange, maxSizeMB, minSeconds, maxSeconds, t, checkDuration],
  );

  const handleUrlSubmit = () => {
    const v = urlText.trim();
    if (!v) return;
    if (!/^https?:\/\//.test(v) && !v.startsWith('asset://')) {
      Toast.warning(t('请输入 http(s) 或 asset:// URL'));
      return;
    }
    onChange?.(v);
    setShowUrlInput(false);
    setUrlText('');
  };

  // 上传到火山方舟 Files API,返回 asset://file-xxx
  // 适用场景:含真人的参考视频(Seedance 2.0 不支持公网真人视频 URL,但接受 file_id)
  const handleVolcUpload = useCallback(
    async (file) => {
      if (!file) return;
      if (!ACCEPTED.split(',').includes(file.type)) {
        Toast.warning(t('仅支持 MP4 / MOV'));
        return;
      }
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

  const isFilled = value && value.length > 0;

  return (
    <div className='space-y-1'>
      {label && (
        <Text strong className='!text-xs'>
          {t(label)}
        </Text>
      )}
      <div
        onClick={isFilled || uploading ? undefined : () => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer?.files?.[0];
          if (f) handleFile(f);
        }}
        className={[
          'relative w-full min-h-[140px] rounded-lg border-2 border-dashed transition-colors flex items-center justify-center overflow-hidden group',
          isFilled
            ? 'border-transparent bg-black'
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
            <video
              src={value}
              controls
              preload='metadata'
              className='w-full h-full max-h-[200px] object-contain bg-black'
            />
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                onChange?.('');
              }}
              className='absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 rounded p-1 text-white transition-colors opacity-0 group-hover:opacity-100'
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <div className='flex flex-col items-center gap-1.5 text-gray-400 px-3 text-center'>
            <Film size={22} strokeWidth={1.5} />
            <Text type='tertiary' className='!text-xs'>
              {t('点击 / 拖拽 视频')}
            </Text>
            <Text type='tertiary' className='!text-[10px]'>
              MP4 / MOV · {minSeconds}~{maxSeconds}s · ≤{maxSizeMB}MB
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
                  title={t('上传到火山方舟,适用于含真人素材,默认 7 天有效')}
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

export default VideoSlot;
