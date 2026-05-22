import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

/**
 * Auto-collects h2/h3 headings inside `containerRef` and shows them as a
 * scrollspy outline. Headings must have a stable `id` (set by the page).
 */
const DocsOutline = ({ containerRef }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    if (!containerRef?.current) return undefined;

    const collect = () => {
      const heads = containerRef.current?.querySelectorAll('h2[id], h3[id]') || [];
      const list = [];
      heads.forEach((h) => {
        list.push({ id: h.id, level: h.tagName === 'H2' ? 2 : 3, text: h.textContent || '' });
      });
      setItems(list);
    };

    collect();
    // Re-collect when child DOM changes (e.g. async content load).
    const mo = new MutationObserver(collect);
    mo.observe(containerRef.current, { childList: true, subtree: true });

    return () => mo.disconnect();
  }, [containerRef, pathname]);

  useEffect(() => {
    if (!containerRef?.current || items.length === 0) return undefined;
    const heads = items
      .map((i) => containerRef.current.querySelector(`#${CSS.escape(i.id)}`))
      .filter(Boolean);

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.target.offsetTop - b.target.offsetTop);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );
    heads.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [items, containerRef]);

  if (items.length === 0) return null;

  return (
    <nav>
      <div className='docs-outline-title'>{t('页面导航')}</div>
      <ul className='docs-outline-list'>
        {items.map((item) => (
          <li key={item.id} className={`lvl-${item.level}`}>
            <a
              href={`#${item.id}`}
              className={activeId === item.id ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(item.id)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.replaceState(null, '', `#${item.id}`);
              }}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default DocsOutline;
