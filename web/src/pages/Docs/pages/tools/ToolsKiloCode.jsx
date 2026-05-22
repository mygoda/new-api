import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import { useServerAddress } from '../../hooks';

const ToolsKiloCode = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  useEffect(() => { document.title = `Kilo Code | ${t('工具集成')}`; }, [t]);

  return (
    <article>
      <h1>Kilo Code <span className='docs-tag'>VS Code</span></h1>
      <p>{t('Kilo Code 是 VS Code 中的 AI 编程插件，配置流程与 Cline 类似。')}</p>

      <div className='docs-banner warn'>
        <div className='docs-banner-title'>{t('使用前请清除冲突的环境变量')}</div>
        <code>ANTHROPIC_AUTH_TOKEN</code> · <code>ANTHROPIC_BASE_URL</code> {t('若已设置请先清除。')}
      </div>

      <h2 id='setup'>{t('配置步骤')}</h2>

      <StepCard step={1} title={t('安装插件')}>
        <p>{t('VS Code → 扩展 → 搜索 "Kilo Code" → Install，安装完成后重启 VS Code。')}</p>
      </StepCard>

      <StepCard step={2} title={t('打开 Settings 配置面板')}>
        <p>{t('点击 Kilo Code 侧栏的 Settings 按钮进入参数配置。')}</p>
      </StepCard>

      <StepCard step={3} title={t('填写本平台 API 信息')}>
        <div className='docs-kv'>
          <div><b>API Provider:</b> OpenAI Compatible</div>
          <div><b>Base URL:</b> <code>{`${serverAddress}/v1`}</code></div>
          <div><b>API Key:</b> <code>sk-xxxxxxxxxxxxxxxx</code></div>
          <div><b>Model:</b> <code>claude-sonnet-4-20250514</code> {t('或其他平台支持的模型')}</div>
        </div>
        <p style={{ color: 'var(--docs-text-3)', marginTop: 8 }}>
          {t('依次点击右上角 Save 与 Done 保存配置，即可在 Kilo Code 中开始对话。')}
        </p>
      </StepCard>
    </article>
  );
};

export default ToolsKiloCode;
