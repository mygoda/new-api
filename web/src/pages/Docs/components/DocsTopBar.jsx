import React, { useContext, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../../context/Status';
import { getSystemName, getLogo } from '../../../helpers/utils';
import { topNav } from '../meta/nav';

const Dropdown = ({ item, pathname }) => {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type='button'
        className={item.match?.(pathname) ? 'active' : ''}
        onClick={() => setOpen((o) => !o)}
      >
        {item.label} <span style={{ fontSize: 10, marginLeft: 2 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            minWidth: 180,
            background: 'var(--docs-bg)',
            border: '1px solid var(--docs-border)',
            borderRadius: 8,
            padding: 6,
            zIndex: 40,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          }}
        >
          {item.children.map((c) => (
            <Link
              key={c.path}
              to={c.path}
              style={{
                display: 'block',
                padding: '6px 12px',
                fontSize: 13,
                color: 'var(--docs-text-1)',
                textDecoration: 'none',
                borderRadius: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--docs-bg-soft)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              onClick={() => setOpen(false)}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const DocsTopBar = ({ onMobileMenu }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [statusState] = useContext(StatusContext);
  const systemName = statusState?.status?.system_name || getSystemName() || 'New API';
  const logo = statusState?.status?.logo || getLogo();
  const [search, setSearch] = useState('');

  const handleSearch = (e) => {
    if (e.key === 'Enter' && search.trim()) {
      // Lightweight in-page nav by keyword match on labels.
      const keyword = search.trim().toLowerCase();
      for (const item of topNav.flatMap((i) => (i.children ? i.children : [i]))) {
        if (item.label.toLowerCase().includes(keyword)) {
          navigate(item.path);
          setSearch('');
          return;
        }
      }
    }
  };

  return (
    <div className='docs-topbar'>
      <div className='docs-topbar-inner'>
        <Link to='/docs' className='docs-topbar-title'>
          {logo && <img src={logo} alt={systemName} />}
          <span>{systemName} {t('API 文档')}</span>
        </Link>
        <nav className='docs-topbar-menu'>
          {topNav.map((item) =>
            item.children ? (
              <Dropdown key={item.label} item={item} pathname={pathname} />
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={item.match?.(pathname) ? 'active' : ''}
              >
                {t(item.label)}
              </Link>
            ),
          )}
        </nav>
        <div className='docs-topbar-spacer' />
        <div className='docs-topbar-search' onClick={() => document.getElementById('docs-search-input')?.focus()}>
          <input
            id='docs-search-input'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearch}
            placeholder={t('搜索文档')}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'inherit',
              fontSize: 13,
            }}
          />
          <kbd>↵</kbd>
        </div>
        <button
          type='button'
          onClick={onMobileMenu}
          aria-label='menu'
          style={{
            display: 'none',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            fontSize: 20,
            marginLeft: 8,
          }}
          className='docs-topbar-mobile-btn'
        >
          ☰
        </button>
      </div>
    </div>
  );
};

export default DocsTopBar;
