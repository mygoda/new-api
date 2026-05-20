import React, { useContext, useState } from 'react';
import {
  Typography,
  Card,
  Collapse,
  Tag,
  Anchor,
  TabPane,
  Tabs,
  Banner,
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

const methodColor = {
  GET: 'green',
  POST: 'blue',
  PUT: 'orange',
  DELETE: 'red',
  WS: 'purple',
};

const EndpointRow = ({ method, path, desc, onCopy }) => (
  <div className='flex items-start gap-3 py-2 border-b border-semi-color-border last:border-0'>
    <Tag color={methodColor[method] || 'grey'} size='small' className='!min-w-[48px] !text-center !font-mono'>
      {method}
    </Tag>
    <div className='flex-1 min-w-0'>
      <Text
        code
        className='!text-[13px] break-all cursor-pointer'
        onClick={() => onCopy?.(path)}
      >
        {path}
      </Text>
      <div className='text-xs text-semi-color-text-2 mt-1'>{desc}</div>
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
  const configuredServerAddress = statusState?.status?.server_address || '';
  const serverAddressMissing = !configuredServerAddress;
  const serverAddress = configuredServerAddress || 'https://your-domain.com';
  const systemName = statusState?.status?.system_name || 'New API';

  const handleCopy = async (text) => {
    const ok = await copy(text);
    if (ok) showSuccess(t('已复制到剪切板'));
  };

  const anchorLinks = [
    { href: '#quick-start', title: t('快速开始') },
    { href: '#api-examples', title: t('API 调用示例') },
    { href: '#api-reference', title: t('API 参考') },
    { href: '#tools', title: t('支持的工具') },
    { href: '#models', title: t('模型列表') },
    { href: '#faq', title: t('常见问题') },
  ];

  // 构造 API 参考章节使用的 endpoint + 示例数据
  const apiSections = [
    {
      key: 'ref-chat',
      label: t('聊天'),
      endpoints: [
        {
          method: 'POST',
          path: '/v1/chat/completions',
          desc: t('OpenAI 格式对话补全，支持流式、工具调用、视觉输入。'),
          body: `{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": false,
  "temperature": 0.7
}`,
        },
        {
          method: 'POST',
          path: '/v1/responses',
          desc: t('OpenAI Responses 新格式，支持有状态对话、内置工具、推理参数。'),
          body: `{
  "model": "gpt-4o",
  "input": "Tell me a haiku about programming.",
  "stream": false
}`,
        },
        {
          method: 'POST',
          path: '/v1/messages',
          desc: t('Anthropic Claude 原生格式，可直接对接 Claude SDK / Claude Code。'),
          body: `{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "Hello, Claude" }
  ]
}`,
        },
        {
          method: 'POST',
          path: '/v1beta/models/{model}:generateContent',
          urlPath: '/v1beta/models/gemini-2.0-flash:generateContent',
          desc: t('Google Gemini 原生格式（非流式），路径中 {model} 需替换为具体模型名。'),
          body: `{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "Hello, Gemini!" }]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 1024
  }
}`,
        },
        {
          method: 'POST',
          path: '/v1beta/models/{model}:streamGenerateContent',
          urlPath: '/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse',
          desc: t('Google Gemini 原生格式（流式 SSE）。请求体与非流式一致，URL 加上 ?alt=sse 即可。'),
          body: `{
  "contents": [
    { "role": "user", "parts": [{ "text": "Hello, Gemini!" }] }
  ]
}`,
        },
      ],
    },
    {
      key: 'ref-embeddings',
      label: t('嵌入'),
      endpoints: [
        {
          method: 'POST',
          path: '/v1/embeddings',
          desc: t('OpenAI 格式文本向量嵌入，可用于语义检索、RAG 等场景。input 支持字符串或字符串数组。'),
          body: `{
  "model": "text-embedding-3-small",
  "input": "The food was delicious and the service was excellent."
}`,
        },
      ],
    },
    {
      key: 'ref-image',
      label: t('图像'),
      endpoints: [
        {
          method: 'POST',
          path: '/v1/images/generations',
          desc: t('OpenAI 格式文生图（DALL-E / gpt-image 等）。'),
          body: `{
  "model": "dall-e-3",
  "prompt": "A cute cat wearing sunglasses, photorealistic",
  "n": 1,
  "size": "1024x1024",
  "response_format": "url"
}`,
        },
        {
          method: 'POST',
          path: '/v1/images/edits',
          desc: t('OpenAI 格式图像编辑，请求为 multipart/form-data。'),
          formData: [
            'image=@/path/to/source.png',
            'mask=@/path/to/mask.png',
            'prompt=Replace the sky with northern lights',
            'model=dall-e-2',
            'n=1',
            'size=1024x1024',
          ],
        },
        {
          method: 'POST',
          path: '/v1/images/variations',
          desc: t('OpenAI 格式图像变体生成，请求为 multipart/form-data。'),
          formData: [
            'image=@/path/to/source.png',
            'model=dall-e-2',
            'n=1',
            'size=1024x1024',
          ],
        },
        {
          method: 'POST',
          path: '/mj/submit/imagine',
          desc: t('Midjourney Proxy 创建 imagine 绘图任务，botType 可选 MID_JOURNEY / NIJI_JOURNEY。'),
          body: `{
  "prompt": "Cat with hat, cinematic lighting --ar 16:9 --v 6",
  "botType": "MID_JOURNEY",
  "notifyHook": "",
  "state": ""
}`,
        },
        {
          method: 'POST',
          path: '/mj/submit/change',
          desc: t('Midjourney Proxy 执行 U/V/Reroll 等后续动作，taskId 与 customId 由 imagine 任务返回。'),
          body: `{
  "taskId": "1742700000000000",
  "action": "UPSCALE",
  "index": 1,
  "customId": "MJ::JOB::upsample::1::xxxxxxxx",
  "notifyHook": ""
}`,
        },
        {
          method: 'GET',
          path: '/mj/task/{id}/fetch',
          urlPath: '/mj/task/1742700000000000/fetch',
          desc: t('查询 Midjourney 任务状态与结果图，无请求体。'),
        },
      ],
    },
    {
      key: 'ref-audio',
      label: t('音频'),
      endpoints: [
        {
          method: 'POST',
          path: '/v1/audio/speech',
          desc: t('文本转语音 (TTS)，返回音频流（MP3 / WAV / Opus 等）。'),
          body: `{
  "model": "tts-1",
  "input": "Hello, this is a text to speech test.",
  "voice": "alloy",
  "response_format": "mp3"
}`,
          curlExtra: '--output speech.mp3',
        },
        {
          method: 'POST',
          path: '/v1/audio/transcriptions',
          desc: t('语音转文字，请求为 multipart/form-data，支持多语言自动识别。'),
          formData: [
            'file=@/path/to/audio.mp3',
            'model=whisper-1',
            'response_format=json',
          ],
        },
        {
          method: 'POST',
          path: '/v1/audio/translations',
          desc: t('将任意语种语音翻译为英文文本，请求为 multipart/form-data。'),
          formData: ['file=@/path/to/audio.mp3', 'model=whisper-1'],
        },
      ],
    },
    {
      key: 'ref-rerank',
      label: t('重排'),
      endpoints: [
        {
          method: 'POST',
          path: '/v1/rerank',
          desc: t('文档相关性重排序，兼容 Jina / Cohere / Xinference 等服务商格式。'),
          body: `{
  "model": "jina-reranker-v2-base-multilingual",
  "query": "What is the capital of France?",
  "documents": [
    "Paris is the capital of France.",
    "Tokyo is the capital of Japan.",
    "London is in the United Kingdom."
  ],
  "top_n": 2,
  "return_documents": true
}`,
        },
      ],
    },
    {
      key: 'ref-realtime',
      label: t('实时'),
      endpoints: [
        {
          method: 'WS',
          path: '/v1/realtime',
          urlPath: '/v1/realtime?model=gpt-4o-realtime-preview',
          desc: t('OpenAI Realtime WebSocket，支持低延迟双向语音对话。建立连接后通过 JSON 消息交互。'),
          customExample: `# ${t('使用 wscat 连接（需要 npm i -g wscat）')}
wscat -c "${(serverAddress || '').replace(/^https?:/, 'wss:').replace(/^http:/, 'ws:')}/v1/realtime?model=gpt-4o-realtime-preview" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "OpenAI-Beta: realtime=v1"`,
        },
      ],
    },
    {
      key: 'ref-music',
      label: t('音乐'),
      endpoints: [
        {
          method: 'POST',
          path: '/suno/submit/music',
          desc: t('Suno API 生成歌曲。描述模式只填 gpt_description_prompt；自定义模式填 prompt 作为歌词、title、tags。'),
          body: `{
  "gpt_description_prompt": "A relaxing piano lullaby for sleep",
  "make_instrumental": true,
  "mv": "chirp-v3-5",
  "tags": "",
  "title": "",
  "prompt": ""
}`,
        },
        {
          method: 'POST',
          path: '/suno/submit/lyrics',
          desc: t('Suno API 生成歌词。'),
          body: `{
  "prompt": "A song about morning coffee"
}`,
        },
        {
          method: 'GET',
          path: '/suno/fetch/{id}',
          urlPath: '/suno/fetch/abcd1234efgh',
          desc: t('查询 Suno 任务状态与生成结果（含 audio_url / video_url / 歌词）。无请求体。'),
        },
      ],
    },
    {
      key: 'ref-video',
      label: t('视频'),
      endpoints: [
        {
          method: 'POST',
          path: '/v1/video/generations',
          desc: t('创建文生视频 / 图生视频任务（兼容 Kling / Sora / 即梦 等格式）。image 字段为可选输入图（URL 或 Base64）。'),
          body: `{
  "model": "kling-v1",
  "prompt": "Astronaut walking on the moon, cinematic shot",
  "duration": 5.0,
  "width": 1024,
  "height": 1024,
  "fps": 30,
  "n": 1,
  "response_format": "url"
}`,
        },
        {
          method: 'GET',
          path: '/v1/video/generations/{id}',
          urlPath: '/v1/video/generations/abcd1234efgh',
          desc: t('查询视频任务状态与下载地址。无请求体。'),
        },
      ],
    },
    {
      key: 'ref-seedance',
      label: t('Seedance 2.0'),
      intro: (
        <div className='space-y-3'>
          <Banner
            type='info'
            closeIcon={null}
            description={
              <div className='space-y-1 text-sm'>
                <div>
                  {t(
                    '火山方舟 Doubao Seedance 2.0 系列(2.0 / 2.0-fast / 1.5-pro / 1.0-pro 等)接入,统一走 /v1/video/generations 异步任务,兼容 OpenAI Video 协议。',
                  )}
                </div>
                <div>
                  {t('支持')}
                  <Text code>{t('文生视频')}</Text>
                  {t(' / ')}
                  <Text code>{t('图生视频(首帧)')}</Text>
                  {t(' / ')}
                  <Text code>{t('首尾帧')}</Text>
                  {t(' / ')}
                  <Text code>{t('多模态参考(1~9 图 + 0~3 视频 + 0~3 音频)')}</Text>
                  {t('。')}
                </div>
              </div>
            }
          />
          <Card bodyStyle={{ padding: 12 }}>
            <Title heading={6} className='!mb-2'>
              {t('请求字段速查')}
            </Title>
            <div className='overflow-auto'>
              <table className='w-full text-xs'>
                <thead className='text-left text-semi-color-text-2'>
                  <tr>
                    <th className='py-1 pr-3'>{t('字段')}</th>
                    <th className='py-1 pr-3'>{t('类型')}</th>
                    <th className='py-1'>{t('说明')}</th>
                  </tr>
                </thead>
                <tbody className='[&>tr]:border-t [&>tr]:border-semi-color-border [&>tr>td]:py-1.5 [&>tr>td]:pr-3'>
                  <tr><td><Text code>model</Text></td><td>string</td><td>{t('如 doubao-seedance-2-0-260128 或 Dreamina-Seedance-2.0(别名)')}</td></tr>
                  <tr><td><Text code>prompt</Text></td><td>string</td><td>{t('文本提示词。中/英/日/印尼/西/葡;中文建议 ≤500 字')}</td></tr>
                  <tr><td><Text code>image</Text></td><td>string</td><td>{t('单图首帧 URL/Base64。i2v 模式使用')}</td></tr>
                  <tr><td><Text code>images[]</Text></td><td>string[]</td><td>{t('多张图(首尾帧或参考图,1~9 张),配合 image_roles 用')}</td></tr>
                  <tr><td><Text code>image_roles[]</Text></td><td>string[]</td><td>{t('与 images 等长。first_frame / last_frame / reference_image')}</td></tr>
                  <tr><td><Text code>videos[]</Text></td><td>string[]</td><td>{t('参考视频 URL,0~3 段,总时长 ≤15s。Seedance 2.0 系列')}</td></tr>
                  <tr><td><Text code>audios[]</Text></td><td>string[]</td><td>{t('参考音频 URL,0~3 段,总时长 ≤15s。Seedance 2.0 系列')}</td></tr>
                  <tr><td><Text code>metadata.resolution</Text></td><td>string</td><td>{t('480p / 720p(默认) / 1080p(2.0-fast 不支持 1080p)')}</td></tr>
                  <tr><td><Text code>metadata.ratio</Text></td><td>string</td><td>{t('16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9 / adaptive(默认)')}</td></tr>
                  <tr><td><Text code>metadata.duration</Text></td><td>int</td><td>{t('时长(秒)。Seedance 2.0 [4,15] 或 -1 智能;1.5/1.0 [2,12]')}</td></tr>
                  <tr><td><Text code>metadata.frames</Text></td><td>int</td><td>{t('帧数(优先级高于 duration)。25+4n 格式,范围 [29,289]。Seedance 2.0/1.5 暂不支持')}</td></tr>
                  <tr><td><Text code>metadata.seed</Text></td><td>int</td><td>{t('随机种子,-1=随机,[-1, 2^32-1]')}</td></tr>
                  <tr><td><Text code>metadata.generate_audio</Text></td><td>bool</td><td>{t('生成同步音频。Seedance 2.0/1.5 pro 默认 true')}</td></tr>
                  <tr><td><Text code>metadata.return_last_frame</Text></td><td>bool</td><td>{t('返回尾帧 PNG。可作下一段视频首帧实现长视频拼接')}</td></tr>
                  <tr><td><Text code>metadata.draft</Text></td><td>bool</td><td>{t('样片模式(仅 1.5 pro)。生成低画质预览,价格更低')}</td></tr>
                  <tr><td><Text code>metadata.camera_fixed</Text></td><td>bool</td><td>{t('固定镜头。参考图场景 / Seedance 2.0 不支持')}</td></tr>
                  <tr><td><Text code>metadata.watermark</Text></td><td>bool</td><td>{t('生成视频是否带水印,默认 false')}</td></tr>
                  <tr><td><Text code>metadata.tools[]</Text></td><td>object[]</td><td>{t('工具调用,目前仅 [{"type":"web_search"}]。仅 Seedance 2.0 系列')}</td></tr>
                  <tr><td><Text code>metadata.safety_identifier</Text></td><td>string</td><td>{t('终端用户唯一标识(≤64 字符英文),便于平台溯源')}</td></tr>
                  <tr><td><Text code>metadata.execution_expires_after</Text></td><td>int</td><td>{t('任务超时秒数,默认 172800(48h),范围 [3600,259200]')}</td></tr>
                  <tr><td><Text code>callback_url</Text></td><td>string</td><td>{t('回调通知 URL,任务状态变化时 POST 推送')}</td></tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ),
      endpoints: [
        {
          id: 'seedance-t2v',
          title: t('① 文生视频 (Text → Video)'),
          method: 'POST',
          path: '/v1/video/generations',
          desc: t('纯文本生成视频。最常用,无需上传素材。'),
          body: `{
  "model": "doubao-seedance-2-0-260128",
  "prompt": "小猫对着镜头打哈欠,温暖阳光氛围,慢镜头",
  "metadata": {
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5,
    "generate_audio": true,
    "watermark": false,
    "seed": -1
  }
}`,
        },
        {
          id: 'seedance-i2v',
          title: t('② 图生视频 - 单图首帧'),
          method: 'POST',
          path: '/v1/video/generations',
          desc: t('基于一张图作首帧生成视频。images=[首帧URL],image_roles=["first_frame"](可省略,默认即首帧)。'),
          body: `{
  "model": "doubao-seedance-2-0-260128",
  "prompt": "镜头从静止变为推近,主角缓缓抬头",
  "images": ["https://your-cdn.com/first.png"],
  "image_roles": ["first_frame"],
  "metadata": {
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5
  }
}`,
        },
        {
          id: 'seedance-keyframes',
          title: t('③ 首尾帧 (First + Last Frame)'),
          method: 'POST',
          path: '/v1/video/generations',
          desc: t('两张图分别作首尾帧,模型补全中间过渡。仅 Seedance 1.5 pro 与 2.0 系列支持。'),
          body: `{
  "model": "doubao-seedance-2-0-260128",
  "prompt": "猫从地面跃起,优雅落地",
  "images": [
    "https://your-cdn.com/first.png",
    "https://your-cdn.com/last.png"
  ],
  "image_roles": ["first_frame", "last_frame"],
  "metadata": {
    "resolution": "1080p",
    "duration": 5
  }
}`,
        },
        {
          id: 'seedance-refs',
          title: t('④ 多模态参考 (1~9 图 + 0~3 视频 + 0~3 音频)'),
          method: 'POST',
          path: '/v1/video/generations',
          desc: t('Seedance 2.0 独有。混合上传参考素材;参考图 role=reference_image,视频 role 自动 reference_video,音频自动 reference_audio。不可仅上传音频。'),
          body: `{
  "model": "doubao-seedance-2-0-260128",
  "prompt": "结合参考素材,镜头慢推",
  "images": [
    "https://your-cdn.com/ref-a.png",
    "https://your-cdn.com/ref-b.png"
  ],
  "image_roles": ["reference_image", "reference_image"],
  "videos": ["https://your-cdn.com/ref.mp4"],
  "audios": ["https://your-cdn.com/voice.wav"],
  "metadata": {
    "resolution": "720p",
    "ratio": "adaptive",
    "duration": 5
  }
}`,
        },
        {
          id: 'seedance-tools',
          title: t('⑤ 联网搜索 + 安全标识 + 回调'),
          method: 'POST',
          path: '/v1/video/generations',
          desc: t('启用联网搜索增强时效性(仅 Seedance 2.0 系列);safety_identifier 上报终端用户便于平台风控;callback_url 接收任务状态变化推送。'),
          body: `{
  "model": "doubao-seedance-2-0-260128",
  "prompt": "今天上海的天气与天际线,实拍质感",
  "callback_url": "https://your-server.com/seedance/callback",
  "metadata": {
    "resolution": "720p",
    "duration": 5,
    "tools": [{"type": "web_search"}],
    "safety_identifier": "sha256(user-12345)",
    "execution_expires_after": 7200,
    "return_last_frame": true
  }
}`,
        },
        {
          id: 'seedance-fetch',
          title: t('⑥ 查询任务状态与结果'),
          method: 'GET',
          path: '/v1/video/generations/{task_id}',
          urlPath: '/v1/video/generations/task_xxxxxxxxxxxx',
          desc: t('返回 OpenAI Video 格式;status=completed 时 metadata.url 即视频地址,metadata.last_frame_url 是尾帧(如开启),metadata.web_search_count 是联网搜索实际次数(如启用 tools)。'),
        },
      ],
      outro: (
        <div className='mt-4 space-y-3'>
          <Card bodyStyle={{ padding: 12 }}>
            <Title heading={6} className='!mb-2'>
              {t('查询响应示例 (status=completed)')}
            </Title>
            <CodeBlock>{`{
  "id": "task_xxxxxxxxxxxx",
  "task_id": "task_xxxxxxxxxxxx",
  "object": "video",
  "model": "doubao-seedance-2-0-260128",
  "status": "completed",
  "progress": 100,
  "created_at": 1778681488,
  "completed_at": 1778681597,
  "metadata": {
    "url": "https://...mp4?X-Tos-...",
    "last_frame_url": "https://...png?X-Tos-...",
    "web_search_count": 2
  }
}`}</CodeBlock>
            <Paragraph type='tertiary' size='small' className='!mt-2 !mb-0'>
              {t('上游返回的 URL 含临时签名(默认 24h 过期);如需长期持有请尽快下载或开启「镜像上游 URL」让 new-api 自动镜像到对象存储。')}
            </Paragraph>
          </Card>

          <Card bodyStyle={{ padding: 12 }}>
            <Title heading={6} className='!mb-2'>
              {t('素材限制')}
            </Title>
            <div className='text-xs space-y-1 text-semi-color-text-1'>
              <div>{t('• 单图: jpeg/png/webp/bmp/tiff/gif(+ Seedance 1.5 pro & 2.0 支持 heic/heif);宽高 [300,6000] px;宽高比 [0.4, 2.5];≤30 MB(URL/Base64)')}</div>
              <div>{t('• 单视频: mp4/mov,分辨率 480p/720p/1080p,时长 [2,15]s,总时长 ≤15s,单文件 ≤50 MB')}</div>
              <div>{t('• 单音频: wav/mp3,时长 [2,15]s,总时长 ≤15s,单文件 ≤15 MB')}</div>
              <div>{t('• 请求体总和 ≤64 MB(Base64 编码场景);URL 方式无此限制')}</div>
              <div>{t('• 多模态参考最多 9 图 + 3 视频 + 3 音频,不可仅传音频')}</div>
            </div>
          </Card>

          <Card bodyStyle={{ padding: 12 }}>
            <Title heading={6} className='!mb-2'>
              {t('计费(按 token,新 API 已统一换算)')}
            </Title>
            <div className='text-xs space-y-1 text-semi-color-text-1'>
              <div>{t('token = (输入视频时长 + 输出视频时长) × 宽 × 高 × 24 / 1024,以上游 usage.completion_tokens 为准。')}</div>
              <div>{t('• Seedance 2.0:480p/720p 无视频 46 元/M;含视频 28 元/M;1080p 无视频 51 元/M;1080p 含视频 31 元/M')}</div>
              <div>{t('• Seedance 2.0-fast:无视频 37 元/M;含视频 22 元/M(不支持 1080p)')}</div>
              <div>{t('• Seedance 1.5-pro:有声 16 元/M;无声 8 元/M;Draft 折算 0.6(有声) / 0.35(无声)')}</div>
              <div>{t('• 仅对成功生成的视频计费,失败/审核未通过不扣费')}</div>
              <div>{t('• admin 可在「分组与模型定价设置 → 价格设置」内按维度组合配条件分价')}</div>
            </div>
          </Card>

          <Card bodyStyle={{ padding: 12 }}>
            <Title heading={6} className='!mb-2'>
              {t('快速三步上手')}
            </Title>
            <div className='text-xs space-y-1 text-semi-color-text-1'>
              <div>{t('1. POST /v1/video/generations 创建任务,拿到 task_id')}</div>
              <div>{t('2. 客户端轮询 GET /v1/video/generations/{task_id},或者监听 callback_url 推送(避免轮询)')}</div>
              <div>{t('3. status=completed 时从 metadata.url 下载视频')}</div>
            </div>
          </Card>
        </div>
      ),
      endpoints_help: '',
    },
  ];

  const renderApiPanel = (ep) => {
    const fullUrl = `${serverAddress}${ep.urlPath || ep.path}`;
    let curl;
    if (ep.customExample) {
      curl = ep.customExample;
    } else if (ep.formData && ep.formData.length > 0) {
      curl = `curl -X ${ep.method} "${fullUrl}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
${ep.formData.map((f) => `  -F "${f}"`).join(' \\\n')}`;
    } else if (ep.body) {
      curl = `curl -X ${ep.method} "${fullUrl}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${ep.body}'${ep.curlExtra ? ` \\\n  ${ep.curlExtra}` : ''}`;
    } else {
      curl = `curl -X ${ep.method} "${fullUrl}" \\
  -H "Authorization: Bearer YOUR_API_KEY"`;
    }

    return (
      <Collapse.Panel
        key={ep.id || ep.path}
        itemKey={ep.id || ep.path}
        header={
          <div className='flex items-start gap-3 w-full'>
            <Tag
              color={methodColor[ep.method] || 'grey'}
              size='small'
              className='!min-w-[48px] !text-center !font-mono'
            >
              {ep.method}
            </Tag>
            <div className='flex-1 min-w-0'>
              {ep.title && (
                <div className='font-semibold text-[13px] mb-0.5'>
                  {ep.title}
                </div>
              )}
              <Text code className='!text-[13px] break-all'>
                {ep.path}
              </Text>
              <div className='text-xs text-semi-color-text-2 mt-1'>{ep.desc}</div>
            </div>
          </div>
        }
      >
        <div className='space-y-3'>
          {ep.body && (
            <div>
              <div className='text-xs font-semibold mb-1 text-[var(--semi-color-text-2)]'>
                {t('请求体示例')}
              </div>
              <CodeBlock onCopy={() => handleCopy(ep.body)}>{ep.body}</CodeBlock>
            </div>
          )}
          {ep.formData && ep.formData.length > 0 && (
            <Paragraph type='tertiary' size='small'>
              {t('请求为 multipart/form-data，无 JSON 请求体；详见下方 cURL 示例。')}
            </Paragraph>
          )}
          <div>
            <div className='text-xs font-semibold mb-1 text-[var(--semi-color-text-2)]'>
              cURL
            </div>
            <CodeBlock onCopy={() => handleCopy(curl)}>{curl}</CodeBlock>
          </div>
        </div>
      </Collapse.Panel>
    );
  };

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

          {serverAddressMissing && (
            <Banner
              type='warning'
              fullMode={false}
              closeIcon={null}
              className='!mb-6'
              title={t('尚未配置服务器地址')}
              description={t(
                '管理员尚未在「系统设置 → 服务器地址」中配置 API 中转地址，下方示例使用占位地址 https://your-domain.com，请配置后再查看完整示例。',
              )}
            />
          )}

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

          {/* ─── API 参考 ─── */}
          <section id='api-reference' className='mb-12 scroll-mt-20'>
            <Title heading={3} className='!mb-6 flex items-center gap-2'>
              <IconKey size='small' />
              {t('API 参考')}
            </Title>

            <Paragraph type='tertiary' className='!mb-4'>
              {t('本平台支持多种主流 API 格式。所有接口前缀统一为')}{' '}
              <Text
                code
                onClick={() => handleCopy(serverAddress)}
                style={{ cursor: 'pointer' }}
              >
                {serverAddress}
              </Text>
              {t('。生产环境请使用 HTTPS 以保护令牌。')}
            </Paragraph>

            <Paragraph type='tertiary' className='!mb-6'>
              {t('鉴权方式：在请求头中添加')}{' '}
              <Text code>Authorization: Bearer YOUR_API_KEY</Text>
              {t('，YOUR_API_KEY 为')}{' '}
              <Link
                to='/console/token'
                className='!text-[var(--semi-color-primary)]'
              >
                {t('令牌管理')}
              </Link>
              {t('中创建的以 sk- 开头的令牌。')}
            </Paragraph>

            <Tabs type='line' className='!mb-4'>
              {apiSections.map((section) => (
                <TabPane
                  key={section.key}
                  tab={section.label}
                  itemKey={section.key}
                >
                  {section.intro && (
                    <div className='mb-3'>{section.intro}</div>
                  )}
                  <Collapse className='!mt-3' keepDOM={false}>
                    {section.endpoints.map((ep) => renderApiPanel(ep))}
                  </Collapse>
                  {section.outro && (
                    <div className='mt-4'>{section.outro}</div>
                  )}
                </TabPane>
              ))}
            </Tabs>

            <Paragraph type='tertiary' size='small' className='!mt-4'>
              {t('以上为常用端点摘要。完整的请求参数、响应结构与在线调试请参考官方接口文档：')}
              <a
                href='https://docs.newapi.ai/api/'
                target='_blank'
                rel='noreferrer'
                className='!text-[var(--semi-color-primary)] !ml-1'
              >
                docs.newapi.ai/api
              </a>
              {' · '}
              <a
                href='https://apifox.newapi.ai/'
                target='_blank'
                rel='noreferrer'
                className='!text-[var(--semi-color-primary)]'
              >
                apifox.newapi.ai
              </a>
            </Paragraph>
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

            {/* ── 分组：CLI 编程代理 ── */}
            <div className='mt-8 mb-4 flex items-center gap-2'>
              <div className='h-[2px] flex-1 bg-[var(--semi-color-fill-1)]' />
              <Tag color='blue' size='large' shape='circle'>
                {t('CLI 编程代理')}
              </Tag>
              <div className='h-[2px] flex-1 bg-[var(--semi-color-fill-1)]' />
            </div>

            {/* ── Claude Code ── */}
            <Title heading={4} className='!mb-3 !mt-6'>
              Claude Code
              <Tag size='small' color='blue' type='light' className='!ml-2'>CLI</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('Anthropic 官方 AI 编程助手。本平台兼容 Anthropic API，配置完成后可使用平台支持的所有模型（含 Claude / GPT / Gemini 等通过 Anthropic 协议访问）。')}
            </Paragraph>

            <Banner
              type='warning'
              fullMode={false}
              closeIcon={null}
              className='!mb-4'
              title={t('使用前请清除冲突的环境变量')}
              description={
                <div>
                  {t('环境变量优先级高于配置文件。请先确保以下变量未被设置（若曾在 ~/.bashrc / ~/.zshrc 中永久导出，需同步删除对应行）：')}
                  <div className='mt-2 ml-2 text-sm'>
                    <Text code>ANTHROPIC_AUTH_TOKEN</Text> · <Text code>ANTHROPIC_API_KEY</Text> · <Text code>ANTHROPIC_BASE_URL</Text>
                  </div>
                  <CodeBlock>{`unset ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY ANTHROPIC_BASE_URL`}</CodeBlock>
                </div>
              }
            />

            <Card className='!mb-4'>
              <StepCard step={1} title={t('安装 Claude Code')}>
                <Paragraph>
                  {t('参考')}{' '}
                  <a
                    href='https://docs.claude.com/en/docs/claude-code/setup'
                    target='_blank'
                    rel='noreferrer'
                    className='!text-[var(--semi-color-primary)]'
                  >
                    {t('Claude Code 官方安装文档')}
                  </a>{' '}
                  {t('完成基础安装。')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={<>{t('编辑')} <Text code>~/.claude/settings.json</Text></>}>
                <Paragraph type='tertiary' className='!mb-2'>
                  Windows: <Text code>%USERPROFILE%\.claude\settings.json</Text>
                </Paragraph>
                <CodeBlock onCopy={() => handleCopy(`{
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
}`)}>
                  {`{
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
}`}
                </CodeBlock>
                <ul className='list-disc list-inside text-sm text-[var(--semi-color-text-2)] space-y-1 mt-3 ml-2'>
                  <li><Text code>ANTHROPIC_BASE_URL</Text> — {t('指向本平台 API 中转地址')}</li>
                  <li><Text code>ANTHROPIC_AUTH_TOKEN</Text> — {t('在')}{' '}
                    <Link to='/console/token' className='!text-[var(--semi-color-primary)]'>{t('令牌管理')}</Link>{' '}
                    {t('中创建的密钥（以 sk- 开头）')}</li>
                  <li><Text code>API_TIMEOUT_MS</Text> — {t('请求超时（毫秒），建议设大以支持长时任务')}</li>
                  <li><Text code>CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC</Text> — {t('禁用非必要流量，减少额外请求')}</li>
                  <li><Text code>ANTHROPIC_MODEL</Text> {t('及')} <Text code>ANTHROPIC_DEFAULT_*_MODEL</Text> — {t('替换为本平台支持的模型，可在')}{' '}
                    <Link to='/marketplace' className='!text-[var(--semi-color-primary)]'>{t('模型广场')}</Link>{' '}
                    {t('查看完整列表')}</li>
                </ul>
              </StepCard>

              <StepCard step={3} title={<>{t('编辑')} <Text code>~/.claude.json</Text> {t('跳过登录引导')}</>}>
                <Paragraph type='tertiary' className='!mb-2'>
                  Windows: <Text code>%USERPROFILE%\.claude.json</Text>
                </Paragraph>
                <CodeBlock onCopy={() => handleCopy(`{
  "hasCompletedOnboarding": true
}`)}>
                  {`{
  "hasCompletedOnboarding": true
}`}
                </CodeBlock>
              </StepCard>

              <StepCard step={4} title={t('启动并验证')}>
                <Paragraph className='!mb-2'>
                  {t('在工作目录执行')} <Text code>claude</Text>，{t('选择「信任此文件夹」(Trust This Folder) 即可开始使用。可在 TUI 中输入以下 slash 命令验证：')}
                </Paragraph>
                <CodeBlock>{`/status   # 检查 ANTHROPIC_BASE_URL 指向本平台
/model    # 显示当前模型`}</CodeBlock>
              </StepCard>
            </Card>

            <Title heading={5} className='!mb-3 !mt-6'>
              {t('在 VS Code 插件中使用 Claude Code')}
            </Title>
            <Paragraph type='tertiary' className='!mb-3'>
              {t('在 VS Code 扩展市场搜索并安装 “Claude Code for VS Code”，然后通过插件设置写入与上方相同的环境变量：')}
            </Paragraph>
            <CodeBlock onCopy={() => handleCopy(`{
  "claudeCode.preferredLocation": "panel",
  "claudeCode.selectedModel": "claude-sonnet-4-20250514",
  "claudeCode.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "${serverAddress}" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "sk-xxxxxxxxxxxxxxxx" },
    { "name": "API_TIMEOUT_MS", "value": "3000000" },
    { "name": "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "value": "1" },
    { "name": "ANTHROPIC_MODEL", "value": "claude-sonnet-4-20250514" }
  ]
}`)}>
              {`{
  "claudeCode.preferredLocation": "panel",
  "claudeCode.selectedModel": "claude-sonnet-4-20250514",
  "claudeCode.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "${serverAddress}" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "sk-xxxxxxxxxxxxxxxx" },
    { "name": "API_TIMEOUT_MS", "value": "3000000" },
    { "name": "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "value": "1" },
    { "name": "ANTHROPIC_MODEL", "value": "claude-sonnet-4-20250514" }
  ]
}`}
            </CodeBlock>

            {/* ── Codex (OpenAI) ── */}
            <Title heading={4} className='!mb-3 !mt-10'>
              Codex (OpenAI)
              <Tag size='small' color='blue' type='light' className='!ml-2'>CLI</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('OpenAI 官方 AI 编程代理，支持 GPT 系列与 o 系列模型。本平台 OpenAI 协议入口为')} <Text code>{`${serverAddress}/v1`}</Text>。
            </Paragraph>

            <Card className='!mb-4'>
              <StepCard step={1} title={<>{t('编辑配置文件')} <Text code>~/.codex/config.toml</Text></>}>
                <Paragraph type='tertiary' className='!mb-2'>
                  {t('添加自定义 model_provider 与 profile（如文件不存在请新建）：')}
                </Paragraph>
                <CodeBlock onCopy={() => handleCopy(`[model_providers.${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}]
name = "${systemName || 'NewAPI'}"
base_url = "${serverAddress}/v1"
env_key = "NEWAPI_API_KEY"
wire_api = "responses"
requires_openai_auth = false
request_max_retries = 4
stream_max_retries = 10
stream_idle_timeout_ms = 300000

[profiles.${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}]
model = "gpt-5-codex"
model_provider = "${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}"`)}>
                  {`[model_providers.${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}]
name = "${systemName || 'NewAPI'}"
base_url = "${serverAddress}/v1"
env_key = "NEWAPI_API_KEY"
wire_api = "responses"
requires_openai_auth = false
request_max_retries = 4
stream_max_retries = 10
stream_idle_timeout_ms = 300000

[profiles.${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}]
model = "gpt-5-codex"
model_provider = "${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}"`}
                </CodeBlock>
                <Paragraph type='tertiary' className='!mt-2'>
                  {t('其中 model 可替换为本平台支持的任意 OpenAI 协议模型；wire_api 使用 responses 协议以匹配 Codex CLI 的原生事件流。')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={t('导出 API Key 环境变量')}>
                <Paragraph type='tertiary' className='!mb-2'>
                  {t('env_key 指向的环境变量值即为本平台令牌，可写入')} <Text code>~/.bashrc</Text> / <Text code>~/.zshrc</Text> {t('持久化：')}
                </Paragraph>
                <CodeBlock onCopy={() => handleCopy(`export NEWAPI_API_KEY="sk-xxxxxxxxxxxxxxxx"`)}>
                  {`export NEWAPI_API_KEY="sk-xxxxxxxxxxxxxxxx"`}
                </CodeBlock>
              </StepCard>

              <StepCard step={3} title={t('启动 Codex CLI')}>
                <Paragraph type='tertiary' className='!mb-2'>
                  {t('使用上面定义的 profile 启动，或通过 -c 临时指定 provider：')}
                </Paragraph>
                <CodeBlock onCopy={() => handleCopy(`# ${t('使用 profile 启动（推荐）')}
codex --profile ${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}

# ${t('或临时指定 provider 与模型')}
codex -c model_provider='"${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}"' -c model='"gpt-5-codex"'`)}>
                  {`# ${t('使用 profile 启动（推荐）')}
codex --profile ${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}

# ${t('或临时指定 provider 与模型')}
codex -c model_provider='"${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}"' -c model='"gpt-5-codex"'`}
                </CodeBlock>
              </StepCard>
            </Card>

            {/* ── OpenCode ── */}
            <Title heading={4} className='!mb-3 !mt-10'>
              OpenCode
              <Tag size='small' color='blue' type='light' className='!ml-2'>CLI</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('开源终端 AI 编程代理，支持自定义 Provider。本平台兼容 Anthropic 协议，可作为 OpenCode 的自定义 Provider 接入。')}
            </Paragraph>

            <Card className='!mb-4'>
              <StepCard step={1} title={t('安装 OpenCode')}>
                <Paragraph type='tertiary' className='!mb-2'>{t('使用脚本或 npm：')}</Paragraph>
                <CodeBlock>{`# ${t('脚本安装')}
curl -fsSL https://opencode.ai/install | bash

# ${t('或使用 npm')}
npm i -g opencode-ai`}</CodeBlock>
              </StepCard>

              <StepCard step={2} title={<>{t('编辑配置')} <Text code>~/.config/opencode/opencode.json</Text></>}>
                <Paragraph type='tertiary' className='!mb-2'>
                  {t('使用 Anthropic SDK Provider 接入本平台：')}
                </Paragraph>
                <CodeBlock onCopy={() => handleCopy(`{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}": {
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
}`)}>
                  {`{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "${(systemName || 'newapi').toLowerCase().replace(/\s+/g, '-')}": {
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
}`}
                </CodeBlock>
              </StepCard>

              <StepCard step={3} title={t('启动并选择模型')}>
                <Paragraph>
                  {t('在项目目录运行')} <Text code>opencode</Text>，{t('启动后输入')} <Text code>/models</Text> {t('选择刚配置的模型即可使用。')}
                </Paragraph>
              </StepCard>
            </Card>

            {/* ── OpenClaw ── */}
            <Title heading={4} className='!mb-3 !mt-10'>
              OpenClaw
              <Tag size='small' color='blue' type='light' className='!ml-2'>CLI</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('OpenClaw 通过 Gateway 接入第三方模型服务，本平台可作为 OpenAI 兼容 Provider 接入。')}
            </Paragraph>

            <Card className='!mb-4'>
              <StepCard step={1} title={t('安装 OpenClaw')}>
                <Tabs type='line'>
                  <TabPane tab='macOS / Linux' itemKey='openclaw-unix'>
                    <CodeBlock>{`curl -fsSL https://openclaw.bot/install.sh | bash`}</CodeBlock>
                  </TabPane>
                  <TabPane tab='Windows' itemKey='openclaw-win'>
                    <CodeBlock>{`iwr -useb https://openclaw.ai/install.ps1 | iex`}</CodeBlock>
                  </TabPane>
                </Tabs>
              </StepCard>

              <StepCard step={2} title={t('启动配置向导')}>
                <Paragraph>
                  {t('运行')} <Text code>openclaw configure</Text>，{t('依次选择：')}
                </Paragraph>
                <ul className='list-disc list-inside text-sm text-[var(--semi-color-text-2)] space-y-1 mt-2 ml-2'>
                  <li><Text strong>Gateway</Text> → <Text code>Local (this machine)</Text></li>
                  <li><Text strong>Sections to configure</Text> → <Text code>Model</Text></li>
                  <li><Text strong>Model/auth provider</Text> → {t('选择')} <Text code>OpenAI Compatible</Text> {t('（或 Custom Provider）')}</li>
                  <li><Text strong>Auth method</Text> → <Text code>API Key</Text></li>
                </ul>
              </StepCard>

              <StepCard step={3} title={t('填写本平台 API 信息')}>
                <div className='bg-semi-color-fill-0 rounded-lg p-4 border border-semi-color-border text-sm space-y-2'>
                  <div><Text strong>Base URL：</Text><Text code>{serverAddress}/v1</Text></div>
                  <div><Text strong>API Key：</Text><Text code>sk-xxxxxxxxxxxxxxxx</Text></div>
                  <div><Text strong>Default Model：</Text><Text code>gpt-4o</Text> {t('或其他平台支持的模型')}</div>
                </div>
              </StepCard>

              <StepCard step={4} title={t('验证')}>
                <Paragraph>
                  {t('执行')} <Text code>openclaw tui</Text>，{t('能正常对话即配置成功。')}
                </Paragraph>
              </StepCard>
            </Card>

            {/* ── 分组：IDE 编辑器 ── */}
            <div className='mt-12 mb-4 flex items-center gap-2'>
              <div className='h-[2px] flex-1 bg-[var(--semi-color-fill-1)]' />
              <Tag color='green' size='large' shape='circle'>
                {t('IDE 编辑器')}
              </Tag>
              <div className='h-[2px] flex-1 bg-[var(--semi-color-fill-1)]' />
            </div>

            {/* ── Cursor ── */}
            <Title heading={4} className='!mb-3 !mt-6'>
              Cursor
              <Tag size='small' color='green' type='light' className='!ml-2'>IDE</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('AI 代码编辑器，内置 Chat / Composer / Edit。本平台以 OpenAI 兼容协议接入 Cursor 自定义模型。')}
            </Paragraph>

            <Banner
              type='warning'
              fullMode={false}
              closeIcon={null}
              className='!mb-3'
              title={t('使用前请清除冲突的环境变量')}
              description={
                <span>
                  <Text code>OPENAI_API_KEY</Text> · <Text code>OPENAI_BASE_URL</Text> {t('若已设置可能影响 Cursor 的 API 调用，请先清除。')}
                </span>
              }
            />

            <Banner
              type='info'
              fullMode={false}
              closeIcon={null}
              className='!mb-3'
              title={t('已知限制')}
              description={
                <ul className='list-disc list-inside space-y-1 ml-2 text-sm'>
                  <li>{t('「Override OpenAI Base URL」是全局设置，开启后会作用于 Cursor 内所有 API Key（包括 Cursor 自带模型用的 Anthropic / GPT Key）。')}</li>
                  <li>{t('Cursor Tab 自动补全由 Cursor 官方模型驱动，自定义 API Key 不会接管 Tab，仅在 Chat / Composer / Edit 中生效。')}</li>
                  <li>{t('自定义模型仅 Cursor Pro 订阅可用，免费版会提示 “does not work with your current plan or api key”。')}</li>
                </ul>
              }
            />

            <Card className='!mb-4'>
              <StepCard step={1} title={t('打开模型设置')}>
                <Paragraph>
                  {t('Cursor → Settings → Models，展开 “API Keys” 部分。')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={t('启用 Override OpenAI Base URL')}>
                <Paragraph className='!mb-2'>
                  {t('勾选 “Override OpenAI Base URL”，在下方输入框填入：')}
                </Paragraph>
                <CodeBlock onCopy={() => handleCopy(`${serverAddress}/v1`)}>{`${serverAddress}/v1`}</CodeBlock>
              </StepCard>

              <StepCard step={3} title={t('填写并启用 OpenAI API Key')}>
                <Paragraph>
                  {t('在 OpenAI API Key 输入框填入')} <Text code>sk-xxxxxxxxxxxxxxxx</Text>，{t('点击右侧按钮，在弹窗中点击 “Enable OpenAI API Key” 完成验证。')}
                </Paragraph>
              </StepCard>

              <StepCard step={4} title={t('添加自定义模型')}>
                <Paragraph>
                  {t('Models 板块 → “View All Models” → “Add Custom Model”，输入想使用的模型名（如')} <Text code>claude-sonnet-4-20250514</Text>、<Text code>gpt-4o</Text>），{t('严格按平台支持的模型 ID 填写（注意大小写）。添加后点击启用。')}
                </Paragraph>
              </StepCard>

              <StepCard step={5} title={t('在 Chat 中选择并使用')}>
                <Paragraph>
                  {t('在聊天面板的模型选择器中选择刚添加的模型，即可开始使用。如出现模型无返回内容，可在 Cursor 设置中将 “Network” 改为 HTTP/1.0 重试。')}
                </Paragraph>
              </StepCard>
            </Card>

            {/* ── TRAE ── */}
            <Title heading={4} className='!mb-3 !mt-10'>
              TRAE
              <Tag size='small' color='green' type='light' className='!ml-2'>IDE</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('字节跳动出品的 AI 原生 IDE。除内置模型外，TRAE 支持通过 API Key 接入自定义 OpenAI 兼容服务商。')}
            </Paragraph>

            <Card className='!mb-4'>
              <StepCard step={1} title={t('安装 TRAE')}>
                <Paragraph>
                  {t('访问')}{' '}
                  <a
                    href='https://www.trae.cn/'
                    target='_blank'
                    rel='noreferrer'
                    className='!text-[var(--semi-color-primary)]'
                  >
                    TRAE 官网
                  </a>{' '}
                  {t('下载并完成初始设置与登录。')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={t('打开模型设置')}>
                <Paragraph>
                  {t('在 AI 对话框右上角点击 “设置” 图标，进入 “模型” 页签。')}
                </Paragraph>
              </StepCard>

              <StepCard step={3} title={t('添加自定义模型')}>
                <Paragraph className='!mb-2'>
                  {t('点击 “+ 添加模型”，服务商类型选择 “OpenAI”（或 “OpenAI 兼容”），按下表填写：')}
                </Paragraph>
                <div className='bg-semi-color-fill-0 rounded-lg p-4 border border-semi-color-border text-sm space-y-2'>
                  <div><Text strong>{t('服务商名称')}：</Text><Text>{systemName}</Text></div>
                  <div><Text strong>API Endpoint / Base URL：</Text><Text code>{`${serverAddress}/v1`}</Text></div>
                  <div><Text strong>API Key：</Text><Text code>sk-xxxxxxxxxxxxxxxx</Text></div>
                  <div><Text strong>{t('模型名')}：</Text><Text code>claude-sonnet-4-20250514</Text> / <Text code>gpt-4o</Text></div>
                </div>
                <Paragraph type='tertiary' size='small' className='!mt-2'>
                  {t('TRAE 在添加时会调用接口校验密钥有效性，若失败将显示错误信息，可据此排查。')}
                </Paragraph>
              </StepCard>
            </Card>

            {/* ── 分组：VS Code 插件 ── */}
            <div className='mt-12 mb-4 flex items-center gap-2'>
              <div className='h-[2px] flex-1 bg-[var(--semi-color-fill-1)]' />
              <Tag color='violet' size='large' shape='circle'>
                {t('VS Code 插件')}
              </Tag>
              <div className='h-[2px] flex-1 bg-[var(--semi-color-fill-1)]' />
            </div>

            {/* ── VS Code / Continue ── */}
            <Title heading={4} className='!mb-3 !mt-6'>
              Continue
              <Tag size='small' color='violet' type='light' className='!ml-2'>VS Code / JetBrains</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('开源 AI 代码助手插件，支持 VS Code 和 JetBrains。')}
            </Paragraph>

            <Card className='!mb-4'>
              <StepCard step={1} title={t('安装插件')}>
                <Paragraph>
                  {t('在 VS Code 扩展市场搜索 “Continue” 并安装。')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={<>{t('编辑配置')} <Text code>~/.continue/config.json</Text></>}>
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
                  {t('按')} <Text code>Ctrl+L</Text> / <Text code>Cmd+L</Text> {t('打开对话面板，选择模型即可。')}
                </Paragraph>
              </StepCard>
            </Card>

            {/* ── Cline ── */}
            <Title heading={4} className='!mb-3 !mt-10'>
              Cline
              <Tag size='small' color='violet' type='light' className='!ml-2'>VS Code</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('自主 AI 编程代理插件，可自动读写文件、执行命令。建议升级到 3.47.0 或更高版本，并在升级后重启插件与 VS Code。')}
            </Paragraph>

            <Banner
              type='warning'
              fullMode={false}
              closeIcon={null}
              className='!mb-3'
              title={t('使用前请清除冲突的环境变量')}
              description={
                <span>
                  <Text code>ANTHROPIC_AUTH_TOKEN</Text> · <Text code>ANTHROPIC_BASE_URL</Text> {t('若已设置请先清除。')}
                </span>
              }
            />

            <Card className='!mb-4'>
              <StepCard step={1} title={t('安装插件')}>
                <Paragraph>
                  {t('VS Code → 扩展 → 搜索 “Cline” → Install，安装完成后重启 VS Code。')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={t('打开 Cline 配置面板')}>
                <Paragraph>
                  {t('点击侧边栏 Cline 图标 → “Use your own API key” 进入参数配置。')}
                </Paragraph>
              </StepCard>

              <StepCard step={3} title={t('选择 Provider 并填写本平台信息')}>
                <div className='bg-semi-color-fill-0 rounded-lg p-4 border border-semi-color-border text-sm space-y-2'>
                  <div><Text strong>API Provider：</Text><Text>OpenAI Compatible</Text></div>
                  <div><Text strong>Base URL：</Text><Text code>{`${serverAddress}/v1`}</Text></div>
                  <div><Text strong>API Key：</Text><Text code>sk-xxxxxxxxxxxxxxxx</Text></div>
                  <div><Text strong>Model ID：</Text><Text code>claude-sonnet-4-20250514</Text> {t('或')} <Text code>gpt-4o</Text></div>
                </div>
                <Paragraph type='tertiary' size='small' className='!mt-2'>
                  {t('完成后点击右上角 Done 保存。建议在 Auto-approve 中勾选 Edit，以便 Cline 自动应用代码改动。')}
                </Paragraph>
              </StepCard>
            </Card>

            {/* ── Kilo Code ── */}
            <Title heading={4} className='!mb-3 !mt-10'>
              Kilo Code
              <Tag size='small' color='violet' type='light' className='!ml-2'>VS Code</Tag>
            </Title>
            <Paragraph className='!mb-3'>
              {t('Kilo Code 是 VS Code 中的 AI 编程插件，配置流程与 Cline 类似。')}
            </Paragraph>

            <Banner
              type='warning'
              fullMode={false}
              closeIcon={null}
              className='!mb-3'
              title={t('使用前请清除冲突的环境变量')}
              description={
                <span>
                  <Text code>ANTHROPIC_AUTH_TOKEN</Text> · <Text code>ANTHROPIC_BASE_URL</Text> {t('若已设置请先清除。')}
                </span>
              }
            />

            <Card className='!mb-4'>
              <StepCard step={1} title={t('安装插件')}>
                <Paragraph>
                  {t('VS Code → 扩展 → 搜索 “Kilo Code” → Install，安装完成后重启 VS Code。')}
                </Paragraph>
              </StepCard>

              <StepCard step={2} title={t('打开 Settings 配置面板')}>
                <Paragraph>
                  {t('点击 Kilo Code 侧栏的 Settings 按钮进入参数配置。')}
                </Paragraph>
              </StepCard>

              <StepCard step={3} title={t('填写本平台 API 信息')}>
                <div className='bg-semi-color-fill-0 rounded-lg p-4 border border-semi-color-border text-sm space-y-2'>
                  <div><Text strong>API Provider：</Text><Text>OpenAI Compatible</Text></div>
                  <div><Text strong>Base URL：</Text><Text code>{`${serverAddress}/v1`}</Text></div>
                  <div><Text strong>API Key：</Text><Text code>sk-xxxxxxxxxxxxxxxx</Text></div>
                  <div><Text strong>Model：</Text><Text code>claude-sonnet-4-20250514</Text> {t('或其他平台支持的模型')}</div>
                </div>
                <Paragraph type='tertiary' size='small' className='!mt-2'>
                  {t('依次点击右上角 Save 与 Done 保存配置，即可在 Kilo Code 中开始对话。')}
                </Paragraph>
              </StepCard>
            </Card>

            {/* ── 分组：桌面客户端 ── */}
            <div className='mt-12 mb-4 flex items-center gap-2'>
              <div className='h-[2px] flex-1 bg-[var(--semi-color-fill-1)]' />
              <Tag color='purple' size='large' shape='circle'>
                {t('桌面客户端')}
              </Tag>
              <div className='h-[2px] flex-1 bg-[var(--semi-color-fill-1)]' />
            </div>

            <Paragraph className='!mb-3 !mt-4'>
              {t('以下客户端均支持 OpenAI API 兼容格式，配置流程类似。')}
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
              <Link to='/marketplace'>
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
                  <Link to='/marketplace' className='!text-[var(--semi-color-primary)]'>
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
