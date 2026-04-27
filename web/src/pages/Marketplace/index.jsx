/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Spin, Empty } from '@douyinfe/semi-ui';
import { API, showError } from '../../helpers';
import ModelCard from './components/ModelCard';
import SearchBar from './components/SearchBar';

const Marketplace = () => {
  const { t } = useTranslation();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [selectedCapabilities, setSelectedCapabilities] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await API.get('/api/marketplace/models');
        const { success, message, data } = res.data;
        if (success) {
          setModels(data || []);
        } else {
          showError(message);
        }
      } catch (err) {
        showError(err.message || t('加载失败'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [t]);

  const filteredAndSorted = useMemo(() => {
    const kw = searchValue.trim().toLowerCase();
    let list = models.filter((m) => {
      if (kw) {
        const hit =
          (m.model_name || '').toLowerCase().includes(kw) ||
          (m.description || '').toLowerCase().includes(kw) ||
          (m.tags || '').toLowerCase().includes(kw);
        if (!hit) return false;
      }
      if (selectedCapabilities.length > 0) {
        const caps = m.capabilities || [];
        const allHit = selectedCapabilities.every((c) => caps.includes(c));
        if (!allHit) return false;
      }
      return true;
    });

    const parseContext = (s) => {
      if (!s) return 0;
      const t = String(s).toUpperCase().trim();
      const m = t.match(/^([\d.]+)\s*([KM]?)$/);
      if (!m) return Number(t) || 0;
      const num = parseFloat(m[1]);
      if (m[2] === 'M') return num * 1_000_000;
      if (m[2] === 'K') return num * 1_000;
      return num;
    };

    if (sortKey === 'name') {
      list.sort((a, b) =>
        (a.model_name || '').localeCompare(b.model_name || ''),
      );
    } else if (sortKey === 'context_desc') {
      list.sort(
        (a, b) => parseContext(b.context_length) - parseContext(a.context_length),
      );
    } else if (sortKey === 'price_asc') {
      list.sort((a, b) => (a.input_price || 0) - (b.input_price || 0));
    } else if (sortKey === 'price_desc') {
      list.sort((a, b) => (b.input_price || 0) - (a.input_price || 0));
    }
    return list;
  }, [models, searchValue, sortKey, selectedCapabilities]);

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-zinc-900'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6'>
        <div className='mb-6'>
          <h1 className='text-2xl font-semibold mb-1'>{t('模型广场（新）')}</h1>
          <p className='text-sm text-gray-500'>
            {t(
              '以模型为主体的现代化广场，展示能力、上下文、定价等关键信息（仅管理员可见）',
            )}
          </p>
        </div>

        <div className='mb-6'>
          <SearchBar
            searchValue={searchValue}
            setSearchValue={setSearchValue}
            sortKey={sortKey}
            setSortKey={setSortKey}
            selectedCapabilities={selectedCapabilities}
            setSelectedCapabilities={setSelectedCapabilities}
            totalCount={filteredAndSorted.length}
            t={t}
          />
        </div>

        {loading ? (
          <div className='flex justify-center py-20'>
            <Spin size='large' />
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <Empty title={t('未找到匹配的模型')} style={{ padding: 60 }} />
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
            {filteredAndSorted.map((m) => (
              <ModelCard key={m.model_name} model={m} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Marketplace;
