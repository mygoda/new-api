import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Input, Button } from '@douyinfe/semi-ui';
import { IconCopy } from '@douyinfe/semi-icons';

/**
 * Hero — 首屏。价值主张 + 实时数据条 + 双 CTA。
 *
 * 数据来自 GET /api/home/dashboard:
 *   stats.vendors_count / stats.models_online / stats.sla_pct
 */
export default function HeroSection({ stats, serverAddress, onCopyBaseURL, isLoggedIn }) {
  const { t } = useTranslation();
  const vendors = stats?.vendors_count ?? 0;
  const modelsOnline = stats?.models_online ?? 0;
  const sla = stats?.sla_pct || '—';

  return (
    <section className='relative overflow-hidden'>
      <div className='blur-ball blur-ball-indigo' />
      <div className='blur-ball blur-ball-teal' />
      <div className='max-w-6xl mx-auto px-6 pt-20 pb-16 relative z-10 text-center'>
        <div className='inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/5 mb-6'>
          <span className='w-2 h-2 rounded-full bg-emerald-500 animate-pulse' />
          <span className='text-xs text-slate-700'>
            {t('已接通')} {vendors}+ {t('家供应商')} · {modelsOnline} {t('个模型')} · {t('实时在线')}
          </span>
        </div>
        <h1 className='text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-tight'>
          {t('一个 API,接通')}
          <br />
          <span className='shine-text'>{t('所有顶级大模型')}</span>
        </h1>
        <p className='mt-6 text-base md:text-lg text-slate-600 max-w-2xl mx-auto'>
          {t('OpenAI · Claude · Gemini · DeepSeek · 通义 · 文心 · 火山豆包 · 智谱 · MiniMax · Suno · Midjourney —— 一个网关全部搞定,零代码也能玩。')}
        </p>

        {/* BASE URL 复制条 */}
        <div className='mt-6 flex items-center justify-center max-w-md mx-auto'>
          <Input
            readonly
            value={serverAddress}
            size='large'
            className='!rounded-full'
            suffix={
              <Button
                theme='solid'
                type='primary'
                icon={<IconCopy />}
                onClick={onCopyBaseURL}
                className='!rounded-full'
                aria-label={t('复制 BASE URL')}
              />
            }
          />
        </div>

        {/* 双 CTA */}
        <div className='mt-6 flex flex-wrap items-center justify-center gap-3'>
          <Link
            to={isLoggedIn ? '/console' : '/register'}
            className='px-6 py-3 bg-slate-900 text-white rounded-full font-medium inline-flex items-center gap-2 hover:bg-slate-800 transition'
          >
            {isLoggedIn ? t('进入控制台 →') : t('免费注册 · 送体验额度 →')}
          </Link>
          <Link
            to='/creation'
            className='px-6 py-3 bg-white border border-slate-200 rounded-full font-medium inline-flex items-center gap-2 text-slate-700 hover:bg-slate-50 transition'
          >
            ▶ {t('立即试玩')}
          </Link>
        </div>

        {/* 实时数据条 — 3 格 */}
        <div className='mt-12 grid grid-cols-3 gap-3 max-w-2xl mx-auto'>
          <StatCard num={`${vendors}+`} label={t('模型供应商')} />
          <StatCard num={modelsOnline} label={t('在线模型')} />
          <StatCard num={`${sla}%`} label={t('SLA 可用性')} />
        </div>
      </div>
    </section>
  );
}

function StatCard({ num, label }) {
  return (
    <div className='bg-white/70 rounded-xl p-3 md:p-4 border border-slate-100'>
      <div className='text-2xl md:text-3xl font-bold tabular-nums'>{num}</div>
      <div className='text-xs text-slate-500 mt-1'>{label}</div>
    </div>
  );
}
