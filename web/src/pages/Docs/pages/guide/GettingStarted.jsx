import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import CodeBlock from '../../components/CodeBlock';
import { useServerAddress } from '../../hooks';

const GettingStarted = () => {
  const { t } = useTranslation();
  const { serverAddress, serverAddressMissing } = useServerAddress();

  useEffect(() => {
    document.title = `${t('快速开始')} | ${t('API 文档')}`;
  }, [t]);

  return (
    <article>
      <h1 id='top'>{t('快速开始')}</h1>
      <p>
        {t('本平台兼容 OpenAI API 格式，按下方四个步骤即可在数分钟内完成第一次调用。')}
      </p>

      {serverAddressMissing && (
        <div className='docs-banner warn'>
          <div className='docs-banner-title'>{t('尚未配置服务器地址')}</div>
          <div>
            {t('管理员尚未在「系统设置 → 服务器地址」中配置 API 中转地址，下方示例使用占位地址 https://your-domain.com，请配置后再查看完整示例。')}
          </div>
        </div>
      )}

      <h2 id='steps'>{t('四步上手')}</h2>
      <div className='docs-steps'>
        <StepCard step={1} title={t('注册账号')}>
          <p>{t('访问平台首页，点击注册按钮创建账号。注册完成后登录进入控制台。')}</p>
        </StepCard>

        <StepCard step={2} title={t('获取额度')}>
          <p>
            {t('进入')} <Link to='/console/topup'>{t('钱包充值')}</Link>{' '}
            {t('页面，选择合适的充值方式获取调用额度。')}
          </p>
        </StepCard>

        <StepCard step={3} title={t('创建令牌')}>
          <p>
            {t('进入')} <Link to='/console/token'>{t('令牌管理')}</Link>{' '}
            {t('页面，创建 API 令牌。建议为不同用途创建独立令牌，便于管理和追踪用量。')}
          </p>
        </StepCard>

        <StepCard step={4} title={t('配置 API 地址')}>
          <p>{t('将以下地址配置为你的 API Base URL：')}</p>
          <CodeBlock lang='text' code={serverAddress}>{serverAddress}</CodeBlock>
        </StepCard>
      </div>

      <h2 id='auth'>{t('鉴权方式')}</h2>
      <p>
        {t('在请求头中添加')} <code>Authorization: Bearer YOUR_API_KEY</code>{', '}
        {t('YOUR_API_KEY 为')}
        <Link to='/console/token'>{t('令牌管理')}</Link>
        {t('中创建的以 sk- 开头的令牌。')}
      </p>

      <h2 id='next'>{t('下一步')}</h2>
      <ul>
        <li>
          <Link to='/docs/guide/examples'>{t('查看 cURL / Python / Node.js 调用示例')}</Link>
        </li>
        <li>
          <Link to='/docs/api/chat'>{t('完整 API 参考')}</Link>
        </li>
        <li>
          <Link to='/docs/tools/claude-code'>{t('接入 Claude Code / Cursor 等开发工具')}</Link>
        </li>
      </ul>
    </article>
  );
};

export default GettingStarted;
