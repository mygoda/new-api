import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { navGroups } from '../meta/nav';

const COLLAPSE_KEY = 'docs-sidebar-collapsed-groups';

const loadCollapsed = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]'));
  } catch {
    return new Set();
  }
};

const DocsSidebar = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
  }, [collapsed]);

  const toggle = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <aside>
      {navGroups.map((group) => {
        const visible = group.items.filter((i) => !i.hideInSidebar);
        if (visible.length === 0) return null;
        const isCollapsed = collapsed.has(group.key);
        return (
          <div
            key={group.key}
            className={`docs-sidebar-group ${isCollapsed ? 'collapsed' : ''}`}
          >
            <div
              className='docs-sidebar-group-title'
              onClick={() => toggle(group.key)}
            >
              <span>{t(group.title)}</span>
              <span className='chev'>▾</span>
            </div>
            {!isCollapsed && (
              <div className='docs-sidebar-items'>
                {visible.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onNavigate}
                    className={`docs-sidebar-link ${pathname === item.path ? 'active' : ''}`}
                  >
                    {t(item.label)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
};

export default DocsSidebar;
