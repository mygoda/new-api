/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout, Tabs, TabPane, Typography, Button, Tag, Space } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { Image, Video, FolderOpen, KeyRound, Sparkles } from 'lucide-react';

import ImageTab from './ImageTab';
import VideoTab from './VideoTab';
import GalleryTab from './GalleryTab';
import { useTokenGuard } from '../../components/creation/TokenGuard';

const { Title, Text } = Typography;

const TABS = [
  { key: 'image', icon: Image, label: '图像生成', desc: 'AI 图像创作' },
  { key: 'video', icon: Video, label: '视频生成', desc: 'AI 视频创作' },
  { key: 'gallery', icon: FolderOpen, label: '作品库', desc: '我的作品' },
];

const Creation = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tab } = useParams();
  const [active, setActive] = useState(tab || 'image');
  const { active: token, openGuard, Guard } = useTokenGuard();

  // 首次进入若未选 Token 自动弹出
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

  const currentTab = TABS.find((t) => t.key === active);

  return (
    <div className='h-full bg-gradient-to-br from-gray-50 via-white to-blue-50/30'>
      {Guard}
      <Layout className='h-full bg-transparent flex flex-col'>
        {/* 顶部导航栏 - 优化设计 */}
        <div className='mt-[60px] px-6 pt-5 pb-4 bg-white/80 backdrop-blur-sm border-b border-gray-200/60 shadow-sm'>
          <div className='flex items-center justify-between mb-4'>
            <Space align='center' spacing={12}>
              <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20'>
                <Sparkles size={20} className='text-white' strokeWidth={2.5} />
              </div>
              <div>
                <Title heading={4} className='!mb-0 !text-gray-900'>
                  {t('创作中心')}
                </Title>
                <Text size='small' type='tertiary' className='!text-gray-500'>
                  {currentTab?.desc || 'AI 创作工具'}
                </Text>
              </div>
            </Space>

            <Button
              size='default'
              theme={token?.key ? 'light' : 'solid'}
              type={token?.key ? 'tertiary' : 'warning'}
              icon={<KeyRound size={15} />}
              onClick={openGuard}
              className='shadow-sm'
            >
              {token?.key ? token.name : t('未选择 Token')}
            </Button>
          </div>

          {/* Tab 导航 - 卡片式设计 */}
          <div className='flex gap-2'>
            {TABS.map(({ key, icon: Icon, label }) => {
              const isActive = active === key;
              return (
                <button
                  key={key}
                  onClick={() => handleChange(key)}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200
                    ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                        : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900'
                    }
                  `}
                >
                  <Icon size={16} strokeWidth={2.5} />
                  <span className='font-medium text-sm'>{t(label)}</span>
                </button>
              );
            })}
          </div>
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
