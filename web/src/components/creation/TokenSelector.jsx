/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React from 'react';
import { Typography, Tag, Tooltip } from '@douyinfe/semi-ui';
import { Key, ChevronDown, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

/**
 * 顶部 Token 选择器
 *
 * 设计目标：让用户一眼看出"这是 API 令牌选择器"，而不是普通按钮
 * - 使用钥匙图标 + "API 令牌" 字样标签
 * - 显示当前令牌名 + 部分 Key（脱敏）
 * - 未选择时使用警示色提示
 */
const TokenSelector = ({ token, onClick }) => {
  const { t } = useTranslation();
  const hasToken = !!token?.key;

  const maskedKey = hasToken
    ? `${token.key.slice(0, 6)}…${token.key.slice(-4)}`
    : '';

  if (!hasToken) {
    return (
      <Tooltip content={t('点击选择或创建一个 API 令牌')}>
        <button
          onClick={onClick}
          className='flex items-center gap-2 px-3 py-1.5 rounded-md border border-orange-300 bg-orange-50 hover:bg-orange-100 transition-colors group'
        >
          <AlertTriangle size={14} className='text-orange-600' />
          <Text className='!text-xs !text-orange-700 font-medium'>
            {t('请选择 API 令牌')}
          </Text>
          <ChevronDown
            size={12}
            className='text-orange-500 group-hover:translate-y-0.5 transition-transform'
          />
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={t('点击切换或重新选择 API 令牌')}>
      <button
        onClick={onClick}
        className='flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-colors group'
      >
        <div className='flex items-center justify-center w-5 h-5 rounded bg-gray-100 group-hover:bg-gray-200 transition-colors'>
          <Key size={11} className='text-gray-600' />
        </div>
        <div className='flex items-center gap-1.5'>
          <Text className='!text-[11px] !text-gray-500 uppercase tracking-wider font-medium'>
            {t('令牌')}
          </Text>
          <span className='w-px h-3 bg-gray-200' />
          <Text className='!text-xs !text-gray-800 font-medium max-w-[120px] truncate'>
            {token.name}
          </Text>
          <Text
            type='tertiary'
            className='!text-[10px] !font-mono !text-gray-400'
          >
            {maskedKey}
          </Text>
        </div>
        <ChevronDown
          size={12}
          className='text-gray-400 group-hover:translate-y-0.5 transition-transform'
        />
      </button>
    </Tooltip>
  );
};

export default TokenSelector;
