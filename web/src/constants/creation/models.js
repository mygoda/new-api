// 创作中心 - 模型 Schema 定义
//
// 设计原则：
//   - 字段名与后端 dto.VideoRequest / 各 adapter 接收字段保持一致
//   - 未在 schema 中登记的字段不下发，避免向上游传未知参数
//   - 不强制每个模型都填满所有字段，只声明它支持的
//
// v1.0 仅纳入 4 个核心模型：
//   - 图像：openai-gpt-image-1（OpenAI 图像生成）
//   - 视频：sora-2、kling-v1-6、doubao-seedance-1-0-pro

export const PARAM_GROUP = {
  basic: 'basic',
  advanced: 'advanced',
  camera: 'camera',
};

// 字段类型枚举
export const FIELD = {
  segmented: 'segmented',
  select: 'select',
  slider: 'slider',
  switch: 'switch',
  textarea: 'textarea',
  number: 'number',
  seed: 'seed',
  ratio: 'ratio',
  camera: 'camera',
};

// === 图像模型 ===

export const IMAGE_MODELS = [
  {
    modelName: 'gpt-image-1',
    displayName: 'GPT Image 1',
    vendor: 'openai',
    icon: '/logo.png',
    modality: 'image',
    protocol: 'openai-image',
    endpoint: '/v1/images/generations',
    fields: {
      size: {
        type: FIELD.segmented,
        options: ['1024x1024', '1024x1536', '1536x1024'],
        default: '1024x1024',
        group: PARAM_GROUP.basic,
        label: '尺寸',
      },
      n: {
        type: FIELD.number,
        min: 1,
        max: 4,
        default: 1,
        group: PARAM_GROUP.basic,
        label: '生成数量',
      },
      quality: {
        type: FIELD.segmented,
        options: ['low', 'medium', 'high'],
        default: 'medium',
        group: PARAM_GROUP.advanced,
        label: '质量',
      },
    },
    pricing: {
      unit: '张',
      // 估算返回点数；实际以后端结算为准
      estimate: ({ n = 1, quality = 'medium' }) => {
        const qBase = quality === 'high' ? 80 : quality === 'medium' ? 40 : 20;
        return qBase * n;
      },
    },
  },
  {
    modelName: 'dall-e-3',
    displayName: 'DALL·E 3',
    vendor: 'openai',
    icon: '/logo.png',
    modality: 'image',
    protocol: 'openai-image',
    endpoint: '/v1/images/generations',
    fields: {
      size: {
        type: FIELD.segmented,
        options: ['1024x1024', '1024x1792', '1792x1024'],
        default: '1024x1024',
        group: PARAM_GROUP.basic,
        label: '尺寸',
      },
      n: {
        type: FIELD.number,
        min: 1,
        max: 1,
        default: 1,
        group: PARAM_GROUP.basic,
        label: '生成数量',
      },
      quality: {
        type: FIELD.segmented,
        options: ['standard', 'hd'],
        default: 'standard',
        group: PARAM_GROUP.advanced,
        label: '质量',
      },
      style: {
        type: FIELD.segmented,
        options: ['vivid', 'natural'],
        default: 'vivid',
        group: PARAM_GROUP.advanced,
        label: '风格',
      },
    },
    pricing: {
      unit: '张',
      estimate: ({ quality = 'standard', size = '1024x1024' }) => {
        const big = size !== '1024x1024';
        const base = quality === 'hd' ? 80 : 40;
        return base * (big ? 1.5 : 1);
      },
    },
  },
  {
    modelName: 'doubao-seedream-5-0-260128',
    displayName: 'Doubao Seedream 5.0',
    vendor: 'doubao',
    icon: '/logo.png',
    modality: 'image',
    protocol: 'openai-image',
    endpoint: '/v1/images/generations',
    fields: {
      // 火山官方 size 支持两种方式不可混用:简化档 (2K/3K/4K) 或具体像素值
      // 简化档下,模型按 prompt 自动判定宽高比;像素直接指定
      size: {
        type: FIELD.select,
        options: [
          '2K',
          '3K',
          '4K',
          '2048x2048',
          '2560x1440',
          '3072x3072',
          '4096x4096',
        ],
        default: '2K',
        group: PARAM_GROUP.basic,
        label: '尺寸 / 分辨率档',
        help: '推荐用 2K/3K/4K 简档,模型按 prompt 自动选最佳宽高比;或直接填像素(总像素 [368w, 1.7kw],宽高比 [1/16,16])。',
      },
      watermark: {
        type: FIELD.switch,
        default: true,
        group: PARAM_GROUP.basic,
        label: '添加 AI 生成水印',
        help: '官方默认 true。商用建议关闭。仅在右下角加「AI 生成」字样,不遮挡主体。',
      },
      sequential_image_generation: {
        type: FIELD.segmented,
        options: ['disabled', 'auto'],
        default: 'disabled',
        group: PARAM_GROUP.advanced,
        label: '组图生成',
        help: 'disabled = 单图;auto = 由模型决定生成几张,产生主体/风格连贯的一组图(如分镜)。需配合「最大图数」。',
      },
      max_images: {
        type: FIELD.number,
        min: 1,
        max: 15,
        default: 4,
        group: PARAM_GROUP.advanced,
        label: '最大图数',
        help: '仅当组图 = auto 时生效。参考图数量 + 生成数量 ≤ 15。',
      },
      optimize_prompt_mode: {
        type: FIELD.select,
        options: ['', 'standard', 'fast'],
        default: '',
        group: PARAM_GROUP.advanced,
        label: '提示词优化',
        help: '空 = API 默认(standard);standard = 质量更高,慢一点;fast = 更快(5.0 lite 不支持 fast)。',
      },
      output_format: {
        type: FIELD.segmented,
        options: ['', 'jpeg', 'png'],
        default: '',
        group: PARAM_GROUP.advanced,
        label: '输出格式',
        help: '仅 5.0 lite 支持自定义。空 = API 默认(jpeg);其他模型固定 jpeg。',
      },
    },
    pricing: {
      unit: '张',
      estimate: ({
        sequential_image_generation = 'disabled',
        max_images = 1,
      }) => {
        const n =
          sequential_image_generation === 'auto' ? Math.min(max_images, 15) : 1;
        return n * 25;
      },
    },
  },
  {
    modelName: 'midjourney',
    displayName: 'Midjourney',
    vendor: 'midjourney',
    icon: '/logo.png',
    modality: 'image',
    protocol: 'mj',
    isAsync: true,
    endpointMap: {
      submit: '/mj/submit/imagine',
      fetch: '/mj/task/{id}/fetch',
    },
    fields: {
      ar: {
        type: FIELD.ratio,
        options: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'],
        default: '1:1',
        group: PARAM_GROUP.basic,
        label: '宽高比',
      },
      version: {
        type: FIELD.segmented,
        options: ['v6', 'v6.1', 'niji 6'],
        default: 'v6.1',
        group: PARAM_GROUP.basic,
        label: '版本',
      },
      stylize: {
        type: FIELD.slider,
        min: 0,
        max: 1000,
        step: 50,
        default: 100,
        group: PARAM_GROUP.advanced,
        label: 'Stylize',
      },
      chaos: {
        type: FIELD.slider,
        min: 0,
        max: 100,
        step: 5,
        default: 0,
        group: PARAM_GROUP.advanced,
        label: 'Chaos',
      },
    },
    pricing: {
      unit: '次',
      estimate: () => 60,
    },
  },
];

// === 视频模型 ===

export const VIDEO_MODELS = [
  {
    modelName: 'sora-2',
    displayName: 'Sora 2',
    vendor: 'openai',
    icon: '/logo.png',
    modality: 'video',
    protocol: 'openai-video',
    endpoint: '/v1/video/generations',
    modes: ['t2v'],
    fields: {
      seconds: {
        type: FIELD.segmented,
        options: [4, 8, 12],
        default: 4,
        group: PARAM_GROUP.basic,
        label: '时长（秒）',
      },
      size: {
        type: FIELD.select,
        options: ['720x1280', '1280x720', '1024x1792', '1792x1024'],
        default: '1280x720',
        group: PARAM_GROUP.basic,
        label: '尺寸',
      },
    },
    pricing: {
      unit: '秒',
      estimate: ({ seconds = 4, size = '1280x720' }) => {
        const big = size === '1792x1024' || size === '1024x1792';
        return Math.round(seconds * (big ? 50 : 30));
      },
    },
  },
  {
    modelName: 'doubao-seedance-1-0-pro-250528',
    displayName: 'Doubao Seedance Pro',
    vendor: 'doubao',
    icon: '/logo.png',
    modality: 'video',
    protocol: 'openai-video',
    endpoint: '/v1/video/generations',
    modes: ['t2v', 'i2v'],
    fields: {
      duration: {
        type: FIELD.segmented,
        // 官方 Seedance 1.0 pro / pro-fast / 1.0 lite 支持 [2, 12] 秒任意整数
        options: [3, 5, 8, 10, 12],
        default: 5,
        group: PARAM_GROUP.basic,
        label: '时长（秒）',
        help: 'Seedance 1.0 系列支持 2-12 秒,常用 5/8/10。',
      },
      ratio: {
        type: FIELD.ratio,
        options: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
        default: '16:9',
        group: PARAM_GROUP.basic,
        label: '宽高比',
        help: 'adaptive = 由模型按 prompt / 输入图自动选最合适的比例(图生视频场景默认值)。',
      },
      resolution: {
        type: FIELD.segmented,
        options: ['480p', '720p', '1080p'],
        default: '1080p',
        group: PARAM_GROUP.basic,
        label: '分辨率',
        help: '官方 1.0 pro / pro-fast 默认 1080p。',
      },
      camerafixed: {
        type: FIELD.switch,
        default: false,
        group: PARAM_GROUP.advanced,
        label: '锁定镜头',
        help: '开启后整段视频画面镜头保持稳定。注意:参考图场景与 Seedance 2.0 不支持此项。',
      },
      watermark: {
        type: FIELD.switch,
        default: false,
        group: PARAM_GROUP.advanced,
        label: '添加水印',
        help: '默认不加。商用建议关闭。',
      },
      seed: {
        type: FIELD.seed,
        default: -1,
        group: PARAM_GROUP.advanced,
        label: '随机种子',
        help: '-1 = 每次随机;固定值可近似复现(不保证 100% 一致)。',
      },
    },
    pricing: {
      unit: '秒',
      estimate: ({ duration = 5, resolution = '1080p' }) =>
        Math.round(duration * (resolution === '1080p' ? 80 : 40)),
    },
  },
  {
    modelName: 'doubao-seedance-2-0-260128',
    displayName: 'Doubao Seedance 2.0',
    vendor: 'doubao',
    icon: '/logo.png',
    modality: 'video',
    protocol: 'openai-video',
    endpoint: '/v1/video/generations',
    modes: ['t2v', 'i2v'],
    fields: {
      duration: {
        type: FIELD.segmented,
        // Seedance 2.0 支持 [4, 15] 秒任意整数,或 -1 智能选
        options: [5, 8, 11, 15],
        default: 5,
        group: PARAM_GROUP.basic,
        label: '时长（秒）',
        help: 'Seedance 2.0 范围 4-15 秒。-1 让模型自适应。',
      },
      ratio: {
        type: FIELD.ratio,
        options: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        default: 'adaptive',
        group: PARAM_GROUP.basic,
        label: '宽高比',
        help: 'Seedance 2.0 默认 adaptive,由模型按输入(prompt / 图 / 视频)自动选最合适比例。',
      },
      resolution: {
        type: FIELD.segmented,
        options: ['480p', '720p', '1080p'],
        default: '720p',
        group: PARAM_GROUP.basic,
        label: '分辨率',
        help: 'Seedance 2.0 默认 720p。注意:Seedance 2.0 fast 不支持 1080p。',
      },
      generate_audio: {
        type: FIELD.switch,
        default: true,
        group: PARAM_GROUP.basic,
        label: '生成原生音频',
        help: 'Seedance 2.0 / 1.5 pro 独有。开启后模型按 prompt/画面合成同步的人声、音效、配乐(对白请加双引号)。',
      },
      return_last_frame: {
        type: FIELD.switch,
        default: false,
        group: PARAM_GROUP.advanced,
        label: '返回尾帧图',
        help: '开启后查询接口可拿到本视频的尾帧 PNG,可作为下一段视频的首帧,实现长视频拼接。',
      },
      service_tier: {
        type: FIELD.segmented,
        options: ['default', 'flex'],
        default: 'default',
        group: PARAM_GROUP.advanced,
        label: '服务等级',
        help: 'default = 在线推理(快);flex = 离线推理(慢但价格 50%)。Seedance 2.0 不支持 flex。',
      },
      watermark: {
        type: FIELD.switch,
        default: false,
        group: PARAM_GROUP.advanced,
        label: '添加水印',
      },
      seed: {
        type: FIELD.seed,
        default: -1,
        group: PARAM_GROUP.advanced,
        label: '随机种子',
        help: '-1 = 随机。范围 [-1, 2^32-1]。',
      },
    },
    pricing: {
      unit: '秒',
      estimate: ({
        duration = 5,
        resolution = '720p',
        generate_audio = true,
        service_tier = 'default',
      }) => {
        const base = resolution === '1080p' ? 100 : 50;
        const audioMul = generate_audio ? 1.3 : 1;
        const tierMul = service_tier === 'flex' ? 0.5 : 1;
        return Math.round(duration * base * audioMul * tierMul);
      },
    },
  },
  {
    modelName: 'kling-v1-6',
    displayName: 'Kling 1.6',
    vendor: 'kuaishou',
    icon: '/logo.png',
    modality: 'video',
    protocol: 'openai-video',
    endpoint: '/v1/video/generations',
    modes: ['t2v', 'i2v'],
    fields: {
      duration: {
        type: FIELD.segmented,
        options: [5, 10],
        default: 5,
        group: PARAM_GROUP.basic,
        label: '时长（秒）',
      },
      aspect_ratio: {
        type: FIELD.ratio,
        options: ['16:9', '9:16', '1:1'],
        default: '16:9',
        group: PARAM_GROUP.basic,
        label: '宽高比',
      },
      mode_quality: {
        type: FIELD.segmented,
        options: ['std', 'pro'],
        default: 'std',
        group: PARAM_GROUP.advanced,
        label: '质量模式',
      },
      cfg_scale: {
        type: FIELD.slider,
        min: 0,
        max: 1,
        step: 0.1,
        default: 0.5,
        group: PARAM_GROUP.advanced,
        label: 'CFG Scale',
      },
      negative_prompt: {
        type: FIELD.textarea,
        default: '',
        group: PARAM_GROUP.advanced,
        label: '负向提示词',
      },
      camera: {
        type: FIELD.camera,
        default: { preset: '', advanced: {} },
        group: PARAM_GROUP.advanced,
        label: '镜头控制',
      },
    },
    pricing: {
      unit: '秒',
      estimate: ({ duration = 5, mode_quality = 'std' }) =>
        Math.round(duration * (mode_quality === 'pro' ? 100 : 50)),
    },
  },
];

export function getModelSchema(modelName) {
  return (
    IMAGE_MODELS.find((m) => m.modelName === modelName) ||
    VIDEO_MODELS.find((m) => m.modelName === modelName) ||
    null
  );
}

export function getModelsForModality(modality) {
  if (modality === 'image') return IMAGE_MODELS;
  if (modality === 'video') return VIDEO_MODELS;
  // image-to-image：从 IMAGE_MODELS 过滤出 protocol === 'openai-image' 的
  // （MJ 协议不走 /v1/images/edits，不能在 i2i tab 用）
  if (modality === 'image-to-image') {
    return IMAGE_MODELS.filter((m) => m.protocol === 'openai-image').map(
      (m) => ({
        ...m,
        modality: 'image-to-image',
      }),
    );
  }
  return [];
}

/**
 * 为动态加载的模型推导兜底 schema
 * 当 /api/pricing 返回的模型不在硬编码列表中时，根据厂商/模型名匹配最接近的预设
 */
export function inferModelSchema(modelInfo) {
  const { modelName, vendor, modality } = modelInfo;
  const lowerName = (modelName || '').toLowerCase();

  // 1. 优先精确匹配
  const exact = getModelSchema(modelName);
  if (exact) {
    // i2i 模态下，把 image 类 schema 的 modality 切到 image-to-image，
    // 让 normalizer.validate 走 image-to-image 分支（要求 image_first 必填）。
    // 实际请求路径由 normalizer 根据是否存在 image_first 自动选 /v1/images/edits。
    if (
      modality === 'image-to-image' &&
      exact.modality === 'image' &&
      exact.protocol === 'openai-image'
    ) {
      return { ...exact, modality: 'image-to-image' };
    }
    return exact;
  }

  // 2. 按厂商/系列匹配预设
  if (modality === 'image' || modality === 'image-to-image') {
    if (vendor === 'midjourney' || /midjourney|^mj-/.test(lowerName)) {
      // MJ 协议不支持 /v1/images/edits，i2i 模态下跳过 MJ
      if (modality === 'image-to-image') return null;
      const mj = IMAGE_MODELS.find((m) => m.modelName === 'midjourney');
      return mj ? { ...mj, modelName, displayName: modelName } : null;
    }
    if (vendor === 'doubao' || /seedream|seededit/.test(lowerName)) {
      const tpl = IMAGE_MODELS.find(
        (m) => m.modelName === 'doubao-seedream-5-0-260128',
      );
      if (!tpl) return null;
      return { ...tpl, modelName, displayName: modelName, modality };
    }
    if (vendor === 'openai' || /gpt|dall-e/.test(lowerName)) {
      const tpl = IMAGE_MODELS.find((m) => m.modelName === 'gpt-image-1');
      if (!tpl) return null;
      return { ...tpl, modelName, displayName: modelName, modality };
    }
    // 通用图像生成兜底
    return {
      modelName,
      displayName: modelName,
      vendor,
      modality,
      protocol: 'openai-image',
      endpoint: '/v1/images/generations',
      fields: {
        size: {
          type: FIELD.segmented,
          options: ['1024x1024', '1024x1536', '1536x1024'],
          default: '1024x1024',
          group: PARAM_GROUP.basic,
          label: '尺寸',
        },
        n: {
          type: FIELD.number,
          min: 1,
          max: 4,
          default: 1,
          group: PARAM_GROUP.basic,
          label: '生成数量',
        },
      },
      pricing: { unit: '张', estimate: ({ n = 1 }) => 40 * n },
    };
  }

  if (modality === 'video') {
    if (vendor === 'kling' || /^kling/.test(lowerName)) {
      const tpl = VIDEO_MODELS.find((m) => m.modelName === 'kling-v1-6');
      return tpl ? { ...tpl, modelName, displayName: modelName } : null;
    }
    if (vendor === 'doubao' || /seedance|doubao/.test(lowerName)) {
      // Seedance 2.0 与 1.x 参数集略有差异(2.0 多 generate_audio,duration 选项更细)
      // 按版本号匹配,默认走 1.0 pro
      const isV2 = /seedance-2|2-0-260128|2-0-fast/.test(lowerName);
      const targetName = isV2
        ? 'doubao-seedance-2-0-260128'
        : 'doubao-seedance-1-0-pro-250528';
      const tpl = VIDEO_MODELS.find((m) => m.modelName === targetName);
      return tpl ? { ...tpl, modelName, displayName: modelName } : null;
    }
    if (vendor === 'openai' || /sora/.test(lowerName)) {
      const tpl = VIDEO_MODELS.find((m) => m.modelName === 'sora-2');
      return tpl ? { ...tpl, modelName, displayName: modelName } : null;
    }
    // 通用视频生成兜底
    return {
      modelName,
      displayName: modelName,
      vendor,
      modality: 'video',
      protocol: 'openai-video',
      endpoint: '/v1/video/generations',
      modes: ['t2v'],
      fields: {
        duration: {
          type: FIELD.segmented,
          options: [5, 10],
          default: 5,
          group: PARAM_GROUP.basic,
          label: '时长（秒）',
        },
        ratio: {
          type: FIELD.ratio,
          options: ['16:9', '9:16', '1:1'],
          default: '16:9',
          group: PARAM_GROUP.basic,
          label: '宽高比',
        },
        seed: {
          type: FIELD.seed,
          default: -1,
          group: PARAM_GROUP.advanced,
          label: '随机种子',
        },
      },
      pricing: {
        unit: '秒',
        estimate: ({ duration = 5 }) => Math.round(duration * 50),
      },
    };
  }

  return null;
}
