import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

/**
 * CapabilitiesSection — 6 个能力 Tab,每个 Tab 显示 6 张精选模型卡。
 *
 * 数据来自 dashboard.featured_models:
 *   { chat: [...], image: [...], video: [...], code: [...], audio: [...], embedding: [...] }
 *
 * 模型按 home_priority DESC, id ASC 排序(后端已排好)。
 */
const TABS = [
  { key: 'chat', label: '智能对话', emoji: '💬' },
  { key: 'image', label: '图像生成', emoji: '🎨' },
  { key: 'video', label: '视频生成', emoji: '🎬' },
  { key: 'code', label: '代码助手', emoji: '💻' },
  { key: 'audio', label: '音频/音乐', emoji: '🎵' },
  { key: 'embedding', label: '向量检索', emoji: '🔍' },
];

export default function CapabilitiesSection({ featured }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [active, setActive] = useState('chat');

  const cards = useMemo(() => {
    const list = featured?.[active] || [];
    return list;
  }, [featured, active]);

  return (
    <section className='py-20 bg-white border-y border-slate-100'>
      <div className='max-w-6xl mx-auto px-6'>
        <div className='text-center mb-12'>
          <div className='text-xs uppercase tracking-widest text-slate-400 mb-2'>
            {t('CAPABILITIES')}
          </div>
          <h2 className='text-3xl md:text-4xl font-bold'>{t('能用它做什么?')}</h2>
          <p className='mt-3 text-slate-500'>{t('从对话到视频生成,你想要的能力都在这里')}</p>
        </div>

        <div className='flex justify-center gap-2 mb-10 overflow-x-auto pb-2'>
          {TABS.map((tab) => {
            const isActive = active === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActive(tab.key)}
                className={`rounded-full px-5 py-2 text-sm font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.emoji} {t(tab.label)}
              </button>
            );
          })}
        </div>

        {cards.length === 0 ? (
          <div className='text-center py-12 text-slate-400 text-sm'>
            {t('该能力下还没有精选模型,管理员可以在「模型管理」中调整「首页推荐优先级」')}
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {cards.map((m, idx) => (
              <ModelCard
                key={m.model_name}
                rank={idx + 1}
                model={m}
                onTry={() => navigate(`/console/playground?model=${encodeURIComponent(m.model_name)}`)}
              />
            ))}
          </div>
        )}

        <div className='text-center mt-10'>
          <button
            onClick={() => navigate('/marketplace')}
            className='text-sm text-slate-700 hover:underline'
          >
            {t('查看全部模型 →')}
          </button>
        </div>
      </div>
    </section>
  );
}

function ModelCard({ rank, model, onTry }) {
  const { t } = useTranslation();
  return (
    <div className='hover-card bg-white border border-slate-200 rounded-2xl p-5'>
      <div className='flex items-start justify-between mb-3'>
        <div>
          {model.vendor_name && (
            <span className='inline-block text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded'>
              {model.vendor_name}
            </span>
          )}
          <h3 className='font-semibold text-base mt-2 break-all'>{model.model_name}</h3>
        </div>
        <span className='text-xs text-slate-400 tabular-nums'>#{rank}</span>
      </div>
      {model.description && (
        <p className='text-sm text-slate-500 leading-relaxed line-clamp-2'>{model.description}</p>
      )}
      <div className='flex items-center justify-end mt-4 pt-4 border-t border-slate-100'>
        <button
          onClick={onTry}
          className='text-xs px-3 py-1 bg-slate-900 text-white rounded-full hover:bg-slate-800'
        >
          {t('试玩 →')}
        </button>
      </div>
    </div>
  );
}
