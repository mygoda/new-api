import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/**
 * BottomCTASection — 二次转化。
 */
export default function BottomCTASection({ isLoggedIn }) {
  const { t } = useTranslation();
  return (
    <section className='relative overflow-hidden py-24'>
      <div className='blur-ball blur-ball-pink' />
      <div className='max-w-3xl mx-auto px-6 text-center relative z-10'>
        <h2 className='text-3xl md:text-4xl lg:text-5xl font-bold'>
          {t('现在开始,')}
          <span className='shine-text'>{t('免费体验')}</span>
        </h2>
        <p className='mt-4 text-base md:text-lg text-slate-600'>
          {t('注册即送体验额度,无需绑卡')}
        </p>
        <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
          <Link
            to={isLoggedIn ? '/console' : '/register'}
            className='px-8 py-3 bg-slate-900 text-white rounded-full font-medium text-base hover:bg-slate-800 transition'
          >
            {isLoggedIn ? t('进入控制台 →') : t('开始免费使用 →')}
          </Link>
          <Link
            to='/contact-sales'
            className='px-8 py-3 bg-white border border-slate-200 rounded-full font-medium text-base hover:bg-slate-50 transition text-slate-700'
          >
            {t('联系商务')}
          </Link>
        </div>
      </div>
    </section>
  );
}
