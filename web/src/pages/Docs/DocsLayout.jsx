import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DocsTopBar from './components/DocsTopBar';
import DocsSidebar from './components/DocsSidebar';
import DocsOutline from './components/DocsOutline';
import DocsFooter from './components/DocsFooter';
import PrevNextNav from './components/PrevNextNav';
import './styles.css';

const DocsLayout = ({ children, hideOutline = false, hidePrevNext = false }) => {
  const contentRef = useRef(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const isHome = pathname === '/docs' || pathname === '/docs/';

  useEffect(() => {
    setDrawerOpen(false);
    // Reset scroll on route change.
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return (
    <div className='docs-root'>
      <DocsTopBar onMobileMenu={() => setDrawerOpen(true)} />

      {isHome ? (
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
          <div ref={contentRef}>{children}</div>
          <DocsFooter />
        </div>
      ) : (
        <div className='docs-shell'>
          <div className='docs-sidebar-wrap'>
            <DocsSidebar />
          </div>
          <main className='docs-content docs-body' ref={contentRef}>
            {children}
            {!hidePrevNext && <PrevNextNav />}
          </main>
          {!hideOutline && (
            <div className='docs-outline-wrap'>
              <DocsOutline containerRef={contentRef} />
            </div>
          )}
        </div>
      )}

      {!isHome && <DocsFooter />}

      {/* Mobile sidebar drawer */}
      <button
        type='button'
        className='docs-mobile-toggle'
        onClick={() => setDrawerOpen(true)}
        aria-label='open sidebar'
      >
        ☰
      </button>
      <div
        className={`docs-mobile-drawer ${drawerOpen ? 'open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDrawerOpen(false);
        }}
      >
        <div className='docs-mobile-drawer-inner'>
          <DocsSidebar onNavigate={() => setDrawerOpen(false)} />
        </div>
      </div>
    </div>
  );
};

export default DocsLayout;
