/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useRef, useState, useCallback } from 'react';
import { Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { Music, X, Link as LinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { uploadAudio } from '../../services/creation/fileUpload';

const { Text } = Typography;

const ACCEPTED = 'audio/mpeg,audio/wav,audio/x-wav,audio/wave';

// 单音频上传槽。Seedance 2.0 参考音频:单段 2~15s,单文件 ≤15MB。
// Props:
//   - label   显示文案
//   - value   当前 URL
//   - onChange(newUrl)
//   - maxSizeMB    默认 15
//   - minSeconds   默认 2
//   - maxSeconds   默认 15
const AudioSlot = ({
  label,
  value,
  onChange,
  maxSizeMB = 15,
  minSeconds = 2,
  maxSeconds = 15,
}) => {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlText, setUrlText] = useState('');

  const checkDuration = useCallback(
    (file) =>
      new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const a = document.createElement('audio');
        a.preload = 'metadata';
        a.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          resolve(a.duration || 0);
        };
        a.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(0);
        };
        a.src = url;
      }),
    [],
  );

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      const acceptTypes = ACCEPTED.split(',');
      if (!acceptTypes.includes(file.type) && !/\.(mp3|wav)$/i.test(file.name)) {
        Toast.warning(t('仅支持 MP3 / WAV'));
        return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        Toast.warning(t('音频超过 {{n}} MB 上限', { n: maxSizeMB }));
        return;
      }
      const dur = await checkDuration(file);
      if (dur > 0 && (dur < minSeconds || dur > maxSeconds)) {
        Toast.warning(
          t('音频时长 {{d}}s 不在 {{min}}~{{max}}s 范围内', {
            d: dur.toFixed(1),
            min: minSeconds,
            max: maxSeconds,
          }),
        );
        return;
      }
      setUploading(true);
      try {
        const data = await uploadAudio(file);
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
    if (!/^https?:\/\//.test(v)) {
      Toast.warning(t('请输入合法的 http(s) URL'));
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
          'relative w-full min-h-[90px] rounded-lg border-2 border-dashed transition-colors flex items-center justify-center overflow-hidden group px-3 py-2',
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
          <div className='flex items-center gap-2 w-full'>
            <Music size={18} className='text-gray-500 shrink-0' />
            <audio src={value} controls className='flex-1 h-9' />
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                onChange?.('');
              }}
              className='bg-black/40 hover:bg-black/60 rounded p-1 text-white transition-colors'
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className='flex flex-col items-center gap-1 text-gray-400 text-center'>
            <Music size={20} strokeWidth={1.5} />
            <Text type='tertiary' className='!text-xs'>
              {t('点击 / 拖拽 音频')}
            </Text>
            <Text type='tertiary' className='!text-[10px]'>
              MP3 / WAV · {minSeconds}~{maxSeconds}s · ≤{maxSizeMB}MB
            </Text>
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                setShowUrlInput((v) => !v);
              }}
              className='inline-flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 mt-0.5'
            >
              <LinkIcon size={11} />
              {t('或粘贴音频 URL')}
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
    </div>
  );
};

export default AudioSlot;
