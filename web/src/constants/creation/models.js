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
      resolution: {
        type: FIELD.segmented,
        options: ['720p', '1080p'],
        default: '720p',
        group: PARAM_GROUP.basic,
        label: '分辨率',
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
      estimate: ({ duration = 5, resolution = '720p' }) =>
        Math.round(duration * (resolution === '1080p' ? 80 : 40)),
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
  return [];
}
