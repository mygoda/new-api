/*
Copyright (C) 2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React from 'react';
import { Modal, Typography } from '@douyinfe/semi-ui';

const { Text, Paragraph } = Typography;

// 提取尽量多的上下文，方便用户/开发同学排查
function extractDetails(error) {
  const resp = error?.response;
  const data = resp?.data;
  const headers = resp?.headers || {};

  const status = resp?.status;
  const statusText = resp?.statusText;
  const requestId =
    headers['x-request-id'] ||
    headers['request-id'] ||
    data?.error?.request_id ||
    data?.request_id ||
    '';

  const errObj = data?.error || data || {};
  const message =
    errObj?.message ||
    data?.message ||
    error?.message ||
    'request failed';
  const type = errObj?.type || data?.type || '';
  const code = errObj?.code || data?.code || '';
  const param = errObj?.param || '';

  return {
    status,
    statusText,
    requestId,
    message,
    type,
    code,
    param,
    rawBody: data,
  };
}

export function showErrorModal(error, { title = '请求失败' } = {}) {
  const d = extractDetails(error);
  const bodyText = (() => {
    try {
      return typeof d.rawBody === 'string'
        ? d.rawBody
        : JSON.stringify(d.rawBody, null, 2);
    } catch {
      return String(d.rawBody);
    }
  })();

  Modal.error({
    title,
    width: 640,
    okText: '关闭',
    content: (
      <div className='space-y-2 text-[13px]'>
        <div>
          <Text type='tertiary' className='!text-xs'>
            HTTP:
          </Text>{' '}
          <Text strong>
            {d.status ?? '-'} {d.statusText ?? ''}
          </Text>
          {d.requestId && (
            <>
              {'  '}
              <Text type='tertiary' className='!text-xs'>
                request_id:
              </Text>{' '}
              <Text code copyable={{ content: d.requestId }}>
                {d.requestId}
              </Text>
            </>
          )}
        </div>
        {(d.type || d.code || d.param) && (
          <div className='text-xs text-gray-500'>
            {d.type && <span>type=<Text code>{d.type}</Text> </span>}
            {d.code && <span>code=<Text code>{String(d.code)}</Text> </span>}
            {d.param && <span>param=<Text code>{d.param}</Text></span>}
          </div>
        )}
        <Paragraph
          copyable={{ content: d.message }}
          className='!mb-0 !text-[13px] !text-red-600 break-words'
        >
          {d.message}
        </Paragraph>
        {d.rawBody !== undefined && d.rawBody !== null && (
          <details className='mt-2'>
            <summary className='text-xs text-gray-500 cursor-pointer select-none'>
              展开完整响应
            </summary>
            <pre className='mt-1 p-2 max-h-[260px] overflow-auto bg-gray-50 border border-gray-200 rounded text-[11px] leading-relaxed whitespace-pre-wrap break-all'>
              {bodyText}
            </pre>
          </details>
        )}
      </div>
    ),
  });
  return d;
}
