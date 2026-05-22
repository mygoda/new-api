import React, { useEffect, useContext } from 'react';
import HeroSection from '../components/HeroSection';
import FeatureGrid from '../components/FeatureGrid';
import CodeGroup from '../components/CodeGroup';
import { useServerAddress } from '../hooks';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../../context/Status';
import { getSystemName } from '../../../helpers/utils';
import { Link } from 'react-router-dom';

const Home = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  const [statusState] = useContext(StatusContext);
  const systemName = statusState?.status?.system_name || getSystemName() || 'New API';

  useEffect(() => {
    document.title = `${systemName} ${t('API 文档')}`;
  }, [systemName, t]);

  const installBlocks = [
    { label: 'Python', lang: 'bash', code: 'pip install openai' },
    { label: 'Node.js', lang: 'bash', code: 'npm install openai' },
    { label: 'cURL', lang: 'bash', code: '# 无需安装，直接使用 curl 命令' },
  ];

  const requestBlocks = [
    {
      label: 'Python',
      lang: 'python',
      code: `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${serverAddress}/v1"
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "user", "content": "Hello from ${systemName}!"}
    ]
)

print(response.choices[0].message.content)`,
    },
    {
      label: 'Node.js',
      lang: 'javascript',
      code: `import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: "YOUR_API_KEY",
  baseURL: "${serverAddress}/v1"
});

const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello from ${systemName}!" }]
});

console.log(response.choices[0].message.content);`,
    },
    {
      label: 'cURL',
      lang: 'bash',
      code: `curl ${serverAddress}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello from ${systemName}!"}]
  }'`,
    },
  ];

  return (
    <div>
      <HeroSection />
      <FeatureGrid />

      <div className='docs-body'>
        <h2 id='quick-start'>{t('快速上手')}</h2>

        <h3 id='install-sdk'>{t('安装 SDK')}</h3>
        <CodeGroup blocks={installBlocks} />

        <h3 id='first-request'>{t('发送第一个请求')}</h3>
        <CodeGroup blocks={requestBlocks} />

        <h2 id='supported-models'>{t('支持的模型')}</h2>
        <table>
          <thead>
            <tr>
              <th>{t('类型')}</th>
              <th>{t('模型')}</th>
              <th>{t('描述')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('聊天')}</td>
              <td>GPT-4o · Claude · Gemini · DeepSeek · 通义千问</td>
              <td>{t('支持多轮对话、工具调用、流式输出、视觉输入')}</td>
            </tr>
            <tr>
              <td>{t('嵌入')}</td>
              <td>text-embedding-3-small / large</td>
              <td>{t('用于 RAG、语义检索等场景')}</td>
            </tr>
            <tr>
              <td>{t('图像')}</td>
              <td>GPT Image · DALL-E · Midjourney · Gemini Image</td>
              <td>{t('文生图、图像编辑与变体')}</td>
            </tr>
            <tr>
              <td>{t('音频')}</td>
              <td>TTS · Whisper</td>
              <td>{t('文字转语音 / 语音识别 / 翻译')}</td>
            </tr>
            <tr>
              <td>{t('视频')}</td>
              <td>Kling · Sora · Seedance 2.0</td>
              <td>{t('文生视频、图生视频、首尾帧、参考图视频')}</td>
            </tr>
          </tbody>
        </table>

        <h2 id='why'>{t('为什么选择')} {systemName}？</h2>
        <ul>
          <li>
            <b>{t('统一接口')}</b>：{t('一个 API Key 即可访问多个模型和多模态能力。')}
          </li>
          <li>
            <b>{t('完善文档')}</b>：{t('从快速开始到 API 速查，结构化呈现，便于团队协作。')}
          </li>
          <li>
            <b>{t('快速接入')}</b>：{t('默认使用 OpenAI 兼容接口，对现有业务侵入低。')}
          </li>
          <li>
            <b>{t('多模态全覆盖')}</b>：{t('聊天 / 嵌入 / 图像 / 音频 / 视频 / 音乐 / 实时一站式支持。')}
          </li>
        </ul>

        <div className='docs-banner'>
          <div className='docs-banner-title'>{t('下一步')}</div>
          <div>
            <Link to='/docs/guide/getting-started'>{t('快速开始')}</Link>{' · '}
            <Link to='/docs/api/chat'>{t('查看完整 API 参考')}</Link>{' · '}
            <Link to='/marketplace'>{t('浏览模型广场')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
