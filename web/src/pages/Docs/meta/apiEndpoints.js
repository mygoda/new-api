/**
 * API endpoint data extracted from the original Docs page.
 * Each entry: { method, path, urlPath?, desc, body?, formData?, customExample?, curlExtra?, title?, id? }
 *
 * Server address is provided by the consuming page (so we don't lock in a value
 * at module-load time).
 */

export const chatEndpoints = [
  {
    method: 'POST',
    path: '/v1/chat/completions',
    desc: 'OpenAI 格式对话补全，支持流式、工具调用、视觉输入。',
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
    desc: 'OpenAI Responses 新格式，支持有状态对话、内置工具、推理参数。',
    body: `{
  "model": "gpt-4o",
  "input": "Tell me a haiku about programming.",
  "stream": false
}`,
  },
  {
    method: 'POST',
    path: '/v1/messages',
    desc: 'Anthropic Claude 原生格式，可直接对接 Claude SDK / Claude Code。',
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
    desc: 'Google Gemini 原生格式（非流式），路径中 {model} 需替换为具体模型名。',
    body: `{
  "contents": [
    { "role": "user", "parts": [{ "text": "Hello, Gemini!" }] }
  ],
  "generationConfig": { "temperature": 0.7, "maxOutputTokens": 1024 }
}`,
  },
  {
    method: 'POST',
    path: '/v1beta/models/{model}:streamGenerateContent',
    urlPath: '/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse',
    desc: 'Google Gemini 原生格式（流式 SSE）。请求体与非流式一致，URL 加上 ?alt=sse 即可。',
    body: `{
  "contents": [
    { "role": "user", "parts": [{ "text": "Hello, Gemini!" }] }
  ]
}`,
  },
];

export const embeddingsEndpoints = [
  {
    method: 'POST',
    path: '/v1/embeddings',
    desc: 'OpenAI 格式文本向量嵌入，可用于语义检索、RAG 等场景。input 支持字符串或字符串数组。',
    body: `{
  "model": "text-embedding-3-small",
  "input": "The food was delicious and the service was excellent."
}`,
  },
];

export const imageEndpoints = [
  {
    method: 'POST',
    path: '/v1/images/generations',
    desc: 'OpenAI 格式文生图（DALL-E / gpt-image 等）。',
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
    desc: 'OpenAI 格式图像编辑，请求为 multipart/form-data。',
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
    desc: 'OpenAI 格式图像变体生成，请求为 multipart/form-data。',
    formData: ['image=@/path/to/source.png', 'model=dall-e-2', 'n=1', 'size=1024x1024'],
  },
  {
    method: 'POST',
    path: '/mj/submit/imagine',
    desc: 'Midjourney Proxy 创建 imagine 绘图任务，botType 可选 MID_JOURNEY / NIJI_JOURNEY。',
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
    desc: 'Midjourney Proxy 执行 U/V/Reroll 等后续动作，taskId 与 customId 由 imagine 任务返回。',
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
    desc: '查询 Midjourney 任务状态与结果图，无请求体。',
  },
];

export const audioEndpoints = [
  {
    method: 'POST',
    path: '/v1/audio/speech',
    desc: '文本转语音 (TTS)，返回音频流（MP3 / WAV / Opus 等）。',
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
    desc: '语音转文字，请求为 multipart/form-data，支持多语言自动识别。',
    formData: ['file=@/path/to/audio.mp3', 'model=whisper-1', 'response_format=json'],
  },
  {
    method: 'POST',
    path: '/v1/audio/translations',
    desc: '将任意语种语音翻译为英文文本，请求为 multipart/form-data。',
    formData: ['file=@/path/to/audio.mp3', 'model=whisper-1'],
  },
];

export const rerankEndpoints = [
  {
    method: 'POST',
    path: '/v1/rerank',
    desc: '文档相关性重排序，兼容 Jina / Cohere / Xinference 等服务商格式。',
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
];

export const realtimeEndpoints = (serverAddress) => [
  {
    method: 'WS',
    path: '/v1/realtime',
    urlPath: '/v1/realtime?model=gpt-4o-realtime-preview',
    desc: 'OpenAI Realtime WebSocket，支持低延迟双向语音对话。建立连接后通过 JSON 消息交互。',
    customExample: `# 使用 wscat 连接（需要 npm i -g wscat）
wscat -c "${(serverAddress || '').replace(/^https?:/, 'wss:').replace(/^http:/, 'ws:')}/v1/realtime?model=gpt-4o-realtime-preview" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "OpenAI-Beta: realtime=v1"`,
  },
];

export const musicEndpoints = [
  {
    method: 'POST',
    path: '/suno/submit/music',
    desc: 'Suno API 生成歌曲。描述模式只填 gpt_description_prompt；自定义模式填 prompt 作为歌词、title、tags。',
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
    desc: 'Suno API 生成歌词。',
    body: `{
  "prompt": "A song about morning coffee"
}`,
  },
  {
    method: 'GET',
    path: '/suno/fetch/{id}',
    urlPath: '/suno/fetch/abcd1234efgh',
    desc: '查询 Suno 任务状态与生成结果（含 audio_url / video_url / 歌词）。无请求体。',
  },
];

export const videoEndpoints = [
  {
    method: 'POST',
    path: '/v1/video/generations',
    desc: '创建文生视频 / 图生视频任务（兼容 Kling / Sora / 即梦 等格式）。image 字段为可选输入图（URL 或 Base64）。',
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
    desc: '查询视频任务状态与下载地址。无请求体。',
  },
];

export const seedanceCreateBody = `{
  "model": "doubao-seedance-2.0",
  "content": [
    {
      "type": "text",
      "text": "参考图片 1，生成 5 秒产品展示视频。"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "asset://reviewed-image-asset-id"
      },
      "role": "reference_image",
      "duration": 5
    }
  ],
  "ratio": "16:9",
  "duration": 5,
  "generate_audio": true
}`;

export const seedanceModerationBody = `{
  "model": "doubao-seedance-2.0",
  "images": [
    "https://example.com/product.png"
  ]
}`;

export const seedanceEndpoints = [
  {
    id: 'seedance-create',
    title: '创建任务',
    method: 'POST',
    path: '/api/v3/contents/generations/tasks',
    desc: '创建 Seedance 异步视频任务，返回 task id 后再轮询查询。',
    body: seedanceCreateBody,
  },
  {
    id: 'seedance-fetch',
    title: '查询任务',
    method: 'GET',
    path: '/api/v3/contents/generations/tasks/{task_id}',
    urlPath: '/api/v3/contents/generations/tasks/task_xxxxxxxxxxxx',
    desc: '查询任务状态与最终视频地址。无请求体。',
  },
  {
    id: 'seedance-moderation',
    title: '审核图片',
    method: 'POST',
    path: '/v1/images/moderations',
    desc: '入库真人 / 受版权素材时先调用此接口；通过审核后返回的 asset:// 链接可用作 image_url 的 url。',
    body: seedanceModerationBody,
  },
];

export const seedanceT2vExample = `{
  "model": "doubao-seedance-2.0",
  "content": [
    {
      "type": "text",
      "text": "A cinematic aerial shot of a futuristic cubic city at sunrise"
    }
  ],
  "duration": 5,
  "ratio": "16:9",
  "watermark": false
}`;

export const seedanceI2vExample = `{
  "model": "doubao-seedance-2.0",
  "content": [
    {
      "type": "text",
      "text": "参考图片 1 的主体，让产品在干净影棚背景中缓慢旋转，保持主体外观一致。"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "asset://reviewed-image-asset-id"
      },
      "role": "reference_image"
    }
  ],
  "duration": 5,
  "ratio": "1:1",
  "camera_fixed": true,
  "watermark": false
}`;

export const seedanceKeyframesExample = `{
  "model": "doubao-seedance-2.0",
  "content": [
    {
      "type": "text",
      "text": "根据图片 1 和图片 2 生成流畅过渡的视频。"
    },
    {
      "type": "image_url",
      "image_url": { "url": "asset://first-frame-asset-id" },
      "role": "first_frame"
    },
    {
      "type": "image_url",
      "image_url": { "url": "asset://last-frame-asset-id" },
      "role": "last_frame"
    }
  ],
  "duration": 8,
  "ratio": "16:9",
  "generate_audio": true
}`;

export const seedanceV2vExample = `{
  "model": "doubao-seedance-2.0",
  "content": [
    {
      "type": "text",
      "text": "Keep the character style and generate a new action sequence"
    },
    {
      "type": "video_url",
      "video_url": { "url": "https://example.com/reference.mp4" }
    }
  ],
  "duration": 5,
  "ratio": "16:9"
}`;

export const seedanceResponseRunning = `{
  "id": "task_xxx",
  "model": "doubao-seedance-2.0",
  "status": "running",
  "created_at": 1770000000,
  "updated_at": 1770000030
}`;

export const seedanceResponseSucceeded = `{
  "id": "task_xxx",
  "model": "doubao-seedance-2.0",
  "status": "succeeded",
  "content": {
    "video_url": "https://example.com/generated-video.mp4"
  },
  "created_at": 1770000000,
  "updated_at": 1770000600
}`;

export const seedanceResponseFailed = `{
  "id": "task_xxx",
  "model": "doubao-seedance-2.0",
  "status": "failed",
  "error": {
    "code": "task_failed",
    "message": "The request failed because the output video may be related to policy restrictions."
  },
  "created_at": 1770000000,
  "updated_at": 1770000300
}`;

export const seedanceModerationResponse = `{
  "code": "success",
  "message": "",
  "data": {
    "object": "asset_moderation",
    "status": "approved",
    "review_batch_id": "review-batch-id",
    "task_id": "moderation-task-id",
    "items": [
      {
        "source_url": "https://example.com/product.png",
        "asset_url": "asset://reviewed-image-asset-id",
        "submit_review_status": 1,
        "passed": true
      }
    ]
  }
}`;
