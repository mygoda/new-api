/*
Copyright (C) 2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later

创作中心专用的调试面板：
- tab：预览 / 已发送 / 响应
- 顶部展示 URL（来自 req.url，含 origin 拼接）
- 预览/已发送 tab 内可切换 cURL / Python / JS / Go / Java 代码视图
- 每块内容独立复制，空状态有提示
*/

import React, { useMemo, useState } from 'react';
import { Button, Tooltip } from '@douyinfe/semi-ui';
import {
  X,
  Copy,
  FileCode2,
  Send,
  ArrowDownToLine,
  Globe,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { copyText } from '../../utils/creation/clipboard';
import { CODE_LANGS } from '../../services/creation/codeSnippets';

const TABS = [
  { key: 'preview', icon: FileCode2, label: '预览' },
  { key: 'request', icon: Send, label: '已发送' },
  { key: 'response', icon: ArrowDownToLine, label: '响应' },
];

const VIEW_BODY = 'body';
const VIEW_LANGS = CODE_LANGS.map((c) => c.key); // curl/python/javascript/go/java

const fullUrl = (req) => {
  if (!req?.url) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return origin + req.url;
};

const CreationDebugPanel = ({ debug, onClose }) => {
  const { t } = useTranslation();
  const activeKey = debug.activeTab || 'preview';
  const data = debug.debugData || {};

  const [view, setView] = useState(VIEW_BODY); // body | curl | python | javascript | go | java

  // 当前 tab 对应的请求对象
  const reqObj =
    activeKey === 'preview' ? data.previewReq :
    activeKey === 'request' ? data.requestReq :
    null;

  const url = fullUrl(reqObj);

  // 当前要显示的内容文本
  const content = useMemo(() => {
    if (activeKey === 'response') return data.response || '';
    if (!reqObj) return '';
    if (view === VIEW_BODY) {
      return JSON.stringify(reqObj.body || {}, null, 2);
    }
    const lang = CODE_LANGS.find((c) => c.key === view);
    return lang ? lang.build(reqObj) : '';
  }, [activeKey, view, reqObj, data.response]);

  const timestamp =
    activeKey === 'preview' ? data.previewTimestamp : data.timestamp;

  const showLangSwitcher = activeKey !== 'response' && !!reqObj;

  return (
    <div className='h-full flex flex-col bg-white'>
      {/* tab 切换 + 关闭 */}
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

      {/* URL + Method */}
      {url && (
        <div className='px-3 py-2 border-b border-gray-100 flex-shrink-0 flex items-center gap-2'>
          <Globe size={12} className='text-gray-400 flex-shrink-0' />
          <span className='inline-flex items-center px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded'>
            {reqObj?.method || 'POST'}
          </span>
          <span className='text-[11px] text-gray-700 font-mono break-all flex-1'>
            {url}
          </span>
          <Tooltip content={t('复制 URL')}>
            <Button
              size='small'
              theme='borderless'
              type='tertiary'
              icon={<Copy size={11} />}
              onClick={() => copyText(url)}
            />
          </Tooltip>
        </div>
      )}

      {/* 视图切换：JSON Body 与各语言代码片段 */}
      {showLangSwitcher && (
        <div className='px-3 pt-2 pb-1 border-b border-gray-100 flex-shrink-0 flex items-center gap-1 overflow-x-auto'>
          <button
            onClick={() => setView(VIEW_BODY)}
            className={[
              'h-6 px-2 rounded text-[11px] flex-shrink-0',
              view === VIEW_BODY
                ? 'bg-gray-900 text-white font-medium'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
            ].join(' ')}
          >
            {t('请求体')}
          </button>
          <span className='w-px h-4 bg-gray-200 mx-1' />
          {CODE_LANGS.map((c) => (
            <button
              key={c.key}
              onClick={() => setView(c.key)}
              className={[
                'h-6 px-2 rounded text-[11px] flex-shrink-0',
                view === c.key
                  ? 'bg-gray-900 text-white font-medium'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
              ].join(' ')}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* 内容主体 */}
      <div className='flex-1 overflow-auto'>
        {content ? (
          <pre className='m-0 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all text-gray-800 font-mono'>
            {content}
          </pre>
        ) : (
          <div className='h-full flex flex-col items-center justify-center p-6 text-center'>
            <FileCode2 size={28} className='text-gray-300 mb-2' />
            <div className='text-[13px] text-gray-500'>
              {activeKey === 'preview' && t('选好模型并输入提示词后，请求体会实时预览')}
              {activeKey === 'request' && t('点击「生成」后，真实发送的请求会显示在这里')}
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
