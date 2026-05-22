import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import { useServerAddress } from '../../hooks';

const ToolsCline = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  useEffect(() => { document.title = `Cline | ${t('工具集成')}`; }, [t]);

  return (
    <article>
      <h1>Cline <span className='docs-tag'>VS Code</span></h1>
      <p>{t('自主 AI 编程代理插件，可自动读写文件、执行命令。建议升级到 3.47.0 或更高版本，并在升级后重启插件与 VS Code。')}</p>

      <div className='docs-banner warn'>
        <div className='docs-banner-title'>{t('使用前请清除冲突的环境变量')}</div>
        <code>ANTHROPIC_AUTH_TOKEN</code> · <code>ANTHROPIC_BASE_URL</code> {t('若已设置请先清除。')}
      </div>

      <h2 id='setup'>{t('配置步骤')}</h2>

      <StepCard step={1} title={t('安装插件')}>
        <p>{t('VS Code → 扩展 → 搜索 "Cline" → Install，安装完成后重启 VS Code。')}</p>
      </StepCard>

      <StepCard step={2} title={t('打开 Cline 配置面板')}>
        <p>{t('点击侧边栏 Cline 图标 → "Use your own API key" 进入参数配置。')}</p>
      </StepCard>

      <StepCard step={3} title={t('选择 Provider 并填写本平台信息')}>
        <div className='docs-kv'>
          <div><b>API Provider:</b> OpenAI Compatible</div>
          <div><b>Base URL:</b> <code>{`${serverAddress}/v1`}</code></div>
          <div><b>API Key:</b> <code>sk-xxxxxxxxxxxxxxxx</code></div>
          <div><b>Model ID:</b> <code>claude-sonnet-4-20250514</code> {t('或')} <code>gpt-4o</code></div>
        </div>
        <p style={{ color: 'var(--docs-text-3)', marginTop: 8 }}>
          {t('完成后点击右上角 Done 保存。建议在 Auto-approve 中勾选 Edit，以便 Cline 自动应用代码改动。')}
        </p>
      </StepCard>
    </article>
  );
};

export default ToolsCline;
