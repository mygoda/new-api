import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import CodeBlock from '../../components/CodeBlock';
import { useServerAddress } from '../../hooks';

const ToolsOpenClaw = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  const [os, setOs] = useState('unix');
  useEffect(() => { document.title = `OpenClaw | ${t('工具集成')}`; }, [t]);

  return (
    <article>
      <h1>OpenClaw <span className='docs-tag'>CLI</span></h1>
      <p>{t('OpenClaw 通过 Gateway 接入第三方模型服务，本平台可作为 OpenAI 兼容 Provider 接入。')}</p>

      <h2 id='install'>{t('安装与配置')}</h2>

      <StepCard step={1} title={t('安装 OpenClaw')}>
        <div className='docs-code-group'>
          <div className='docs-code-group-tabs'>
            <button type='button' className={`docs-code-group-tab ${os === 'unix' ? 'active' : ''}`} onClick={() => setOs('unix')}>macOS / Linux</button>
            <button type='button' className={`docs-code-group-tab ${os === 'win' ? 'active' : ''}`} onClick={() => setOs('win')}>Windows</button>
          </div>
          <div className='docs-code-group-content'>
            <CodeBlock
              lang={os === 'unix' ? 'bash' : 'powershell'}
              code={os === 'unix' ? 'curl -fsSL https://openclaw.bot/install.sh | bash' : 'iwr -useb https://openclaw.ai/install.ps1 | iex'}
            >
              {os === 'unix' ? 'curl -fsSL https://openclaw.bot/install.sh | bash' : 'iwr -useb https://openclaw.ai/install.ps1 | iex'}
            </CodeBlock>
          </div>
        </div>
      </StepCard>

      <StepCard step={2} title={t('启动配置向导')}>
        <p>{t('运行')} <code>openclaw configure</code>，{t('依次选择：')}</p>
        <ul>
          <li><b>Gateway</b> → <code>Local (this machine)</code></li>
          <li><b>Sections to configure</b> → <code>Model</code></li>
          <li><b>Model/auth provider</b> → {t('选择')} <code>OpenAI Compatible</code> {t('（或 Custom Provider）')}</li>
          <li><b>Auth method</b> → <code>API Key</code></li>
        </ul>
      </StepCard>

      <StepCard step={3} title={t('填写本平台 API 信息')}>
        <div className='docs-kv'>
          <div><b>Base URL:</b> <code>{serverAddress}/v1</code></div>
          <div><b>API Key:</b> <code>sk-xxxxxxxxxxxxxxxx</code></div>
          <div><b>Default Model:</b> <code>gpt-4o</code> {t('或其他平台支持的模型')}</div>
        </div>
      </StepCard>

      <StepCard step={4} title={t('验证')}>
        <p>{t('执行')} <code>openclaw tui</code>，{t('能正常对话即配置成功。')}</p>
      </StepCard>
    </article>
  );
};

export default ToolsOpenClaw;
