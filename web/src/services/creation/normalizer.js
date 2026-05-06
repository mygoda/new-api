// services/creation/normalizer.js
//
// 把统一的前端 UnifiedParams 转成各上游协议的请求体。
//
// 设计：
//   - 后端 dto.VideoRequest 已经支持 metadata map，把上游特有字段塞进去由 adapter 自取
//   - 不修改任何后端 adapter 的字段约定
//   - 字段缺失时不下发（不发 null/0/""，避免覆盖上游默认值）

const stripUndefined = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
};

const ratioToSize = (ratio, resolution) => {
  // 把 16:9 + 720p 推算成 "1280x720"
  const dim =
    resolution === '1080p' ? 1080 :
    resolution === '720p'  ? 720  :
    resolution === '480p'  ? 480  : 720;
  const [w, h] = (ratio || '16:9').split(':').map(Number);
  if (!w || !h) return undefined;
  if (w >= h) {
    const width = Math.round((dim * w) / h);
    return `${width}x${dim}`;
  } else {
    const height = Math.round((dim * h) / w);
    return `${dim}x${height}`;
  }
};

function toOpenAIImage(p, schema) {
  // 火山方舟 Seedream 5.0/4.5/4.0 不支持 n、不支持 seed(只 3.0 支持)。
  // 数量由 sequential_image_generation + max_images 控制。
  const isDoubaoSeedream = /seedream/.test((p.model || '').toLowerCase());
  const isSeedream3 = /seedream-3/.test((p.model || '').toLowerCase());

  const body = stripUndefined({
    model: p.model,
    prompt: p.prompt,
    n: !isDoubaoSeedream ? (p.n ?? 1) : undefined, // doubao seedream 不传 n
    size: p.size,
    quality: p.quality,
    style: p.style,
    // seed 仅 3.0-t2i 支持;其它 doubao seedream 跳过
    seed:
      p.seed != null && p.seed >= 0 && (!isDoubaoSeedream || isSeedream3)
        ? p.seed
        : undefined,
    watermark: typeof p.watermark === 'boolean' ? p.watermark : undefined,
    sequential_image_generation:
      p.sequential_image_generation === 'auto' || p.sequential_image_generation === 'disabled'
        ? p.sequential_image_generation
        : undefined,
    sequential_image_generation_options:
      p.sequential_image_generation === 'auto' && p.max_images
        ? { max_images: p.max_images }
        : undefined,
    optimize_prompt_options:
      p.optimize_prompt_mode && (p.optimize_prompt_mode === 'standard' || p.optimize_prompt_mode === 'fast')
        ? { mode: p.optimize_prompt_mode }
        : undefined,
    // 仅 5.0 lite 支持自定义;其它模型即便传也无害(被忽略)
    output_format: p.output_format ? p.output_format : undefined,
  });
  // 有上传图 → 走 edits 接口
  if (p.image_first) {
    return {
      url: '/v1/images/edits',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { ...body, image: p.image_first },
    };
  }
  return {
    url: schema.endpoint || '/v1/images/generations',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  };
}

// MJ 走 /mj/submit/imagine；prompt 末尾追加内联参数 (--ar / --v / --niji / --s / --c)
function toMidjourney(p, schema) {
  let prompt = p.prompt || '';

  // 拼内联参数
  const tail = [];
  if (p.ar) tail.push(`--ar ${p.ar}`);
  if (p.version) {
    if (p.version.startsWith('niji')) {
      tail.push(`--niji ${p.version.split(' ')[1] || '6'}`);
    } else {
      tail.push(`--v ${p.version.replace(/^v/i, '')}`);
    }
  }
  if (p.stylize != null) tail.push(`--s ${p.stylize}`);
  if (p.chaos != null && p.chaos > 0) tail.push(`--c ${p.chaos}`);
  if (p.negative_prompt) tail.push(`--no ${p.negative_prompt}`);
  if (tail.length) prompt += ' ' + tail.join(' ');

  const body = { prompt };
  if (p.image_first) {
    body.base64Array = [p.image_first];
  }
  if (p.notify_hook) body.notifyHook = p.notify_hook;
  if (p.state) body.state = p.state;

  return {
    url: schema.endpointMap?.submit || '/mj/submit/imagine',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  };
}

// MJ 任务状态字符串映射到统一态
export function mapMjStatusToUnified(s) {
  switch (s) {
    case 'SUCCESS':       return 'completed';
    case 'IN_PROGRESS':
    case 'SUBMITTED':
    case 'NOT_START':
    case 'QUEUED':        return 'in_progress';
    case 'FAILURE':       return 'failed';
    default:              return 'in_progress';
  }
}

function toOpenAIVideo(p, schema) {
  const body = stripUndefined({
    model: p.model,
    prompt: p.prompt,
  });

  // OpenAI 通用字段
  if (p.duration != null) body.duration = p.duration;
  if (p.seconds != null)  body.seconds = String(p.seconds);
  if (p.size)             body.size = p.size;
  else if (p.aspect_ratio && p.resolution) {
    const sz = ratioToSize(p.aspect_ratio, p.resolution);
    if (sz) body.size = sz;
  }
  if (p.seed != null && p.seed >= 0) body.seed = p.seed;
  if (p.n)   body.n = p.n;
  if (p.fps) body.fps = p.fps;
  if (p.image_first) body.image = p.image_first;

  // 上游特定字段都收进 metadata；后端各 adapter 自行从 metadata 取
  const metadata = stripUndefined({
    negative_prompt: p.negative_prompt,
    cfg_scale: p.cfg_scale,
    mode: p.mode_quality,
    motion_strength: p.motion_strength,
    // 兼容两种字段名:camera_fixed (旧, 来自 camera_preset=fixed) 与 camerafixed (新, 直接 schema 字段)
    camera_fixed:
      p.camera_preset === 'fixed' ? true :
      p.camerafixed === true ? true :
      p.camerafixed === false ? false : undefined,
    generate_audio: typeof p.generate_audio === 'boolean' ? p.generate_audio : undefined,
    watermark: typeof p.watermark === 'boolean' ? p.watermark : undefined,
    return_last_frame: typeof p.return_last_frame === 'boolean' ? p.return_last_frame : undefined,
    service_tier: p.service_tier && p.service_tier !== 'default' ? p.service_tier : undefined,
    prompt_optimizer: p.prompt_optimizer,
    fast_pretreatment: p.fast_pretreatment,
    image_last: p.image_last,
    images_ref: p.images_ref,
    subject_image: p.subject_image,
    aspect_ratio: p.aspect_ratio,
    resolution: p.resolution,
    ratio: p.ratio,
    // doubao adapter 通过 UnmarshalMetadata 读取这两个字段;TaskSubmitReq 顶层
    // 没有 seed 字段,只放顶层会丢。这里冗余下发保证 adapter 能拿到。
    seed: p.seed != null && p.seed >= 0 ? p.seed : undefined,
    duration: p.duration != null ? p.duration : undefined,
  });

  // 镜头控制（Kling 专属，后端 kling adapter 取 metadata.camera_control 或在 metadata 中合并）
  if (p.camera && (p.camera.preset || (p.camera.advanced && Object.keys(p.camera.advanced).length))) {
    if (p.camera.preset === 'simple') {
      metadata.camera_control = {
        type: 'simple',
        config: p.camera.advanced || {},
      };
    } else if (p.camera.preset) {
      metadata.camera_control = { type: p.camera.preset };
    }
  }
  if (Object.keys(metadata).length > 0) body.metadata = metadata;

  // remix 走 Sora 专属路径
  let url = schema.endpoint || '/v1/video/generations';
  if (p.mode === 'remix' && p.remix_from_task_id) {
    url = `/v1/videos/${encodeURIComponent(p.remix_from_task_id)}/remix`;
  }

  return {
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  };
}

export function normalize(params, schema) {
  if (!schema) {
    throw new Error('NO_SCHEMA');
  }
  switch (schema.protocol) {
    case 'openai-image':
      return toOpenAIImage(params, schema);
    case 'openai-video':
      return toOpenAIVideo(params, schema);
    case 'mj':
      return toMidjourney(params, schema);
    default:
      throw new Error('UNSUPPORTED_PROTOCOL: ' + schema.protocol);
  }
}

export function validate(params, schema) {
  const errs = [];
  if (!params.prompt || !params.prompt.trim())
    errs.push({ field: 'prompt', msg: '请输入提示词' });

  if (schema?.modality === 'video') {
    if (params.mode === 'i2v' && !params.image_first)
      errs.push({ field: 'image_first', msg: '图生视频需要上传首帧' });
    if (params.mode === 'keyframes' && (!params.image_first || !params.image_last))
      errs.push({ field: 'image_last', msg: '首尾帧模式需要同时上传首帧和尾帧' });
  }

  // duration / seconds 选项必须在 schema 允许的范围内
  if (schema?.fields?.duration?.options && params.duration != null) {
    if (!schema.fields.duration.options.includes(params.duration))
      errs.push({ field: 'duration', msg: '该模型不支持此时长' });
  }
  if (schema?.fields?.seconds?.options && params.seconds != null) {
    if (!schema.fields.seconds.options.includes(params.seconds))
      errs.push({ field: 'seconds', msg: '该模型不支持此时长' });
  }
  return errs;
}

export function buildCurl(req, token, origin = '') {
  const url = (origin || (typeof window !== 'undefined' ? window.location.origin : '')) + req.url;
  const lines = [
    `curl -X ${req.method} '${url}' \\`,
    `  -H 'Authorization: Bearer ${token || '<YOUR_API_KEY>'}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${JSON.stringify(req.body, null, 2)}'`,
  ];
  return lines.join('\n');
}
