import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/**
 * QuickStartSection — 三种身份分流。
 * 让不同类型的访客快速找到自己的入口。
 */
export default function QuickStartSection({ serverAddress }) {
  const { t } = useTranslation();

  const codeSnippet = `import OpenAI from "openai";
const client = new OpenAI({
  baseURL: "${serverAddress || 'https://your.new-api.com'}/v1",
  apiKey: process.env.NEW_API_KEY,
});`;

  return (
    <section className='py-20 bg-white border-y border-slate-100'>
      <div className='max-w-6xl mx-auto px-6'>
        <div className='text-center mb-12'>
          <div className='text-xs uppercase tracking-widest text-slate-400 mb-2'>
            {t('QUICK START')}
          </div>
          <h2 className='text-3xl md:text-4xl font-bold'>{t('3 步开始使用')}</h2>
          <p className='mt-3 text-slate-500'>{t('选择最适合你的方式')}</p>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          {/* 开发者 */}
          <div className='hover-card rounded-2xl border-2 border-slate-200 p-6 relative bg-white flex flex-col'>
            <div className='absolute -top-3 left-6 bg-white px-2 text-xs text-slate-400'>
              {t('最常见')}
            </div>
            <div className='text-3xl mb-3'>👨‍💻</div>
            <h3 className='font-bold text-lg'>{t('我是开发者')}</h3>
            <p className='text-sm text-slate-500 mt-1 mb-4'>{t('改一行 BASE_URL 就能用')}</p>
            <pre className='bg-slate-900 text-slate-100 text-xs p-3 rounded-lg overflow-x-auto leading-relaxed'>
              <code>{codeSnippet}</code>
            </pre>
            <Link
              to='/docs'
              className='block w-full text-center mt-auto px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 transition'
            >
              {t('查看 SDK 示例 →')}
            </Link>
          </div>

          {/* 客户端用户 */}
          <div className='hover-card rounded-2xl border-2 border-slate-200 p-6 bg-white flex flex-col'>
            <div className='text-3xl mb-3'>🖥️</div>
            <h3 className='font-bold text-lg'>{t('我用客户端')}</h3>
            <p className='text-sm text-slate-500 mt-1 mb-4'>
              {t('ChatBox / Cherry Studio / NextChat / Open WebUI')}
            </p>
            <ol className='text-sm text-slate-700 space-y-2 mb-4'>
              <li className='flex gap-2'>
                <span className='text-indigo-500 font-bold'>1.</span>
                <span>{t('在客户端选「OpenAI 兼容」')}</span>
              </li>
              <li className='flex gap-2'>
                <span className='text-indigo-500 font-bold'>2.</span>
                <span>{t('粘贴 BASE_URL 和 API Key')}</span>
              </li>
              <li className='flex gap-2'>
                <span className='text-indigo-500 font-bold'>3.</span>
                <span>{t('选你喜欢的模型,开聊')}</span>
              </li>
            </ol>
            <Link
              to='/docs'
              className='block w-full text-center mt-auto px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 transition'
            >
              {t('查看客户端配置指南 →')}
            </Link>
          </div>

          {/* 网页用户 */}
          <div className='hover-card rounded-2xl border-2 border-indigo-500 p-6 relative bg-gradient-to-b from-indigo-50/40 to-transparent flex flex-col'>
            <div className='absolute -top-3 left-6 bg-white px-2 text-xs text-indigo-600 font-medium'>
              {t('推荐 C 端')}
            </div>
            <div className='text-3xl mb-3'>🎨</div>
            <h3 className='font-bold text-lg'>{t('我直接用网页')}</h3>
            <p className='text-sm text-slate-500 mt-1 mb-4'>{t('不安装、不写代码,网页直接用')}</p>
            <ul className='text-sm text-slate-700 space-y-2 mb-4'>
              <li>✓ {t('Playground 内置所有 LLM')}</li>
              <li>✓ {t('创作中心:出图、出视频')}</li>
              <li>✓ {t('作品库:历史记录可下载')}</li>
            </ul>
            <Link
              to='/creation'
              className='block w-full text-center mt-auto px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 transition'
            >
              {t('立即打开 →')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
