import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useServerAddress } from '../hooks';

const FaqItem = ({ id, title, children }) => (
  <div style={{ borderBottom: '1px solid var(--docs-border)', padding: '20px 0' }}>
    <h3 id={id} style={{ margin: '0 0 8px' }}>{title}</h3>
    <div style={{ color: 'var(--docs-text-2)' }}>{children}</div>
  </div>
);

const Faq = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();

  useEffect(() => {
    document.title = `${t('常见问题')} | ${t('API 文档')}`;
  }, [t]);

  return (
    <article>
      <h1>{t('常见问题')}</h1>
      <p>{t('这里汇总了用户接入与日常使用中最常被问到的问题，找不到答案可联系平台管理员。')}</p>

      <FaqItem id='faq-base-url' title={t('API 地址是什么？')}>
        <p>
          {t('本平台的 API 地址为')} <code>{serverAddress}</code>
          {t('，兼容 OpenAI API 格式。在各工具中将 Base URL / API Endpoint 配置为此地址即可。')}
        </p>
      </FaqItem>

      <FaqItem id='faq-models' title={t('支持哪些模型？')}>
        <p>
          {t('支持 GPT-4o、GPT-4、Claude 3.5/4、Gemini 2.0、DeepSeek V3/R1、通义千问等主流模型。具体列表请查看')}{' '}
          <Link to='/marketplace'>{t('模型广场')}</Link>。
        </p>
      </FaqItem>

      <FaqItem id='faq-keys' title={t('如何获取 API Key？')}>
        <p>
          {t('注册登录后，进入')} <Link to='/console/token'>{t('令牌管理')}</Link>{' '}
          {t('页面，点击「新建令牌」即可生成。支持设置额度限制、有效期和可用模型范围。')}
        </p>
      </FaqItem>

      <FaqItem id='faq-billing' title={t('计费方式是什么？')}>
        <p>{t('按照实际调用的 Token 数量计费，不同模型倍率不同。充值后额度实时扣减，可在控制台查看用量明细。')}</p>
      </FaqItem>

      <FaqItem id='faq-vs-openai' title={t('与 OpenAI 官方 API 有什么区别？')}>
        <p>{t('接口格式完全兼容 OpenAI API，只需更换 Base URL 和 Key。额外支持 Claude、Gemini 等非 OpenAI 模型，使用同一个 Key 即可调用所有模型。')}</p>
      </FaqItem>

      <FaqItem id='faq-token-vs-key' title={t('令牌(Token)和密钥(Key)有什么区别？')}>
        <p>{t('令牌是本平台分配的 API Key，以 sk- 开头。您可以创建多个令牌用于不同项目，每个令牌可独立设置额度和模型权限。')}</p>
      </FaqItem>
    </article>
  );
};

export default Faq;
