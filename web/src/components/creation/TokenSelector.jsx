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
          className='inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors'
        >
          <AlertTriangle size={13} className='text-orange-600' />
          <Text className='!text-[12px] !text-orange-700 font-medium'>
            {t('请选择令牌')}
          </Text>
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={t('点击切换或重新选择 API 令牌')}>
      <button
        onClick={onClick}
        className='inline-flex items-center gap-2 h-8 px-2.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 transition-colors group'
      >
        <Key size={11} className='text-gray-600' strokeWidth={2.2} />
        <div className='flex items-center gap-1.5'>
          <Text className='!text-[10px] !text-gray-600 uppercase tracking-wider font-medium'>
            {t('令牌')}
          </Text>
          <Text className='!text-[12px] !text-gray-900 font-medium max-w-[120px] truncate'>
            {token.name}
          </Text>
          <Text type='tertiary' className='!text-[10px] !font-mono !text-gray-500 hidden sm:inline'>
            {maskedKey}
          </Text>
        </div>
        <ChevronDown size={11} className='text-gray-500 group-hover:translate-y-0.5 transition-transform' />
      </button>
    </Tooltip>
  );
};

export default TokenSelector;
