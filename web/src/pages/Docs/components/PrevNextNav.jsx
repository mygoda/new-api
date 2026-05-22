import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { findAdjacent } from '../meta/nav';
import { useTranslation } from 'react-i18next';

const PrevNextNav = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { prev, next } = findAdjacent(pathname);

  if (!prev && !next) return null;

  return (
    <div className='docs-prev-next'>
      <div className='prev'>
        {prev && (
          <Link to={prev.path}>
            <div className='dir'>{t('上一页')}</div>
            <div className='label'>← {prev.label}</div>
          </Link>
        )}
      </div>
      <div className='next'>
        {next && (
          <Link to={next.path}>
            <div className='dir'>{t('下一页')}</div>
            <div className='label'>{next.label} →</div>
          </Link>
        )}
      </div>
    </div>
  );
};

export default PrevNextNav;
