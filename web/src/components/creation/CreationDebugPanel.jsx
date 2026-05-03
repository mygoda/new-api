/*
Copyright (C) 2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later

创作中心专用的调试面板：
- 作为右侧可关闭抽屉渲染，不依赖 Semi Tabs renderArrow（之前版本的行为不稳定）
- 三个 tab：预览请求体 / 实际请求体 / 响应
- 每块内容都可独立复制；空状态清晰
*/

import React from 'react';
import { Button, Tooltip } from '@douyinfe/semi-ui';
import { X, Copy, FileCode2, Send, ArrowDownToLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { copyText } from '../../utils/creation/clipboard';

const TABS = [
  { key: 'preview', icon: FileCode2, label: '预览', field: 'previewRequest' },
  { key: 'request', icon: Send, label: '已发送', field: 'request' },
  { key: 'response', icon: ArrowDownToLine, label: '响应', field: 'response' },
];

const CreationDebugPanel = ({ debug, onClose }) => {
  const { t } = useTranslation();
  const activeKey = debug.activeTab || 'preview';
  const active = TABS.find((tab) => tab.key === activeKey) || TABS[0];
  const content = debug.debugData?.[active.field] || '';

  const timestamp =
    activeKey === 'preview'
      ? debug.debugData?.previewTimestamp
      : debug.debugData?.timestamp;

  return (
    <div className='h-full flex flex-col bg-white'>
      <div className='flex items-center justify-between px-3 h-10 border-b border-gray-200 flex-shrink-0'>
        <div className='flex items-center gap-1'>
          {TABS.map(({ key, icon: Icon, label }) => {
            const isActive = key === activeKey;
            return (
              <button
                key={key}
                onClick={() => debug.setActiveTab(key)}
                className={[
                  'inline-flex items-center gap-1 h-7 px-2.5 rounded text-[12px] transition-colors',
                  isActive
                    ? 'bg-gray-900 text-white font-medium'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')}
              >
                <Icon size={12} />
                {t(label)}
              </button>
            );
          })}
        </div>
        <div className='flex items-center gap-1'>
          {content && (
            <Tooltip content={t('复制')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<Copy size={13} />}
                onClick={() => copyText(content)}
              />
            </Tooltip>
          )}
          {onClose && (
            <Tooltip content={t('关闭调试面板')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<X size={14} />}
                onClick={onClose}
              />
            </Tooltip>
          )}
        </div>
      </div>

      <div className='flex-1 overflow-auto'>
        {content ? (
          <pre className='m-0 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all text-gray-800 font-mono'>
            {content}
          </pre>
        ) : (
          <div className='h-full flex flex-col items-center justify-center p-6 text-center'>
            <FileCode2 size={28} className='text-gray-300 mb-2' />
            <div className='text-[13px] text-gray-500'>
              {activeKey === 'preview' && t('输入提示词后会实时生成请求体预览')}
              {activeKey === 'request' && t('点击「生成」后，真实发送的请求体会显示在这里')}
              {activeKey === 'response' && t('生成完成后，上游响应会显示在这里')}
            </div>
          </div>
        )}
      </div>

      {timestamp && (
        <div className='px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400 flex-shrink-0'>
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default CreationDebugPanel;
