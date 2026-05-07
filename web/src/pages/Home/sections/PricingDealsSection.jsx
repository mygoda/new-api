import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/**
 * PricingDealsSection — 首页价格优惠主推。
 *
 * 数据来自 dashboard.pricing_deals(后台 HomePricingDeals option,JSON 数组),
 * 每条:{model, vendor, official_price, our_price, unit, tagline, highlight}
 *
 * 折扣百分比、几折由前端计算,不冗余存储:
 *   discount_pct = round((1 - our_price/official_price) * 100)
 *
 * 没有有效卡片(deals 为空 / 解析失败 / 价格无效)时整个 section 不渲染,
 * 避免占位空段落破坏首页节奏。
 */
export default function PricingDealsSection({ items }) {
  const { t } = useTranslation();

  const cards = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items
      .map((d) => {
        const official = Number(d.official_price);
        const ours = Number(d.our_price);
        if (!official || official <= 0 || ours < 0 || ours > official) return null;
        const pct = Math.round((1 - ours / official) * 100);
        // 几折:our/official * 10 (eg. 0.5 -> 5.0 折)
        const discountX = (ours / official) * 10;
        const discountLabel =
          discountX < 10 ? discountX.toFixed(discountX < 1 ? 2 : 1) : null;
        return {
          ...d,
          official,
          ours,
          pct,
          discountLabel,
        };
      })
      .filter(Boolean);
  }, [items]);

  if (cards.length === 0) return null;

  return (
    <section className='relative py-20 md:py-24 overflow-hidden'>
      <div className='blur-ball blur-ball-blue' style={{ top: '-100px', left: '-120px' }} />
      <div className='blur-ball blur-ball-pink' style={{ bottom: '-160px', right: '-100px' }} />

      <div className='relative z-10 max-w-6xl mx-auto px-6'>
        <div className='text-center mb-12'>
          <div className='inline-block px-3 py-1 rounded-full bg-rose-50 text-rose-600 text-xs font-medium mb-4'>
            {t('对标官方价 · 即买即用')}
          </div>
          <h2 className='text-3xl md:text-5xl font-bold tracking-tight'>
            {t('同样的模型,')}
            <span className='shine-text'>{t('更低的价格')}</span>
          </h2>
          <p className='mt-4 text-base md:text-lg text-slate-600 max-w-2xl mx-auto'>
            {t('整合多家上游渠道议价能力,把成本优势直接让利给开发者。注册即送体验额度。')}
          </p>
        </div>

        <div
          className={`grid gap-6 ${
            cards.length === 1
              ? 'max-w-md mx-auto'
              : cards.length === 2
              ? 'md:grid-cols-2 max-w-3xl mx-auto'
              : 'md:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {cards.map((d, i) => (
            <DealCard key={`${d.model}-${i}`} deal={d} t={t} />
          ))}
        </div>

        <div className='mt-12 text-center'>
          <Link
            to='/pricing'
            className='inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium text-sm'
          >
            {t('查看全部模型价格 →')}
          </Link>
        </div>
      </div>
    </section>
  );
}

function DealCard({ deal, t }) {
  const highlight = !!deal.highlight;

  return (
    <div
      className={`relative rounded-3xl p-6 md:p-8 transition transform hover:-translate-y-1 ${
        highlight
          ? 'bg-gradient-to-br from-indigo-600 via-indigo-500 to-pink-500 text-white shadow-2xl shadow-indigo-500/30 md:scale-105'
          : 'bg-white text-slate-900 shadow-sm border border-slate-100 hover:shadow-lg'
      }`}
    >
      {deal.tagline && (
        <div
          className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
            highlight
              ? 'bg-amber-300 text-amber-900'
              : 'bg-rose-100 text-rose-600 border border-rose-200'
          }`}
        >
          {deal.tagline}
        </div>
      )}

      <div className='flex items-center justify-between mb-2'>
        <span
          className={`text-xs font-medium ${
            highlight ? 'text-indigo-100' : 'text-slate-500'
          }`}
        >
          {deal.vendor || ' '}
        </span>
        {deal.pct > 0 && (
          <span
            className={`px-2 py-0.5 rounded-md text-xs font-bold ${
              highlight ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-600'
            }`}
          >
            {deal.discountLabel ? `${deal.discountLabel} ${t('折')}` : `-${deal.pct}%`}
          </span>
        )}
      </div>

      <h3 className='text-2xl md:text-3xl font-bold mb-5 truncate'>{deal.model}</h3>

      {/* 大字号折扣 */}
      <div className='flex items-baseline gap-2 mb-1'>
        <span
          className={`text-5xl md:text-6xl font-extrabold leading-none ${
            highlight ? '' : 'bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-pink-500'
          }`}
        >
          -{deal.pct}%
        </span>
      </div>
      <div
        className={`text-sm mb-6 ${
          highlight ? 'text-indigo-100' : 'text-slate-500'
        }`}
      >
        {t('相对官方价立省')}
      </div>

      {/* 价格对比 */}
      <div
        className={`rounded-2xl p-4 mb-5 ${
          highlight ? 'bg-white/10 backdrop-blur-sm' : 'bg-slate-50'
        }`}
      >
        <div className='flex items-baseline justify-between mb-2'>
          <span
            className={`text-xs ${highlight ? 'text-indigo-100' : 'text-slate-500'}`}
          >
            {t('官方价')}
          </span>
          <span
            className={`text-base line-through ${
              highlight ? 'text-indigo-200' : 'text-slate-400'
            }`}
          >
            {formatPrice(deal.official)}
          </span>
        </div>
        <div className='flex items-baseline justify-between'>
          <span
            className={`text-xs font-medium ${
              highlight ? 'text-white' : 'text-slate-700'
            }`}
          >
            {t('我们的价')}
          </span>
          <span
            className={`text-2xl md:text-3xl font-bold ${
              highlight ? 'text-white' : 'text-rose-600'
            }`}
          >
            {formatPrice(deal.ours)}
          </span>
        </div>
        {deal.unit && (
          <div
            className={`text-xs mt-2 text-right ${
              highlight ? 'text-indigo-100' : 'text-slate-400'
            }`}
          >
            {deal.unit}
          </div>
        )}
      </div>

      <Link
        to='/register'
        className={`block w-full text-center py-3 rounded-full text-sm font-semibold transition ${
          highlight
            ? 'bg-white text-indigo-600 hover:bg-slate-100'
            : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
      >
        {t('立即开通 →')}
      </Link>
    </div>
  );
}

function formatPrice(n) {
  if (n == null) return '-';
  if (n < 0.01 && n > 0) return n.toFixed(4);
  if (n < 1) return n.toFixed(3);
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}
