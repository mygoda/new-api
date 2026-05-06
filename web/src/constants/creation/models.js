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
      size: {
        type: FIELD.segmented,
        // 火山官方 Seedream 5.0 lite 支持比例 + 像素两套
        options: [
          'auto',
          '1:1',
          '2:3',
          '3:2',
          '3:4',
          '4:3',
          '4:5',
          '5:4',
          '9:16',
          '16:9',
          '21:9',
          '2048x2048',
          '2560x1440',
          '4096x4096',
        ],
        default: 'auto',
        group: PARAM_GROUP.basic,
        label: '尺寸 / 比例',
        help: '可填写比例(自动选分辨率)或具体像素。最高支持 4096x4096。',
      },
      n: {
        type: FIELD.number,
        min: 1,
        max: 15,
        default: 1,
        group: PARAM_GROUP.basic,
        label: '生成数量',
        help: '1-15。参考图数量 + 生成数量 ≤ 15。',
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
        help: '-1 = 随机;固定数值可复现同样的图。',
      },
      optimize_prompt_mode: {
        type: FIELD.select,
        options: ['', 'auto', 'creative'],
        default: '',
        group: PARAM_GROUP.advanced,
        label: '提示词优化',
        help: '空 = 关闭;auto = 平衡;creative = 倾向创意扩写。',
      },
      sequential_image_generation: {
        type: FIELD.segmented,
        options: ['off', 'auto', 'on'],
        default: 'off',
        group: PARAM_GROUP.advanced,
        label: '组图生成',
        help: '产生具有连贯主体/风格的多张图(如分镜)。开启后请配合「最大图数」。',
      },
      max_images: {
        type: FIELD.number,
        min: 1,
        max: 15,
        default: 4,
        group: PARAM_GROUP.advanced,
        label: '组图最大图数',
        help: '仅在「组图生成」开启时生效。',
      },
    },
    pricing: {
      unit: '张',
      estimate: ({ n = 1 }) => Math.round(n * 25), // 占位估算
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
        options: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        default: '16:9',
        group: PARAM_GROUP.basic,
        label: '宽高比',
      },
      resolution: {
        type: FIELD.segmented,
        options: ['480p', '720p', '1080p'],
        default: '720p',
        group: PARAM_GROUP.basic,
        label: '分辨率',
      },
      camerafixed: {
        type: FIELD.switch,
        default: false,
        group: PARAM_GROUP.advanced,
        label: '锁定镜头(camerafixed)',
        help: '开启后整段视频画面镜头保持稳定,不做主动运镜。适合产品展示、对话场景。',
      },
      watermark: {
        type: FIELD.switch,
        default: false,
        group: PARAM_GROUP.advanced,
        label: '添加水印',
        help: '是否在视频右下角添加官方水印。商用建议关闭。',
      },
      negative_prompt: {
        type: FIELD.textarea,
        default: '',
        group: PARAM_GROUP.advanced,
        label: '负向提示词',
        help: '描述不希望出现的内容,以逗号分隔。例如:模糊、低质量、变形手指。',
      },
      seed: {
        type: FIELD.seed,
        default: -1,
        group: PARAM_GROUP.advanced,
        label: '随机种子',
        help: '-1 表示每次随机;固定数值用于复现同样的视频。',
      },
    },
    pricing: {
      unit: '秒',
      estimate: ({ duration = 5, resolution = '720p' }) =>
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
        options: [5, 8, 11, 15],
        default: 5,
        group: PARAM_GROUP.basic,
        label: '时长（秒）',
      },
      ratio: {
        type: FIELD.ratio,
        options: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        default: '16:9',
        group: PARAM_GROUP.basic,
        label: '宽高比',
      },
      resolution: {
        type: FIELD.segmented,
        options: ['720p', '1080p'],
        default: '1080p',
        group: PARAM_GROUP.basic,
        label: '分辨率',
      },
      generate_audio: {
        type: FIELD.switch,
        default: false,
        group: PARAM_GROUP.basic,
        label: '生成原生音频',
        help: 'Seedance 2.0 独有:同时生成与画面同步的音效与语音。会增加耗时与计费。',
      },
      camerafixed: {
        type: FIELD.switch,
        default: false,
        group: PARAM_GROUP.advanced,
        label: '锁定镜头(camerafixed)',
        help: '开启后整段视频画面镜头保持稳定。',
      },
      watermark: {
        type: FIELD.switch,
        default: false,
        group: PARAM_GROUP.advanced,
        label: '添加水印',
      },
      negative_prompt: {
        type: FIELD.textarea,
        default: '',
        group: PARAM_GROUP.advanced,
        label: '负向提示词',
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
      estimate: ({ duration = 5, resolution = '1080p', generate_audio = false }) => {
        const base = resolution === '1080p' ? 100 : 50;
        return Math.round(duration * base * (generate_audio ? 1.3 : 1));
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
  if (exact) return exact;

  // 2. 按厂商/系列匹配预设
  if (modality === 'image') {
    if (vendor === 'midjourney' || /midjourney|^mj-/.test(lowerName)) {
      const mj = IMAGE_MODELS.find((m) => m.modelName === 'midjourney');
      return mj ? { ...mj, modelName, displayName: modelName } : null;
    }
    if (vendor === 'doubao' || /seedream|seededit/.test(lowerName)) {
      const tpl = IMAGE_MODELS.find((m) => m.modelName === 'doubao-seedream-5-0-260128');
      return tpl ? { ...tpl, modelName, displayName: modelName } : null;
    }
    if (vendor === 'openai' || /gpt|dall-e/.test(lowerName)) {
      const tpl = IMAGE_MODELS.find((m) => m.modelName === 'gpt-image-1');
      return tpl ? { ...tpl, modelName, displayName: modelName } : null;
    }
    // 通用图像生成兜底
    return {
      modelName,
      displayName: modelName,
      vendor,
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
      pricing: { unit: '秒', estimate: ({ duration = 5 }) => Math.round(duration * 50) },
    };
  }

  return null;
}

