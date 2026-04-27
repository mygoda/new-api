/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { Input, Select, CheckboxGroup, Checkbox } from '@douyinfe/semi-ui';
import { Search } from 'lucide-react';
import { CAPABILITY_META } from './CapabilityIcons';

const SearchBar = ({
  searchValue,
  setSearchValue,
  sortKey,
  setSortKey,
  selectedCapabilities,
  setSelectedCapabilities,
  totalCount,
  t,
}) => {
  return (
    <div className='flex flex-col gap-3 w-full'>
      <div className='flex items-center gap-3 flex-wrap'>
        <Input
          prefix={<Search size={16} />}
          value={searchValue}
          onChange={setSearchValue}
          placeholder={t('搜索模型名 / 描述')}
          showClear
          style={{ width: 320 }}
        />
        <Select
          value={sortKey}
          onChange={setSortKey}
          style={{ width: 200 }}
          optionList={[
            { value: 'name', label: t('按名称排序') },
            { value: 'context_desc', label: t('上下文（高 → 低）') },
            { value: 'price_asc', label: t('输入价格（低 → 高）') },
            { value: 'price_desc', label: t('输入价格（高 → 低）') },
          ]}
        />
        <span className='text-sm text-gray-400 ml-auto'>
          {t('共')} {totalCount} {t('个模型')}
        </span>
      </div>
      <div className='flex items-center gap-2 flex-wrap'>
        <span className='text-sm text-gray-500'>{t('能力筛选')}：</span>
        <CheckboxGroup
          direction='horizontal'
          value={selectedCapabilities}
          onChange={setSelectedCapabilities}
        >
          {Object.entries(CAPABILITY_META).map(([key, meta]) => (
            <Checkbox key={key} value={key}>
              {t(meta.label)}
            </Checkbox>
          ))}
        </CheckboxGroup>
      </div>
    </div>
  );
};

export default SearchBar;
