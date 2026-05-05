import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * FAQSection — 常见问题折叠列表。数据来自 dashboard.faq,后台 option 可配。
 */
export default function FAQSection({ items = [] }) {
  const { t } = useTranslation();
  if (!items || items.length === 0) return null;

  return (
    <section className='py-20'>
      <div className='max-w-3xl mx-auto px-6'>
        <div className='text-center mb-12'>
          <div className='text-xs uppercase tracking-widest text-slate-400 mb-2'>
            {t('FAQ')}
          </div>
          <h2 className='text-3xl md:text-4xl font-bold'>{t('常见问题')}</h2>
        </div>
        <div className='space-y-3'>
          {items.map((it, i) => (
            <details
              key={i}
              className='rounded-xl border border-slate-200 px-5 py-4 group bg-white'
            >
              <summary className='cursor-pointer font-medium flex items-center justify-between text-slate-800'>
                <span>{it.question}</span>
                <span className='text-slate-400 group-open:rotate-180 transition'>▼</span>
              </summary>
              <p className='mt-3 text-sm text-slate-600 leading-relaxed whitespace-pre-line'>
                {it.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
