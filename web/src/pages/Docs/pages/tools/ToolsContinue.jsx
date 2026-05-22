import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import CodeBlock from '../../components/CodeBlock';
import { useServerAddress } from '../../hooks';

const ToolsContinue = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  useEffect(() => { document.title = `Continue | ${t('工具集成')}`; }, [t]);

  const cfg = `{
  "models": [
    {
      "title": "GPT-4o",
      "provider": "openai",
      "model": "gpt-4o",
      "apiBase": "${serverAddress}/v1",
      "apiKey": "sk-xxxxxxxxxxxxxxxx"
    },
    {
      "title": "Claude Sonnet 4",
      "provider": "openai",
      "model": "claude-sonnet-4-20250514",
      "apiBase": "${serverAddress}/v1",
      "apiKey": "sk-xxxxxxxxxxxxxxxx"
    }
  ]
}`;

  return (
    <article>
      <h1>Continue <span className='docs-tag'>VS Code / JetBrains</span></h1>
      <p>{t('开源 AI 代码助手插件，支持 VS Code 和 JetBrains。')}</p>

      <h2 id='setup'>{t('配置步骤')}</h2>

      <StepCard step={1} title={t('安装插件')}>
        <p>{t('在 VS Code 扩展市场搜索 "Continue" 并安装。')}</p>
      </StepCard>

      <StepCard step={2} title={<>{t('编辑配置')} <code>~/.continue/config.json</code></>}>
        <CodeBlock lang='json' code={cfg}>{cfg}</CodeBlock>
      </StepCard>

      <StepCard step={3} title={t('使用')}>
        <p>{t('按')} <code>Ctrl+L</code> / <code>Cmd+L</code> {t('打开对话面板，选择模型即可。')}</p>
      </StepCard>
    </article>
  );
};

export default ToolsContinue;
