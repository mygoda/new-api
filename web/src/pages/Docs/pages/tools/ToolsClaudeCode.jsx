import React, { useContext, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import CodeBlock from '../../components/CodeBlock';
import { useServerAddress } from '../../hooks';
import { StatusContext } from '../../../../context/Status';
import { getSystemName } from '../../../../helpers/utils';

const ToolsClaudeCode = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  const [statusState] = useContext(StatusContext);
  const systemName = statusState?.status?.system_name || getSystemName() || 'New API';
  useEffect(() => { document.title = `Claude Code | ${t('工具集成')}`; }, [t]);

  const settingsJson = `{
  "env": {
    "ANTHROPIC_BASE_URL": "${serverAddress}",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxxxxxxxxxxxxxxx",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "ANTHROPIC_MODEL": "claude-sonnet-4-20250514",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-20250514",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-7",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5-20251001"
  }
}`;

  const vscodeJson = `{
  "claudeCode.preferredLocation": "panel",
  "claudeCode.selectedModel": "claude-sonnet-4-20250514",
  "claudeCode.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "${serverAddress}" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "sk-xxxxxxxxxxxxxxxx" },
    { "name": "API_TIMEOUT_MS", "value": "3000000" },
    { "name": "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "value": "1" },
    { "name": "ANTHROPIC_MODEL", "value": "claude-sonnet-4-20250514" }
  ]
}`;

  return (
    <article>
      <h1>Claude Code <span className='docs-tag'>CLI</span></h1>
      <p>
        {t('Anthropic 官方 AI 编程助手。')}
        {systemName} {t('兼容 Anthropic API，配置完成后可使用平台支持的所有模型（含 Claude / GPT / Gemini 等通过 Anthropic 协议访问）。')}
      </p>

      <div className='docs-banner warn'>
        <div className='docs-banner-title'>{t('使用前请清除冲突的环境变量')}</div>
        <div>
          {t('环境变量优先级高于配置文件。请先确保以下变量未被设置（若曾在 ~/.bashrc / ~/.zshrc 中永久导出，需同步删除对应行）：')}
          <div style={{ marginTop: 6 }}>
            <code>ANTHROPIC_AUTH_TOKEN</code> · <code>ANTHROPIC_API_KEY</code> · <code>ANTHROPIC_BASE_URL</code>
          </div>
        </div>
        <CodeBlock lang='bash' code='unset ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY ANTHROPIC_BASE_URL'>
          unset ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY ANTHROPIC_BASE_URL
        </CodeBlock>
      </div>

      <h2 id='setup'>{t('安装与配置')}</h2>

      <StepCard step={1} title={t('安装 Claude Code')}>
        <p>
          {t('参考')}{' '}
          <a href='https://docs.claude.com/en/docs/claude-code/setup' target='_blank' rel='noreferrer'>
            {t('Claude Code 官方安装文档')}
          </a>{' '}
          {t('完成基础安装。')}
        </p>
      </StepCard>

      <StepCard step={2} title={<>{t('编辑')} <code>~/.claude/settings.json</code></>}>
        <p style={{ color: 'var(--docs-text-3)' }}>
          Windows: <code>%USERPROFILE%\.claude\settings.json</code>
        </p>
        <CodeBlock lang='json' code={settingsJson}>{settingsJson}</CodeBlock>
        <ul>
          <li><code>ANTHROPIC_BASE_URL</code> — {t('指向本平台 API 中转地址')}</li>
          <li><code>ANTHROPIC_AUTH_TOKEN</code> — {t('在')} <Link to='/console/token'>{t('令牌管理')}</Link> {t('中创建的密钥（以 sk- 开头）')}</li>
          <li><code>API_TIMEOUT_MS</code> — {t('请求超时（毫秒），建议设大以支持长时任务')}</li>
          <li><code>CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC</code> — {t('禁用非必要流量，减少额外请求')}</li>
          <li><code>ANTHROPIC_MODEL</code> {t('及')} <code>ANTHROPIC_DEFAULT_*_MODEL</code> — {t('替换为本平台支持的模型，可在')} <Link to='/marketplace'>{t('模型广场')}</Link> {t('查看完整列表')}</li>
        </ul>
      </StepCard>

      <StepCard step={3} title={<>{t('编辑')} <code>~/.claude.json</code> {t('跳过登录引导')}</>}>
        <p style={{ color: 'var(--docs-text-3)' }}>
          Windows: <code>%USERPROFILE%\.claude.json</code>
        </p>
        <CodeBlock lang='json' code='{ "hasCompletedOnboarding": true }'>{`{
  "hasCompletedOnboarding": true
}`}</CodeBlock>
      </StepCard>

      <StepCard step={4} title={t('启动并验证')}>
        <p>
          {t('在工作目录执行')} <code>claude</code>，{t('选择「信任此文件夹」(Trust This Folder) 即可开始使用。可在 TUI 中输入以下 slash 命令验证：')}
        </p>
        <CodeBlock lang='text' code={'/status   # 检查 ANTHROPIC_BASE_URL 指向本平台\n/model    # 显示当前模型'}>{`/status   # 检查 ANTHROPIC_BASE_URL 指向本平台
/model    # 显示当前模型`}</CodeBlock>
      </StepCard>

      <h2 id='vscode'>{t('在 VS Code 插件中使用 Claude Code')}</h2>
      <p>
        {t('在 VS Code 扩展市场搜索并安装 "Claude Code for VS Code"，然后通过插件设置写入与上方相同的环境变量：')}
      </p>
      <CodeBlock lang='json' code={vscodeJson}>{vscodeJson}</CodeBlock>
    </article>
  );
};

export default ToolsClaudeCode;
