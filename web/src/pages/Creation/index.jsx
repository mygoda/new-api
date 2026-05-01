/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout, Tabs, TabPane, Typography, Tag } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Image, Video, FolderOpen } from 'lucide-react';

import ImageTab from './ImageTab';
import VideoTab from './VideoTab';
import GalleryTab from './GalleryTab';
import { useTokenGuard } from '../../components/creation/TokenGuard';
import TokenSelector from '../../components/creation/TokenSelector';

const { Title } = Typography;

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
    if (!token?.key) {
      openGuard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab && tab !== active) setActive(tab);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (key) => {
    setActive(key);
    navigate(`/console/creation/${key}`, { replace: true });
  };

  return (
    <div className='h-full'>
      {Guard}
      <Layout className='h-full bg-transparent flex flex-col'>
        {/* 顶部导航栏 - 与 Playground 风格统一 */}
        <div className='mt-[60px] px-4 pt-3 pb-2 flex items-center justify-between border-b border-gray-100 bg-white'>
          <div className='flex items-center gap-4'>
            <Title heading={5} className='!mb-0'>
              {t('创作中心')}
            </Title>
            <Tabs
              type='button'
              size='small'
              activeKey={active}
              onChange={handleChange}
              collapsible
            >
              {TABS.map(({ key, icon: Icon, label }) => (
                <TabPane
                  key={key}
                  itemKey={key}
                  tab={
                    <span className='flex items-center gap-1.5'>
                      <Icon size={14} />
                      {t(label)}
                    </span>
                  }
                />
              ))}
            </Tabs>
          </div>

          <TokenSelector token={token} onClick={openGuard} />
        </div>

        {/* 内容区域 */}
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
