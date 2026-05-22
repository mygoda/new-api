import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CodeGroup from '../../components/CodeGroup';
import { useServerAddress } from '../../hooks';

const Examples = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();

  useEffect(() => {
    document.title = `${t('代码示例')} | ${t('API 文档')}`;
  }, [t]);

  const chatBlocks = [
    {
      label: 'cURL',
      lang: 'bash',
      code: `curl ${serverAddress}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
    },
    {
      label: 'Python',
      lang: 'python',
      code: `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${serverAddress}/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`,
    },
    {
      label: 'Node.js',
      lang: 'javascript',
      code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "YOUR_API_KEY",
  baseURL: "${serverAddress}/v1"
});

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }]
});
console.log(response.choices[0].message.content);`,
    },
  ];

  const streamBlocks = [
    {
      label: 'Python',
      lang: 'python',
      code: `from openai import OpenAI
client = OpenAI(api_key="YOUR_API_KEY", base_url="${serverAddress}/v1")

stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Tell me a joke."}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")`,
    },
    {
      label: 'Node.js',
      lang: 'javascript',
      code: `import OpenAI from "openai";
const client = new OpenAI({ apiKey: "YOUR_API_KEY", baseURL: "${serverAddress}/v1" });

const stream = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Tell me a joke." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}`,
    },
    {
      label: 'cURL',
      lang: 'bash',
      code: `curl ${serverAddress}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Tell me a joke."}],
    "stream": true
  }'`,
    },
  ];

  const visionBlocks = [
    {
      label: 'Python',
      lang: 'python',
      code: `from openai import OpenAI
client = OpenAI(api_key="YOUR_API_KEY", base_url="${serverAddress}/v1")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "What's in this image?"},
            {"type": "image_url", "image_url": {"url": "https://example.com/cat.jpg"}}
        ]
    }]
)
print(response.choices[0].message.content)`,
    },
    {
      label: 'cURL',
      lang: 'bash',
      code: `curl ${serverAddress}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image?"},
        {"type": "image_url", "image_url": {"url": "https://example.com/cat.jpg"}}
      ]
    }]
  }'`,
    },
  ];

  return (
    <article>
      <h1>{t('代码示例')}</h1>
      <p>{t('以下示例覆盖最常用的调用场景，可直接复制后替换 YOUR_API_KEY 使用。')}</p>

      <h2 id='basic'>{t('基础对话')}</h2>
      <CodeGroup blocks={chatBlocks} />

      <h2 id='stream'>{t('流式响应')}</h2>
      <p>{t('对于聊天 / 推理场景建议开启流式输出，能显著降低首字延迟。')}</p>
      <CodeGroup blocks={streamBlocks} />

      <h2 id='vision'>{t('视觉理解 / 多模态')}</h2>
      <p>{t('GPT-4o、Claude 3.5+、Gemini 2.0+ 等模型支持图像输入。')}</p>
      <CodeGroup blocks={visionBlocks} />
    </article>
  );
};

export default Examples;
