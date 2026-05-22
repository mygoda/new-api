import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import CodeBlock from '../../components/CodeBlock';
import { useServerAddress } from '../../hooks';

const ToolsCursor = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  useEffect(() => { document.title = `Cursor | ${t('工具集成')}`; }, [t]);

  return (
    <article>
      <h1>Cursor <span className='docs-tag'>IDE</span></h1>
      <p>{t('AI 代码编辑器，内置 Chat / Composer / Edit。本平台以 OpenAI 兼容协议接入 Cursor 自定义模型。')}</p>

      <div className='docs-banner warn'>
        <div className='docs-banner-title'>{t('使用前请清除冲突的环境变量')}</div>
        <code>OPENAI_API_KEY</code> · <code>OPENAI_BASE_URL</code> {t('若已设置可能影响 Cursor 的 API 调用，请先清除。')}
      </div>

      <div className='docs-banner info'>
        <div className='docs-banner-title'>{t('已知限制')}</div>
        <ul>
          <li>{t('「Override OpenAI Base URL」是全局设置，开启后会作用于 Cursor 内所有 API Key（包括 Cursor 自带模型用的 Anthropic / GPT Key）。')}</li>
          <li>{t('Cursor Tab 自动补全由 Cursor 官方模型驱动，自定义 API Key 不会接管 Tab，仅在 Chat / Composer / Edit 中生效。')}</li>
          <li>{t('自定义模型仅 Cursor Pro 订阅可用，免费版会提示 "does not work with your current plan or api key"。')}</li>
        </ul>
      </div>

      <h2 id='setup'>{t('配置步骤')}</h2>

      <StepCard step={1} title={t('打开模型设置')}>
        <p>{t('Cursor → Settings → Models，展开 "API Keys" 部分。')}</p>
      </StepCard>

      <StepCard step={2} title={t('启用 Override OpenAI Base URL')}>
        <p>{t('勾选 "Override OpenAI Base URL"，在下方输入框填入：')}</p>
        <CodeBlock lang='text' code={`${serverAddress}/v1`}>{`${serverAddress}/v1`}</CodeBlock>
      </StepCard>

      <StepCard step={3} title={t('填写并启用 OpenAI API Key')}>
        <p>
          {t('在 OpenAI API Key 输入框填入')} <code>sk-xxxxxxxxxxxxxxxx</code>，
          {t('点击右侧按钮，在弹窗中点击 "Enable OpenAI API Key" 完成验证。')}
        </p>
      </StepCard>

      <StepCard step={4} title={t('添加自定义模型')}>
        <p>
          {t('Models 板块 → "View All Models" → "Add Custom Model"，输入想使用的模型名（如')}{' '}
          <code>claude-sonnet-4-20250514</code>、<code>gpt-4o</code>），
          {t('严格按平台支持的模型 ID 填写（注意大小写）。添加后点击启用。')}
        </p>
      </StepCard>

      <StepCard step={5} title={t('在 Chat 中选择并使用')}>
        <p>{t('在聊天面板的模型选择器中选择刚添加的模型，即可开始使用。如出现模型无返回内容，可在 Cursor 设置中将 "Network" 改为 HTTP/1.0 重试。')}</p>
      </StepCard>
    </article>
  );
};

export default ToolsCursor;
