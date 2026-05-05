import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/**
 * CreationPromoSection — 紫黑渐变 banner,推「无需代码,网页直接玩」的创作中心。
 *
 * 6 个色块 placeholder。后续可以接 /api/home/dashboard 的 creation_gallery 字段
 * 替换成真实作品缩略图。
 */
const PLACEHOLDER_GRADIENTS = [
  'from-orange-400 to-pink-500',
  'from-blue-400 to-purple-500',
  'from-emerald-400 to-teal-500',
  'from-purple-400 to-pink-500',
  'from-yellow-400 to-orange-500',
  'from-cyan-400 to-blue-500',
];

export default function CreationPromoSection() {
  const { t } = useTranslation();
  return (
    <section className='py-20'>
      <div className='max-w-6xl mx-auto px-6'>
        <div className='rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 p-8 md:p-12 lg:p-16 text-white relative overflow-hidden'>
          <div className='absolute top-0 right-0 w-96 h-96 bg-pink-500 rounded-full filter blur-3xl opacity-20' />
          <div className='relative z-10 max-w-3xl'>
            <div className='inline-block px-3 py-1 bg-white/10 backdrop-blur rounded-full text-xs mb-4'>
              {t('无需写代码 · 浏览器直接用')}
            </div>
            <h2 className='text-3xl md:text-4xl lg:text-5xl font-bold leading-tight'>
              {t('创作中心:')}
              <br />
              {t('像聊天一样,')}
              <span className='shine-text'>{t('生成图像 / 视频')}</span>
            </h2>
            <p className='mt-6 text-base md:text-lg text-slate-200 max-w-2xl'>
              {t('不是开发者也能玩。打开网页 → 选模型 → 输入提示词 → 拿到结果。一站式作品库。')}
            </p>
            <div className='mt-8 flex flex-wrap gap-3'>
              <Link
                to='/creation'
                className='px-6 py-3 bg-white text-slate-900 rounded-full font-medium hover:bg-slate-100 transition'
              >
                {t('打开创作中心 →')}
              </Link>
            </div>
          </div>
          {/* 占位作品 thumbnails */}
          <div className='relative z-10 mt-8 md:mt-10 grid grid-cols-3 md:grid-cols-6 gap-3 opacity-90'>
            {PLACEHOLDER_GRADIENTS.map((grad, i) => (
              <div key={i} className={`aspect-square rounded-lg bg-gradient-to-br ${grad}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
