// constants/creation/presets.js
//
// 创作中心首屏推荐 preset：每个 preset 包含完整的「prompt + 参数 + 模型偏好」
// 用户点击直接填入，1 秒上手

export const IMAGE_PRESETS = [
  {
    id: 'electric-poster',
    title: '电影感海报',
    cover: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400',
    prompt:
      '一位戴墨镜的赛博朋克侦探站在霓虹雨夜的东京街头，电影海报构图，冷暖对比强烈，戏剧光线，超高清细节',
    preferModels: ['gpt-image-2', 'gpt-image-1', 'midjourney-v7', 'midjourney-v6.1'],
    suggestParams: { size: '1024x1536', quality: 'high' },
  },
  {
    id: 'product-shot',
    title: '极简产品摄影',
    cover: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
    prompt:
      '白色无线耳机摆放在大理石台面上，柔和侧光，浅景深，杂志级商品摄影，4k 超高清细节',
    preferModels: ['gpt-image-2', 'gpt-image-1'],
    suggestParams: { size: '1024x1024', quality: 'medium' },
  },
  {
    id: 'studio-ghibli',
    title: '吉卜力插画',
    cover: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400',
    prompt:
      '吉卜力风格的山间小屋，黄昏时分窗户透出温暖灯光，远处群山笼罩在雾气中，水彩画质感，细腻笔触',
    preferModels: ['midjourney-v7', 'midjourney-v6.1', 'gpt-image-2'],
    suggestParams: { size: '1536x1024', quality: 'high' },
  },
  {
    id: 'portrait',
    title: '杂志人像',
    cover: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
    prompt:
      '一位亚洲女性侧脸特写，金色阳光从窗外洒落，电影感色调，柯达 Portra 400 胶片质感',
    preferModels: ['gpt-image-2', 'midjourney-v7'],
    suggestParams: { size: '1024x1536', quality: 'high' },
  },
  {
    id: 'cyberpunk-street',
    title: '赛博朋克街景',
    cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400',
    prompt:
      '赛博朋克风格的香港街头，霓虹招牌密布，雨后湿地反射红蓝光，远景仰拍，电影构图',
    preferModels: ['midjourney-v7', 'midjourney-v6.1'],
    suggestParams: { size: '1536x1024' },
  },
  {
    id: 'food-photo',
    title: '美食摄影',
    cover: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400',
    prompt:
      '一杯热气腾腾的拉花拿铁咖啡放在原木桌上，斜上方俯拍，柔和窗光，背景虚化，专业美食摄影',
    preferModels: ['gpt-image-2', 'gpt-image-1'],
    suggestParams: { size: '1024x1024' },
  },
];

export const VIDEO_PRESETS = [
  {
    id: 'cinematic-opening',
    title: '电影开场镜头',
    cover: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400',
    prompt:
      '镜头从云层之上俯冲而下，穿过晨雾笼罩的山谷，最终停在一座古老寺庙的门前，电影级运镜，4k',
    preferModels: ['sora-2-pro', 'sora-2', 'kling-v2-master', 'kling-v1-6'],
    suggestParams: { duration: 8, aspect_ratio: '16:9' },
  },
  {
    id: 'product-rotation',
    title: '商品 360° 展示',
    cover: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
    prompt:
      '一双白色运动鞋在转盘上 360 度缓慢旋转，工作室柔光，纯白背景，商业产品视频',
    preferModels: ['kling-v1-6', 'doubao-seedance-1-0-pro-250528'],
    suggestParams: { duration: 5, aspect_ratio: '1:1' },
  },
  {
    id: 'nature-doc',
    title: '自然纪录片',
    cover: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400',
    prompt:
      '一只蜂鸟悬停在红色花朵前，翅膀高速扇动产生光影涟漪，慢动作 240fps 质感，绿色虚化背景',
    preferModels: ['sora-2-pro', 'sora-2', 'veo-3'],
    suggestParams: { duration: 5, aspect_ratio: '16:9' },
  },
  {
    id: 'urban-life',
    title: '都市延时',
    cover: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400',
    prompt:
      '繁忙的东京涩谷十字路口延时摄影，从黄昏到入夜，霓虹与人流交织，城市生活',
    preferModels: ['sora-2', 'kling-v2-master', 'veo-3'],
    suggestParams: { duration: 8, aspect_ratio: '16:9' },
  },
];

export function getPresets(modality) {
  return modality === 'video' ? VIDEO_PRESETS : IMAGE_PRESETS;
}

// ===== 快速标签 =====
// 点击追加到 prompt 末尾，再次点击移除
export const QUICK_TAGS = {
  image: [
    {
      group: '🎨 风格',
      items: ['水彩', '油画', '动漫', '写实', '皮克斯', '极简线条', '赛博朋克', '复古胶片'],
    },
    {
      group: '📷 镜头',
      items: ['特写', '广角', '俯拍', '仰拍', '微距', '电影构图'],
    },
    {
      group: '💡 光线',
      items: ['柔光', '逆光', '戏剧光', '自然光', '霓虹光', '黄金时刻'],
    },
    {
      group: '🌈 色调',
      items: ['暖色调', '冷色调', '黑白', '高饱和', '复古褪色', '莫兰迪色'],
    },
  ],
  video: [
    {
      group: '🎬 运镜',
      items: ['推镜', '拉镜', '横摇', '俯冲', '跟随', '环绕'],
    },
    {
      group: '⏱ 节奏',
      items: ['慢动作', '延时摄影', '正常速度', '快速切换'],
    },
    {
      group: '💡 光线',
      items: ['黄金时刻', '蓝色时刻', '夜景', '柔和窗光', '戏剧光'],
    },
    {
      group: '🎨 风格',
      items: ['电影感', '纪录片', '动漫风格', '广告级', '复古胶片'],
    },
  ],
};

export function getQuickTags(modality) {
  return QUICK_TAGS[modality] || QUICK_TAGS.image;
}
