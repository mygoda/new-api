/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner, Button, Toast } from '@douyinfe/semi-ui';
import {
  IconArrowLeft,
  IconCopy,
  IconDownload,
  IconMail,
  IconUser,
} from '@douyinfe/semi-icons';

/**
 * ContactSales — 「联系商务」落地页。
 *
 * 用途:让 C 端 / 企业用户扫码加微信,走线下转账 → 充值开通流程。
 * 入口:首页 BottomCTASection 的「联系商务」按钮。
 */

const WECHAT_ID = 'DREAM';
const QR_PATH = '/contact-wechat-qr.jpg';

const FLOW_STEPS = [
  {
    title: '扫码添加微信',
    desc: '使用微信扫描下方二维码,备注「new-api」。我们会在工作时间(9:00–22:00)第一时间回复。',
  },
  {
    title: '沟通需求 + 报价',
    desc: '说明使用模型 / 预计调用量 / 是否需要发票,我们提供线下结算价格(企业批量更优惠)。',
  },
  {
    title: '完成转账 + 即时开通',
    desc: '微信 / 银行转账确认后,通常 5–30 分钟内完成额度发放,可立即开始调用。',
  },
];

const FAQ_ITEMS = [
  {
    q: '为什么需要扫码加微信而不是直接在线支付?',
    a: '在线支付适合小额尝鲜,但企业 / 高频用户往往需要发票、批量优惠、专属客服支持等。线下沟通能给出更合适的方案,转账后人工即时开通对应额度。',
  },
  {
    q: '支持哪些充值方式?',
    a: '微信转账、支付宝、银行对公转账(支持开具普票 / 专票)。USDT / 海外信用卡可单独沟通。',
  },
  {
    q: '充值后多久能开通额度?',
    a: '工作时间内 5–30 分钟。如恰逢深夜,通常次日早 9 点前完成。开通后会在微信确认告知。',
  },
  {
    q: '可以开发票吗?',
    a: '可以。普票即开;增值税专票需要提供企业税务信息,1–3 个工作日内邮寄电子票。',
  },
  {
    q: '企业批量充值有优惠吗?',
    a: '有。500 元以上起谈阶梯折扣,长期合作可走月结合同。具体方案微信沟通。',
  },
  {
    q: '充值后有效期多久?',
    a: '默认无过期时间,可一直用到余额耗尽。不主动停用、不强制续费。',
  },
];

export default function ContactSales() {
  const { t } = useTranslation();
  const [copying, setCopying] = useState(false);

  const flow = useMemo(() => FLOW_STEPS.map((s, i) => ({ ...s, index: i + 1 })), []);

  const handleCopyId = async () => {
    if (copying) return;
    setCopying(true);
    try {
      await navigator.clipboard?.writeText(WECHAT_ID);
      Toast.success(t('已复制微信号'));
    } catch (e) {
      Toast.warning(t('复制失败,请手动复制:') + ' ' + WECHAT_ID);
    } finally {
      setTimeout(() => setCopying(false), 600);
    }
  };

  const handleDownloadQR = () => {
    const a = document.createElement('a');
    a.href = QR_PATH;
    a.download = 'contact-wechat-qr.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className='relative min-h-screen bg-gradient-to-b from-slate-50 via-white to-white'>
      {/* 顶部装饰球 — 与首页风格保持一致 */}
      <div className='blur-ball blur-ball-blue' style={{ top: '-180px', left: '-120px' }} />
      <div className='blur-ball blur-ball-pink' style={{ top: '120px', right: '-160px' }} />

      <div className='relative z-10 max-w-5xl mx-auto px-6 py-10 md:py-16'>
        {/* 顶部返回 */}
        <div className='mb-8'>
          <Link
            to='/'
            className='inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition'
          >
            <IconArrowLeft size='small' />
            {t('返回首页')}
          </Link>
        </div>

        {/* Hero */}
        <div className='text-center mb-12'>
          <div className='inline-block px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium mb-4'>
            {t('企业 / 大额客户专享')}
          </div>
          <h1 className='text-3xl md:text-5xl font-bold tracking-tight'>
            {t('扫码添加商务')}
            <span className='shine-text'>{t('线下开通')}</span>
          </h1>
          <p className='mt-4 text-base md:text-lg text-slate-600 max-w-2xl mx-auto'>
            {t(
              '需要批量充值、专属客服、发票服务,或想咨询企业 / 团队套餐?微信扫码加好友,人工 1 对 1 服务。',
            )}
          </p>
        </div>

        {/* 主卡片:二维码 + 流程 */}
        <div className='grid md:grid-cols-2 gap-6 mb-12'>
          {/* 二维码 */}
          <div className='bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 flex flex-col items-center'>
            <div className='w-full max-w-xs aspect-square bg-slate-50 rounded-2xl p-4 flex items-center justify-center'>
              <img
                src={QR_PATH}
                alt={t('联系商务微信二维码')}
                className='w-full h-full object-contain select-none'
                draggable={false}
              />
            </div>
            <div className='mt-5 text-center'>
              <div className='text-xs text-slate-400 mb-1'>{t('微信号')}</div>
              <div className='flex items-center justify-center gap-2'>
                <span className='text-xl font-semibold tracking-wider'>{WECHAT_ID}</span>
                <Button
                  size='small'
                  type='tertiary'
                  theme='borderless'
                  icon={<IconCopy />}
                  onClick={handleCopyId}
                  loading={copying}
                  aria-label={t('复制微信号')}
                />
              </div>
              <div className='text-xs text-slate-400 mt-3'>
                {t('扫一扫上面的二维码图案,加我为朋友')}
              </div>
            </div>
            <div className='mt-5 w-full flex flex-wrap justify-center gap-2'>
              <Button
                icon={<IconDownload />}
                onClick={handleDownloadQR}
                type='tertiary'
              >
                {t('保存二维码')}
              </Button>
              <a
                href='mailto:support@quantumnous.com'
                className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition'
              >
                <IconMail size='small' />
                {t('或发邮件')}
              </a>
            </div>
          </div>

          {/* 流程引导 */}
          <div className='bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100'>
            <div className='flex items-center gap-2 mb-5'>
              <IconUser className='text-indigo-500' />
              <h2 className='text-lg font-semibold'>{t('开通三步走')}</h2>
            </div>
            <ol className='space-y-5'>
              {flow.map((step) => (
                <li key={step.index} className='flex gap-3'>
                  <div className='flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-white text-sm font-semibold flex items-center justify-center'>
                    {step.index}
                  </div>
                  <div className='flex-1 min-w-0'>
                    <div className='font-medium text-slate-900'>{t(step.title)}</div>
                    <div className='text-sm text-slate-500 mt-1 leading-relaxed'>
                      {t(step.desc)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <Banner
              type='info'
              fullMode={false}
              closeIcon={null}
              className='!mt-6'
              description={t(
                '工作时间 09:00 – 22:00 (北京时间),其他时段消息会在次日处理。',
              )}
            />
          </div>
        </div>

        {/* 适用场景 */}
        <div className='bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 mb-12'>
          <h2 className='text-lg font-semibold mb-4'>{t('什么场景适合走线下开通?')}</h2>
          <div className='grid sm:grid-cols-2 lg:grid-cols-3 gap-4'>
            {[
              { tag: t('企业批量'), desc: t('单次充值 500 元以上,享阶梯折扣') },
              { tag: t('需开发票'), desc: t('普票 / 专票均可,公对公转账') },
              { tag: t('长期合作'), desc: t('包月 / 包年套餐,可走合同月结') },
              { tag: t('技术支持'), desc: t('专属对接群,模型迁移 / 调优答疑') },
              { tag: t('定制部署'), desc: t('私有化 / 内网部署,按需报价') },
              { tag: t('小额尝鲜'), desc: t('也欢迎,但更建议在线支付,即时到账') },
            ].map((x, i) => (
              <div
                key={i}
                className='border border-slate-100 rounded-xl p-4 hover:border-indigo-200 hover:bg-indigo-50/30 transition'
              >
                <div className='text-sm font-semibold text-indigo-600 mb-1'>{x.tag}</div>
                <div className='text-sm text-slate-600 leading-relaxed'>{x.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className='mb-12'>
          <h2 className='text-2xl font-bold mb-6 text-center'>{t('常见问题')}</h2>
          <div className='space-y-3'>
            {FAQ_ITEMS.map((item, i) => (
              <details
                key={i}
                className='group bg-white rounded-2xl border border-slate-100 overflow-hidden hover:border-slate-200 transition'
              >
                <summary className='cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-4'>
                  <span className='font-medium text-slate-900 text-sm md:text-base'>
                    {t(item.q)}
                  </span>
                  <span className='flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-base group-open:rotate-45 transition'>
                    +
                  </span>
                </summary>
                <div className='px-5 pb-4 text-sm text-slate-600 leading-relaxed'>
                  {t(item.a)}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* 次要 CTA */}
        <div className='text-center pb-6'>
          <p className='text-sm text-slate-500 mb-3'>
            {t('小额体验?可以先去注册免费额度试用')}
          </p>
          <Link
            to='/register'
            className='inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium text-sm'
          >
            {t('免费注册体验 →')}
          </Link>
        </div>
      </div>
    </div>
  );
}
