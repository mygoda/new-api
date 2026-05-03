/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Image, Video, FolderOpen } from 'lucide-react';

import ImageTab from './ImageTab';
import VideoTab from './VideoTab';
import GalleryTab from './GalleryTab';
import { useTokenGuard } from '../../components/creation/TokenGuard';
import TokenSelector from '../../components/creation/TokenSelector';

const TABS = [
  { key: 'image', icon: Image, label: '图像' },
  { key: 'video', icon: Video, label: '视频' },
  { key: 'gallery', icon: FolderOpen, label: '作品库' },
];

const Creation = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tab } = useParams();
  const [active, setActive] = useState(tab || 'image');
  const { active: token, openGuard, Guard } = useTokenGuard();

  useEffect(() => {
    if (tab && tab !== active) setActive(tab);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (key) => {
    setActive(key);
    navigate(`/creation/${key}`, { replace: true });
  };

  return (
    <div className='h-full bg-[#fafafa]'>
      {Guard}
      <Layout className='h-full bg-transparent flex flex-col'>
        {/* 顶部导航：左 Logo + Tab，右 Token */}
        <div className='mt-[60px] h-12 px-5 flex items-center justify-between border-b border-gray-200/70 bg-white'>
          {/* 左：品牌 + Tab */}
          <div className='flex items-center gap-1'>
            {TABS.map(({ key, icon: Icon, label }) => {
              const isActive = active === key;
              return (
                <button
                  key={key}
                  onClick={() => handleChange(key)}
                  className={[
                    'h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[13px] transition-all',
                    isActive
                      ? 'bg-gray-900 text-white shadow-sm font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                  ].join(' ')}
                >
                  <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                  {t(label)}
                </button>
              );
            })}
          </div>

          {/* 右：Token */}
          <TokenSelector token={token} onClick={openGuard} />
        </div>

        {/* 内容区 */}
        <div className='flex-1 overflow-hidden'>
          {active === 'image' && <ImageTab />}
          {active === 'video' && <VideoTab />}
          {active === 'gallery' && <GalleryTab />}
        </div>
      </Layout>
    </div>
  );
};

export default Creation;
