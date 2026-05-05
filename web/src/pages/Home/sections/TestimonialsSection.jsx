import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * TestimonialsSection — 用户证言。数据来自 dashboard.testimonials,后台 option 可配。
 */
export default function TestimonialsSection({ items = [] }) {
  const { t } = useTranslation();
  if (!items || items.length === 0) return null;

  return (
    <section className='py-20 bg-white border-y border-slate-100'>
      <div className='max-w-6xl mx-auto px-6'>
        <div className='text-center mb-12'>
          <div className='text-xs uppercase tracking-widest text-slate-400 mb-2'>
            {t('TESTIMONIALS')}
          </div>
          <h2 className='text-3xl md:text-4xl font-bold'>{t('他们都在用')}</h2>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          {items.map((it, i) => (
            <div
              key={i}
              className='rounded-2xl border border-slate-200 p-6 hover-card bg-white'
            >
              <p className='text-slate-700 leading-relaxed'>"{it.quote}"</p>
              <div className='flex items-center gap-3 mt-5 pt-5 border-t border-slate-100'>
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                    it.avatar || 'from-slate-400 to-slate-600'
                  }`}
                />
                <div>
                  <div className='font-medium text-sm'>{it.name}</div>
                  <div className='text-xs text-slate-500'>{it.title}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
