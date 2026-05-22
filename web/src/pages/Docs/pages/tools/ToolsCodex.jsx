import React, { useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import CodeBlock from '../../components/CodeBlock';
import { useServerAddress } from '../../hooks';
import { StatusContext } from '../../../../context/Status';
import { getSystemName } from '../../../../helpers/utils';

const ToolsCodex = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  const [statusState] = useContext(StatusContext);
  const systemName = statusState?.status?.system_name || getSystemName() || 'New API';
  const slug = (systemName || 'newapi').toLowerCase().replace(/\s+/g, '-');
  useEffect(() => { document.title = `Codex | ${t('工具集成')}`; }, [t]);

  const cfg = `[model_providers.${slug}]
name = "${systemName || 'NewAPI'}"
base_url = "${serverAddress}/v1"
env_key = "NEWAPI_API_KEY"
wire_api = "responses"
requires_openai_auth = false
request_max_retries = 4
stream_max_retries = 10
stream_idle_timeout_ms = 300000

[profiles.${slug}]
model = "gpt-5-codex"
model_provider = "${slug}"`;

  return (
    <article>
      <h1>Codex (OpenAI) <span className='docs-tag'>CLI</span></h1>
      <p>
        {t('OpenAI 官方 AI 编程代理，支持 GPT 系列与 o 系列模型。本平台 OpenAI 协议入口为')} <code>{serverAddress}/v1</code>。
      </p>

      <h2 id='setup'>{t('配置步骤')}</h2>

      <StepCard step={1} title={<>{t('编辑配置文件')} <code>~/.codex/config.toml</code></>}>
        <p style={{ color: 'var(--docs-text-3)' }}>
          {t('添加自定义 model_provider 与 profile（如文件不存在请新建）：')}
        </p>
        <CodeBlock lang='toml' code={cfg}>{cfg}</CodeBlock>
        <p style={{ color: 'var(--docs-text-3)' }}>
          {t('其中 model 可替换为本平台支持的任意 OpenAI 协议模型；wire_api 使用 responses 协议以匹配 Codex CLI 的原生事件流。')}
        </p>
      </StepCard>

      <StepCard step={2} title={t('导出 API Key 环境变量')}>
        <p style={{ color: 'var(--docs-text-3)' }}>
          {t('env_key 指向的环境变量值即为本平台令牌，可写入')} <code>~/.bashrc</code> / <code>~/.zshrc</code> {t('持久化：')}
        </p>
        <CodeBlock lang='bash' code='export NEWAPI_API_KEY="sk-xxxxxxxxxxxxxxxx"'>{`export NEWAPI_API_KEY="sk-xxxxxxxxxxxxxxxx"`}</CodeBlock>
      </StepCard>

      <StepCard step={3} title={t('启动 Codex CLI')}>
        <p style={{ color: 'var(--docs-text-3)' }}>
          {t('使用上面定义的 profile 启动，或通过 -c 临时指定 provider：')}
        </p>
        <CodeBlock lang='bash' code={`# ${t('使用 profile 启动（推荐）')}
codex --profile ${slug}

# ${t('或临时指定 provider 与模型')}
codex -c model_provider='"${slug}"' -c model='"gpt-5-codex"'`}>{`# ${t('使用 profile 启动（推荐）')}
codex --profile ${slug}

# ${t('或临时指定 provider 与模型')}
codex -c model_provider='"${slug}"' -c model='"gpt-5-codex"'`}</CodeBlock>
      </StepCard>
    </article>
  );
};

export default ToolsCodex;
