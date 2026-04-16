import React, { useContext, useState } from 'react';
import {
  Typography,
  Card,
  Collapse,
  Tag,
  Anchor,
  TabPane,
  Tabs,
} from '@douyinfe/semi-ui';
import {
  IconCode,
  IconServer,
  IconKey,
  IconHelpCircle,
  IconTerminal,
  IconList,
  IconArrowRight,
} from '@douyinfe/semi-icons';
import { StatusContext } from '../../context/Status';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { Link } from 'react-router-dom';
import { copy, showSuccess } from '../../helpers';

const { Title, Paragraph, Text } = Typography;

const CodeBlock = ({ children, onCopy }) => (
  <div className='relative group'>
    <pre className='bg-semi-color-fill-0 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed border border-semi-color-border'>
      <code>{children}</code>
    </pre>
    {onCopy && (
      <button
        onClick={onCopy}
        className='absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded text-xs bg-semi-color-fill-2 hover:bg-semi-color-fill-1 text-semi-color-text-2'
      >
        Copy
      </button>
    )}
  </div>
);

const StepCard = ({ step, title, children }) => (
  <div className='flex gap-4 mb-6'>
    <div className='flex-shrink-0 w-8 h-8 rounded-full bg-[var(--semi-color-primary)] flex items-center justify-center text-white font-bold text-sm'>
      {step}
    </div>
    <div className='flex-1 min-w-0'>
      <Title heading={6} className='!mb-2'>
        {title}
      </Title>
      <div className='text-semi-color-text-1'>{children}</div>
    </div>
  </div>
);

const ToolCard = ({ icon, title, description, tags }) => (
  <Card className='!mb-3 hover:shadow-md transition-shadow' bodyStyle={{ padding: '16px 20px' }}>
    <div className='flex items-start gap-3'>
      <div className='flex-shrink-0 mt-0.5 text-[var(--semi-color-primary)]'>
        {icon}
      </div>
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-2 mb-1 flex-wrap'>
          <Text strong>{title}</Text>
          {tags?.map((tag) => (
            <Tag key={tag} size='small' color='blue' type='light'>
              {tag}
            </Tag>
          ))}
        </div>
        <Text type='tertiary' size='small'>
          {description}
        </Text>
      </div>
    </div>
  </Card>
);

const Docs = () => {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const isMobile = useIsMobile();
  const serverAddress =
    statusState?.status?.server_address || `${window.location.origin}`;
  const systemName = statusState?.status?.system_name || 'New API';

  const handleCopy = async (text) => {
    const ok = await copy(text);
    if (ok) showSuccess(t('已复制到剪切板'));
  };

  const anchorLinks = [
    { href: '#quick-start', title: t('快速开始') },
    { href: '#api-examples', title: t('API 调用示例') },
    { href: '#tools', title: t('支持的工具') },
    { href: '#models', title: t('模型列表') },
    { href: '#faq', title: t('常见问题') },
  ];

  return (
    <div className='mt-[60px] px-4 md:px-8 pb-16'>
      <div className='max-w-7xl mx-auto flex gap-8'>
        {/* 左侧 Anchor 导航 — 桌面端 */}
        {!isMobile && (
          <div className='hidden lg:block w-48 flex-shrink-0'>
            <div className='sticky top-[80px]'>
              <Anchor
                railTheme='tertiary'
                style={{ width: 180 }}
              >
                {anchorLinks.map((link) => (
                  <Anchor.Link
                    key={link.href}
                    href={link.href}
                    title={link.title}
                  />
                ))}
              </Anchor>
            </div>
          </div>
        )}

        {/* 主内容区 */}
        <div className='flex-1 min-w-0 max-w-4xl'>
          {/* Hero */}
          <div className='mb-10 pt-4'>
            <Title heading={2} className='!mb-3'>
              {systemName} {t('使用文档')}
            </Title>
            <Paragraph type='tertiary' className='text-base'>
              {t('本平台提供稳定高效的 AI 模型 API 中转服务，支持 OpenAI、Claude、Gemini 等主流模型，兼容 OpenAI API 格式，可直接对接各类 AI 工具。')}
            </Paragraph>
            <div className='mt-4 flex items-center gap-2 flex-wrap'>
              <Tag color='blue' size='large' type='light'>
                OpenAI {t('兼容')}
              </Tag>
              <Tag color='green' size='large' type='light'>
                {t('按量计费')}
              </Tag>
              <Tag color='purple' size='large' type='light'>
                {t('多模型支持')}
              </Tag>
            </div>
          </div>

          {/* ─── 快速开始 ─── */}
          <section id='quick-start' className='mb-12 scroll-mt-20'>
            <Title heading={3} className='!mb-6 flex items-center gap-2'>
              <IconArrowRight size='small' />
              {t('快速开始')}
            </Title>

            <Card className='!mb-6'>
              <StepCard step={1} title={t('注册账号')}>
                <Paragraph>
                  {t('访问平台首页，点击注册按钮创建账号。注册完成后登录进入控制台。')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={t('获取额度')}>
                <Paragraph>
                  {t('进入')}{' '}
                  <Link to='/console/topup' className='!text-[var(--semi-color-primary)]'>
                    {t('钱包充值')}
                  </Link>{' '}
                  {t('页面，选择合适的充值方式获取调用额度。')}
                </Paragraph>
              </StepCard>

              <StepCard step={3} title={t('创建令牌')}>
                <Paragraph>
                  {t('进入')}{' '}
                  <Link to='/console/token' className='!text-[var(--semi-color-primary)]'>
                    {t('令牌管理')}
                  </Link>{' '}
                  {t('页面，创建 API 令牌。建议为不同用途创建独立令牌，便于管理和追踪用量。')}
                </Paragraph>
              </StepCard>

              <StepCard step={4} title={t('配置 API 地址')}>
                <Paragraph className='!mb-3'>
                  {t('将以下地址配置为你的 API Base URL：')}
                </Paragraph>
                <div
                  className='flex items-center gap-2 bg-semi-color-fill-0 rounded-lg px-4 py-3 border border-semi-color-border cursor-pointer hover:border-[var(--semi-color-primary)] transition-colors'
                  onClick={() => handleCopy(serverAddress)}
                >
                  <IconServer className='text-[var(--semi-color-primary)]' />
                  <Text copyable={{ onCopy: () => handleCopy(serverAddress) }} className='font-mono text-sm'>
                    {serverAddress}
                  </Text>
                </div>
              </StepCard>
            </Card>
          </section>

          {/* ─── API 调用示例 ─── */}
          <section id='api-examples' className='mb-12 scroll-mt-20'>
            <Title heading={3} className='!mb-6 flex items-center gap-2'>
              <IconCode size='small' />
              {t('API 调用示例')}
            </Title>

            <Paragraph type='tertiary' className='!mb-4'>
              {t('本平台完全兼容 OpenAI API 格式，只需替换 Base URL 和 API Key 即可使用。')}
            </Paragraph>

            <Tabs type='line'>
              <TabPane tab='curl' itemKey='curl'>
                <div className='mt-4'>
                  <CodeBlock onCopy={() => handleCopy(`curl ${serverAddress}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`)}>
                    {`curl ${serverAddress}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`}
                  </CodeBlock>
                </div>
              </TabPane>

              <TabPane tab='Python' itemKey='python'>
                <div className='mt-4'>
                  <CodeBlock onCopy={() => handleCopy(`from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${serverAddress}/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)`)}>
                    {`from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${serverAddress}/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)`}
                  </CodeBlock>
                </div>
              </TabPane>

              <TabPane tab='Node.js' itemKey='nodejs'>
                <div className='mt-4'>
                  <CodeBlock onCopy={() => handleCopy(`import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'YOUR_API_KEY',
  baseURL: '${serverAddress}/v1',
});

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
});

console.log(response.choices[0].message.content);`)}>
                    {`import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'YOUR_API_KEY',
  baseURL: '${serverAddress}/v1',
});

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
});

console.log(response.choices[0].message.content);`}
                  </CodeBlock>
                </div>
              </TabPane>
            </Tabs>
          </section>

          {/* ─── 支持的工具 ─── */}
          <section id='tools' className='mb-12 scroll-mt-20'>
            <Title heading={3} className='!mb-6 flex items-center gap-2'>
              <IconTerminal size='small' />
              {t('支持的工具')}
            </Title>

            <Paragraph type='tertiary' className='!mb-6'>
              {t('本平台兼容 OpenAI API 格式，以下工具只需配置 API 地址和密钥即可接入。将示例中的')} <Text code>YOUR_API_KEY</Text> {t('替换为你在')}{' '}
              <Link to='/console/token' className='!text-[var(--semi-color-primary)]'>{t('令牌管理')}</Link>{' '}
              {t('中创建的令牌。')}
            </Paragraph>

            {/* ── Claude Code ── */}
            <Title heading={4} className='!mb-4 !mt-8'>
              Claude Code
              <Tag size='small' color='blue' type='light' className='!ml-2'>CLI</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('Anthropic 官方 AI 编程助手。通过配置文件即可将请求转发到本平台，需要完成以下两步配置。')}
            </Paragraph>

            <div className='!mb-6'>
              {/* Step 1 */}
              <Title heading={5} className='!mb-3 !mt-4'>
                Step 1: {t('配置')} <Text code>settings.json</Text>
              </Title>
              <Paragraph type='tertiary' className='!mb-2'>
                {t('编辑配置文件')} <Text code>~/.claude/settings.json</Text>（Windows: <Text code>%USERPROFILE%\.claude\settings.json</Text>），{t('写入以下内容：')}
              </Paragraph>
              <CodeBlock onCopy={() => handleCopy(`{
  "env": {
    "ANTHROPIC_BASE_URL": "${serverAddress}",
    "ANTHROPIC_API_KEY": "sk-xxxxxxxxxxxxxxxx",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "ANTHROPIC_MODEL": "claude-sonnet-4-20250514",
    "CLAUDE_CODE_MAX_MODEL": "claude-sonnet-4-20250514",
    "CLAUDE_CODE_BUDGET_MODEL": "claude-sonnet-4-20250514"
  }
}`)}>
                {`{
  "env": {
    "ANTHROPIC_BASE_URL": "${serverAddress}",
    "ANTHROPIC_API_KEY": "sk-xxxxxxxxxxxxxxxx",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "ANTHROPIC_MODEL": "claude-sonnet-4-20250514",
    "CLAUDE_CODE_MAX_MODEL": "claude-sonnet-4-20250514",
    "CLAUDE_CODE_BUDGET_MODEL": "claude-sonnet-4-20250514"
  }
}`}
              </CodeBlock>
              <Paragraph type='tertiary' className='!mt-2 !mb-1' size='small'>
                {t('参数说明：')}
              </Paragraph>
              <ul className='list-disc list-inside text-sm text-[var(--semi-color-text-2)] space-y-1 ml-2 mb-4'>
                <li><Text code>ANTHROPIC_BASE_URL</Text> — {t('API 中转地址，指向本平台')}</li>
                <li><Text code>ANTHROPIC_API_KEY</Text> — {t('在')}{' '}
                  <Link to='/console/token' className='!text-[var(--semi-color-primary)]'>{t('令牌管理')}</Link>{' '}
                  {t('中创建的密钥')}</li>
                <li><Text code>API_TIMEOUT_MS</Text> — {t('请求超时时间（毫秒），建议设置较大值以支持长时间任务')}</li>
                <li><Text code>CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC</Text> — {t('禁用非必要流量，减少额外请求')}</li>
                <li><Text code>ANTHROPIC_MODEL</Text> — {t('默认使用的模型，可按需修改为平台支持的其他模型')}</li>
                <li><Text code>CLAUDE_CODE_MAX_MODEL</Text> / <Text code>CLAUDE_CODE_BUDGET_MODEL</Text> — {t('高性能/经济模式对应的模型')}</li>
              </ul>

              {/* Step 2 */}
              <Title heading={5} className='!mb-3 !mt-6'>
                Step 2: {t('跳过登录引导')}
              </Title>
              <Paragraph type='tertiary' className='!mb-2'>
                {t('编辑')} <Text code>~/.claude.json</Text>（Windows: <Text code>%USERPROFILE%\.claude.json</Text>），{t('写入以下内容以跳过官方登录流程：')}
              </Paragraph>
              <CodeBlock onCopy={() => handleCopy(`{
  "hasCompletedOnboarding": true
}`)}>
                {`{
  "hasCompletedOnboarding": true
}`}
              </CodeBlock>
              <Paragraph type='tertiary' className='!mt-3'>
                {t('完成以上两步后，在终端执行')} <Text code>claude</Text> {t('即可启动 Claude Code 并自动连接本平台。')}
              </Paragraph>
            </div>

            {/* ── Codex (OpenAI) ── */}
            <Title heading={4} className='!mb-4 !mt-10'>
              Codex (OpenAI)
              <Tag size='small' color='blue' type='light' className='!ml-2'>CLI</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('OpenAI 官方 AI 编程代理。通过环境变量配置 API 中转地址，支持 GPT-4o、o3 等模型。')}
            </Paragraph>

            <Tabs type='line' className='!mb-6'>
              <TabPane tab={t('环境变量（推荐）')} itemKey='codex-env'>
                <div className='mt-4'>
                  <Paragraph type='tertiary' className='!mb-3'>
                    {t('在终端中执行以下命令，或添加到')} <Text code>~/.bashrc</Text> / <Text code>~/.zshrc</Text> {t('中持久化：')}
                  </Paragraph>
                  <CodeBlock onCopy={() => handleCopy(`# ${t('设置 API 中转地址')}
export OPENAI_BASE_URL=${serverAddress}/v1

# ${t('设置 API 密钥')}
export OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx

# ${t('启动 Codex')}
codex`)}>
                    {`# ${t('设置 API 中转地址')}
export OPENAI_BASE_URL=${serverAddress}/v1

# ${t('设置 API 密钥')}
export OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx

# ${t('启动 Codex')}
codex`}
                  </CodeBlock>
                </div>
              </TabPane>

              <TabPane tab={t('配置文件')} itemKey='codex-config'>
                <div className='mt-4'>
                  <Paragraph type='tertiary' className='!mb-3'>
                    {t('编辑')} <Text code>~/.codex/config.json</Text>，{t('添加以下配置：')}
                  </Paragraph>
                  <CodeBlock onCopy={() => handleCopy(`{
  "apiBaseUrl": "${serverAddress}/v1",
  "apiKey": "sk-xxxxxxxxxxxxxxxx"
}`)}>
                    {`{
  "apiBaseUrl": "${serverAddress}/v1",
  "apiKey": "sk-xxxxxxxxxxxxxxxx"
}`}
                  </CodeBlock>
                </div>
              </TabPane>
            </Tabs>

            {/* ── Cursor ── */}
            <Title heading={4} className='!mb-4 !mt-10'>
              Cursor
              <Tag size='small' color='green' type='light' className='!ml-2'>IDE</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('AI 代码编辑器，内置 AI 对话和代码补全功能。')}
            </Paragraph>

            <Card className='!mb-6'>
              <StepCard step={1} title={t('打开设置')}>
                <Paragraph>
                  {t('打开 Cursor，点击左上角齿轮图标 → Settings → Models')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={t('配置 OpenAI API Key')}>
                <Paragraph>
                  {t('在 OpenAI API Key 输入框中填入你的令牌：')}
                </Paragraph>
                <div className='mt-2'>
                  <CodeBlock>sk-xxxxxxxxxxxxxxxx</CodeBlock>
                </div>
              </StepCard>

              <StepCard step={3} title={t('配置 Base URL')}>
                <Paragraph>
                  {t('点击 "Override OpenAI Base URL"，填入：')}
                </Paragraph>
                <div className='mt-2'>
                  <CodeBlock onCopy={() => handleCopy(`${serverAddress}/v1`)}>{`${serverAddress}/v1`}</CodeBlock>
                </div>
              </StepCard>

              <StepCard step={4} title={t('选择模型并使用')}>
                <Paragraph>
                  {t('在模型列表中选择需要的模型（如 gpt-4o、claude-sonnet-4-20250514），即可在 Chat 和 Composer 中使用。')}
                </Paragraph>
              </StepCard>
            </Card>

            {/* ── VS Code / Continue ── */}
            <Title heading={4} className='!mb-4 !mt-10'>
              VS Code — Continue
              <Tag size='small' color='green' type='light' className='!ml-2'>IDE {t('插件')}</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('Continue 是开源 AI 代码助手插件，支持 VS Code 和 JetBrains。')}
            </Paragraph>

            <Card className='!mb-4'>
              <StepCard step={1} title={t('安装插件')}>
                <Paragraph>
                  {t('在 VS Code 扩展市场搜索 "Continue" 并安装。')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={t('编辑配置文件')}>
                <Paragraph className='!mb-2'>
                  {t('打开配置文件')} <Text code>~/.continue/config.json</Text>，{t('修改 models 部分：')}
                </Paragraph>
                <CodeBlock onCopy={() => handleCopy(`{
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
}`)}>
                  {`{
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
}`}
                </CodeBlock>
              </StepCard>

              <StepCard step={3} title={t('使用')}>
                <Paragraph>
                  {t('按')} <Text code>Ctrl+L</Text> / <Text code>Cmd+L</Text> {t('打开对话面板，选择模型即可开始使用。')}
                </Paragraph>
              </StepCard>
            </Card>

            {/* ── VS Code / Cline ── */}
            <Title heading={4} className='!mb-4 !mt-10'>
              VS Code — Cline
              <Tag size='small' color='green' type='light' className='!ml-2'>IDE {t('插件')}</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('Cline 是自主 AI 编程代理插件，可自动读写文件、执行命令。')}
            </Paragraph>

            <Card className='!mb-4'>
              <StepCard step={1} title={t('安装插件')}>
                <Paragraph>
                  {t('在 VS Code 扩展市场搜索 "Cline" 并安装。')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={t('配置 API')}>
                <Paragraph className='!mb-2'>
                  {t('打开 Cline 侧边栏 → 点击设置齿轮图标：')}
                </Paragraph>
                <div className='bg-semi-color-fill-0 rounded-lg p-4 border border-semi-color-border text-sm space-y-2'>
                  <div><Text strong>{t('API Provider')}：</Text><Text>OpenAI Compatible</Text></div>
                  <div><Text strong>Base URL：</Text><Text code>{serverAddress}/v1</Text></div>
                  <div><Text strong>API Key：</Text><Text code>sk-xxxxxxxxxxxxxxxx</Text></div>
                  <div><Text strong>Model：</Text><Text code>claude-sonnet-4-20250514</Text></div>
                </div>
              </StepCard>

              <StepCard step={3} title={t('使用')}>
                <Paragraph>
                  {t('在 Cline 面板中输入任务描述，AI 会自动完成编码、调试等工作。')}
                </Paragraph>
              </StepCard>
            </Card>

            {/* ── Cherry Studio / ChatBox / NextChat ── */}
            <Title heading={4} className='!mb-4 !mt-10'>
              {t('通用桌面客户端')}
              <Tag size='small' color='purple' type='light' className='!ml-2'>{t('桌面端')}</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('以下客户端均支持 OpenAI API 兼容格式，配置方法类似。')}
            </Paragraph>

            <Tabs type='line' className='!mb-6'>
              <TabPane tab='Cherry Studio' itemKey='cherry'>
                <div className='mt-4'>
                  <Card>
                    <StepCard step={1} title={t('打开设置')}>
                      <Paragraph>{t('点击左下角设置 → 模型服务')}</Paragraph>
                    </StepCard>
                    <StepCard step={2} title={t('添加服务商')}>
                      <Paragraph>{t('点击 "添加服务商" → 选择 "OpenAI API 兼容"')}</Paragraph>
                    </StepCard>
                    <StepCard step={3} title={t('填写配置')}>
                      <div className='bg-semi-color-fill-0 rounded-lg p-4 border border-semi-color-border text-sm space-y-2'>
                        <div><Text strong>{t('名称')}：</Text><Text>{systemName}</Text></div>
                        <div><Text strong>API URL：</Text><Text code>{serverAddress}/v1</Text></div>
                        <div><Text strong>API Key：</Text><Text code>sk-xxxxxxxxxxxxxxxx</Text></div>
                      </div>
                    </StepCard>
                    <StepCard step={4} title={t('获取模型列表')}>
                      <Paragraph>{t('点击 "获取模型列表" 按钮，自动拉取可用模型。选择模型后即可开始对话。')}</Paragraph>
                    </StepCard>
                  </Card>
                </div>
              </TabPane>

              <TabPane tab='ChatBox' itemKey='chatbox'>
                <div className='mt-4'>
                  <Card>
                    <StepCard step={1} title={t('打开设置')}>
                      <Paragraph>{t('点击左下角设置 → AI 模型提供商')}</Paragraph>
                    </StepCard>
                    <StepCard step={2} title={t('选择 OpenAI API')}>
                      <Paragraph>{t('选择 "OpenAI API"，填写以下配置：')}</Paragraph>
                      <div className='bg-semi-color-fill-0 rounded-lg p-4 border border-semi-color-border text-sm space-y-2 mt-2'>
                        <div><Text strong>API Host：</Text><Text code>{serverAddress}/v1</Text></div>
                        <div><Text strong>API Key：</Text><Text code>sk-xxxxxxxxxxxxxxxx</Text></div>
                        <div><Text strong>Model：</Text><Text code>gpt-4o</Text></div>
                      </div>
                    </StepCard>
                    <StepCard step={3} title={t('保存并使用')}>
                      <Paragraph>{t('点击保存，返回对话页面即可使用。')}</Paragraph>
                    </StepCard>
                  </Card>
                </div>
              </TabPane>

              <TabPane tab='NextChat' itemKey='nextchat'>
                <div className='mt-4'>
                  <Card>
                    <StepCard step={1} title={t('打开设置')}>
                      <Paragraph>{t('点击左下角设置图标')}</Paragraph>
                    </StepCard>
                    <StepCard step={2} title={t('填写配置')}>
                      <div className='bg-semi-color-fill-0 rounded-lg p-4 border border-semi-color-border text-sm space-y-2'>
                        <div><Text strong>{t('接口地址')}：</Text><Text code>{serverAddress}</Text></div>
                        <div><Text strong>API Key：</Text><Text code>sk-xxxxxxxxxxxxxxxx</Text></div>
                        <div><Text strong>{t('自定义模型名')}：</Text><Text code>gpt-4o,claude-sonnet-4-20250514</Text></div>
                      </div>
                    </StepCard>
                    <StepCard step={3} title={t('使用')}>
                      <Paragraph>{t('返回对话页面，在模型选择器中切换模型。')}</Paragraph>
                    </StepCard>
                  </Card>
                </div>
              </TabPane>
            </Tabs>
          </section>

          {/* ─── 模型列表 ─── */}
          <section id='models' className='mb-12 scroll-mt-20'>
            <Title heading={3} className='!mb-6 flex items-center gap-2'>
              <IconList size='small' />
              {t('模型列表')}
            </Title>

            <Card bodyStyle={{ textAlign: 'center', padding: '32px 20px' }}>
              <Paragraph className='!mb-4'>
                {t('平台支持 OpenAI、Claude、Gemini、DeepSeek、通义千问等多家模型厂商，具体可用模型及定价请查看模型广场。')}
              </Paragraph>
              <Link to='/pricing'>
                <button className='px-6 py-2 rounded-lg bg-[var(--semi-color-primary)] text-white hover:opacity-90 transition-opacity'>
                  {t('查看模型广场')} →
                </button>
              </Link>
            </Card>
          </section>

          {/* ─── 常见问题 ─── */}
          <section id='faq' className='mb-12 scroll-mt-20'>
            <Title heading={3} className='!mb-6 flex items-center gap-2'>
              <IconHelpCircle size='small' />
              {t('常见问题')}
            </Title>

            <Collapse accordion>
              <Collapse.Panel
                header={t('API 地址是什么？')}
                itemKey='1'
              >
                <Paragraph>
                  {t('本平台的 API 地址为')}{' '}
                  <Text code onClick={() => handleCopy(serverAddress)} style={{ cursor: 'pointer' }}>
                    {serverAddress}
                  </Text>
                  {t('，兼容 OpenAI API 格式。在各工具中将 Base URL / API Endpoint 配置为此地址即可。')}
                </Paragraph>
              </Collapse.Panel>

              <Collapse.Panel
                header={t('支持哪些模型？')}
                itemKey='2'
              >
                <Paragraph>
                  {t('支持 GPT-4o、GPT-4、Claude 3.5/4、Gemini 2.0、DeepSeek V3/R1、通义千问等主流模型。具体列表请查看')}{' '}
                  <Link to='/pricing' className='!text-[var(--semi-color-primary)]'>
                    {t('模型广场')}
                  </Link>
                  。
                </Paragraph>
              </Collapse.Panel>

              <Collapse.Panel
                header={t('如何获取 API Key？')}
                itemKey='3'
              >
                <Paragraph>
                  {t('注册登录后，进入')}{' '}
                  <Link to='/console/token' className='!text-[var(--semi-color-primary)]'>
                    {t('令牌管理')}
                  </Link>{' '}
                  {t('页面，点击"新建令牌"即可生成。支持设置额度限制、有效期和可用模型范围。')}
                </Paragraph>
              </Collapse.Panel>

              <Collapse.Panel
                header={t('计费方式是什么？')}
                itemKey='4'
              >
                <Paragraph>
                  {t('按照实际调用的 Token 数量计费，不同模型倍率不同。充值后额度实时扣减，可在控制台查看用量明细。')}
                </Paragraph>
              </Collapse.Panel>

              <Collapse.Panel
                header={t('与 OpenAI 官方 API 有什么区别？')}
                itemKey='5'
              >
                <Paragraph>
                  {t('接口格式完全兼容 OpenAI API，只需更换 Base URL 和 Key。额外支持 Claude、Gemini 等非 OpenAI 模型，使用同一个 Key 即可调用所有模型。')}
                </Paragraph>
              </Collapse.Panel>

              <Collapse.Panel
                header={t('令牌(Token)和密钥(Key)有什么区别？')}
                itemKey='6'
              >
                <Paragraph>
                  {t('令牌是本平台分配的 API Key，以 sk- 开头。您可以创建多个令牌用于不同项目，每个令牌可独立设置额度和模型权限。')}
                </Paragraph>
              </Collapse.Panel>
            </Collapse>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Docs;
