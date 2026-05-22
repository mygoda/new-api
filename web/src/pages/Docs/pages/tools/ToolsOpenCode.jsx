import React, { useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import CodeBlock from '../../components/CodeBlock';
import { useServerAddress } from '../../hooks';
import { StatusContext } from '../../../../context/Status';
import { getSystemName } from '../../../../helpers/utils';

const ToolsOpenCode = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  const [statusState] = useContext(StatusContext);
  const systemName = statusState?.status?.system_name || getSystemName() || 'New API';
  const slug = (systemName || 'newapi').toLowerCase().replace(/\s+/g, '-');
  useEffect(() => { document.title = `OpenCode | ${t('工具集成')}`; }, [t]);

  const cfg = `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "${slug}": {
      "npm": "@ai-sdk/anthropic",
      "options": {
        "baseURL": "${serverAddress}",
        "apiKey": "sk-xxxxxxxxxxxxxxxx"
      },
      "models": {
        "claude-sonnet-4-20250514": { "name": "Claude Sonnet 4" },
        "claude-opus-4-7": { "name": "Claude Opus 4.7" }
      }
    }
  }
}`;

  return (
    <article>
      <h1>OpenCode <span className='docs-tag'>CLI</span></h1>
      <p>{t('开源终端 AI 编程代理，支持自定义 Provider。本平台兼容 Anthropic 协议，可作为 OpenCode 的自定义 Provider 接入。')}</p>

      <h2 id='setup'>{t('配置步骤')}</h2>

      <StepCard step={1} title={t('安装 OpenCode')}>
        <p style={{ color: 'var(--docs-text-3)' }}>{t('使用脚本或 npm：')}</p>
        <CodeBlock lang='bash' code={`# ${t('脚本安装')}
curl -fsSL https://opencode.ai/install | bash

# ${t('或使用 npm')}
npm i -g opencode-ai`}>{`# ${t('脚本安装')}
curl -fsSL https://opencode.ai/install | bash

# ${t('或使用 npm')}
npm i -g opencode-ai`}</CodeBlock>
      </StepCard>

      <StepCard step={2} title={<>{t('编辑配置')} <code>~/.config/opencode/opencode.json</code></>}>
        <p style={{ color: 'var(--docs-text-3)' }}>{t('使用 Anthropic SDK Provider 接入本平台：')}</p>
        <CodeBlock lang='json' code={cfg}>{cfg}</CodeBlock>
      </StepCard>

      <StepCard step={3} title={t('启动并选择模型')}>
        <p>
          {t('在项目目录运行')} <code>opencode</code>，{t('启动后输入')} <code>/models</code> {t('选择刚配置的模型即可使用。')}
        </p>
      </StepCard>
    </article>
  );
};

export default ToolsOpenCode;
