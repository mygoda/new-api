import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * HomeFooter — 首页底部。数据来自 dashboard.footer,后台 option 可配。
 *
 * 与全站底部 footer 不同 — 这是首页专属的 dark footer,带品牌链接列。
 * 站内已登录区域由 PageLayout 提供另外的页脚。
 */
export default function HomeFooter({ data }) {
  const { t } = useTranslation();
  const tagline = data?.tagline || t('统一的 AI 模型聚合与分发网关');
  const columns = data?.columns || [];
  const copyright = data?.copyright || `© ${new Date().getFullYear()}`;

  return (
    <footer className='bg-slate-900 text-slate-400 py-12'>
      <div className='max-w-6xl mx-auto px-6'>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-8 text-sm'>
          <div>
            <div className='flex items-center gap-2 mb-4'>
              <div className='w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-pink-500' />
              <span className='font-bold text-white'>new-api</span>
            </div>
            <p className='text-xs leading-relaxed'>{tagline}</p>
          </div>
          {columns.map((col, i) => (
            <div key={i}>
              <div className='text-white font-medium mb-3'>{col.title}</div>
              <ul className='space-y-2'>
                {(col.links || []).map((link, j) => (
                  <li key={j}>
                    <a
                      href={link.url || '#'}
                      className='hover:text-white transition'
                      target={link.url?.startsWith('http') ? '_blank' : undefined}
                      rel='noreferrer'
                    >
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className='mt-10 pt-8 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs'>
          <div>{copyright}</div>
        </div>
      </div>
    </footer>
  );
}
