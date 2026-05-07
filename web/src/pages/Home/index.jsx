/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useContext, useEffect, useState } from 'react';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';

import { API, showError, copy, showSuccess } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { StatusContext } from '../../context/Status';
import { UserContext } from '../../context/User';
import { useActualTheme } from '../../context/Theme';
import NoticeModal from '../../components/layout/NoticeModal';

import HeroSection from './sections/HeroSection';
import CapabilitiesSection from './sections/CapabilitiesSection';
import PricingDealsSection from './sections/PricingDealsSection';
import CreationPromoSection from './sections/CreationPromoSection';
import QuickStartSection from './sections/QuickStartSection';
import TestimonialsSection from './sections/TestimonialsSection';
import FAQSection from './sections/FAQSection';
import BottomCTASection from './sections/BottomCTASection';
import HomeFooter from './sections/HomeFooter';

/**
 * Home —— 面向 C 端的首页。
 *
 * 数据流:
 *   1. /api/home_page_content   — admin 配的自定义内容(HTML / iframe URL),如有则覆盖默认页面
 *   2. /api/home/dashboard      — 默认页面所需的聚合数据(stats / featured_models / 后台可配的证言/FAQ/Footer)
 *
 * 页面顺序: Hero → Capabilities → CreationPromo → QuickStart → Testimonials → FAQ → BottomCTA → Footer。
 */
const Home = () => {
  const { t, i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const [userState] = useContext(UserContext);
  const actualTheme = useActualTheme();
  const isMobile = useIsMobile();

  const [overrideContent, setOverrideContent] = useState('');
  const [overrideLoaded, setOverrideLoaded] = useState(false);

  const [dashboard, setDashboard] = useState(null);
  const [noticeVisible, setNoticeVisible] = useState(false);

  const isLoggedIn = !!userState?.user?.id;
  const serverAddress = statusState?.status?.server_address || `${window.location.origin}`;

  const handleCopyBaseURL = async () => {
    const ok = await copy(serverAddress);
    if (ok) showSuccess(t('已复制到剪切板'));
  };

  // 1) 拉取 admin 自定义首页内容(若有则后续完全覆盖默认页面)
  useEffect(() => {
    (async () => {
      try {
        const res = await API.get('/api/home_page_content');
        const { success, data } = res.data;
        if (success && data) {
          if (data.startsWith('https://')) {
            setOverrideContent(data);
          } else {
            setOverrideContent(marked.parse(data));
          }
        }
      } catch {
        // ignore — 继续用默认页
      } finally {
        setOverrideLoaded(true);
      }
    })();
  }, []);

  // 2) 仅在没有 override 内容时,拉取 dashboard
  useEffect(() => {
    if (!overrideLoaded || overrideContent) return;
    (async () => {
      try {
        const res = await API.get('/api/home/dashboard');
        if (res.data?.success) {
          setDashboard(res.data.data);
        }
      } catch (e) {
        // 不阻塞渲染,首页骨架仍能展示静态 section
      }
    })();
  }, [overrideLoaded, overrideContent]);

  // 公告
  useEffect(() => {
    (async () => {
      const lastCloseDate = localStorage.getItem('notice_close_date');
      const today = new Date().toDateString();
      if (lastCloseDate === today) return;
      try {
        const res = await API.get('/api/notice');
        if (res.data?.success && res.data?.data?.trim()) setNoticeVisible(true);
      } catch {
        // ignore
      }
    })();
  }, []);

  // iframe 模式:同步主题与语言
  useEffect(() => {
    if (overrideContent && overrideContent.startsWith('https://')) {
      const iframe = document.querySelector('iframe');
      if (iframe) {
        iframe.onload = () => {
          iframe.contentWindow.postMessage({ themeMode: actualTheme }, '*');
          iframe.contentWindow.postMessage({ lang: i18n.language }, '*');
        };
      }
    }
  }, [overrideContent, actualTheme, i18n.language]);

  // 自定义内容覆盖路径(保留原行为)
  if (overrideLoaded && overrideContent) {
    return (
      <div className='w-full overflow-x-hidden'>
        <NoticeModal visible={noticeVisible} onClose={() => setNoticeVisible(false)} isMobile={isMobile} />
        {overrideContent.startsWith('https://') ? (
          <iframe src={overrideContent} className='w-full h-screen border-none' />
        ) : (
          <div className='mt-[60px]' dangerouslySetInnerHTML={{ __html: overrideContent }} />
        )}
      </div>
    );
  }

  return (
    <div className='w-full overflow-x-hidden bg-[var(--semi-color-bg-0,#fafafa)]'>
      <NoticeModal visible={noticeVisible} onClose={() => setNoticeVisible(false)} isMobile={isMobile} />

      <HeroSection
        stats={dashboard?.stats}
        serverAddress={serverAddress}
        onCopyBaseURL={handleCopyBaseURL}
        isLoggedIn={isLoggedIn}
      />

      <CapabilitiesSection featured={dashboard?.featured_models} />

      <PricingDealsSection items={dashboard?.pricing_deals} />

      <CreationPromoSection />

      <QuickStartSection serverAddress={serverAddress} />

      <TestimonialsSection items={dashboard?.testimonials} />

      <FAQSection items={dashboard?.faq} />

      <BottomCTASection isLoggedIn={isLoggedIn} />

      <HomeFooter data={dashboard?.footer} />
    </div>
  );
};

export default Home;
