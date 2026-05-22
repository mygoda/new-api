// Sidebar grouping + flat order for prev/next.
// Group titles and item labels are written in zh-CN; i18n keys = zh source.

export const navGroups = [
  {
    key: 'guide',
    title: '入门指南',
    items: [
      { path: '/docs', label: '简介', hideInSidebar: true },
      { path: '/docs/guide/getting-started', label: '快速开始' },
      { path: '/docs/guide/examples', label: '代码示例' },
      { path: '/docs/guide/reference', label: 'API 参考' },
      { path: '/docs/guide/data-export', label: '日志查询与导出' },
    ],
  },
  {
    key: 'api',
    title: 'API 参考',
    items: [
      { path: '/docs/api/chat', label: '聊天 Chat' },
      { path: '/docs/api/embeddings', label: '嵌入 Embeddings' },
      { path: '/docs/api/images', label: '图像 Images' },
      { path: '/docs/api/audio', label: '音频 Audio' },
      { path: '/docs/api/rerank', label: '重排 Rerank' },
      { path: '/docs/api/realtime', label: '实时 Realtime' },
      { path: '/docs/api/music', label: '音乐 Music' },
      { path: '/docs/api/video', label: '视频 Video' },
    ],
  },
  {
    key: 'tools-cli',
    title: '工具集成 · CLI',
    items: [
      { path: '/docs/tools/claude-code', label: 'Claude Code' },
      { path: '/docs/tools/codex', label: 'Codex (OpenAI)' },
      { path: '/docs/tools/opencode', label: 'OpenCode' },
      { path: '/docs/tools/openclaw', label: 'OpenClaw' },
    ],
  },
  {
    key: 'tools-ide',
    title: '工具集成 · IDE',
    items: [
      { path: '/docs/tools/cursor', label: 'Cursor' },
      { path: '/docs/tools/trae', label: 'TRAE' },
    ],
  },
  {
    key: 'tools-vscode',
    title: '工具集成 · VS Code 插件',
    items: [
      { path: '/docs/tools/continue', label: 'Continue' },
      { path: '/docs/tools/cline', label: 'Cline' },
      { path: '/docs/tools/kilo-code', label: 'Kilo Code' },
    ],
  },
  {
    key: 'tools-desktop',
    title: '工具集成 · 桌面客户端',
    items: [
      { path: '/docs/tools/desktop', label: 'Cherry Studio / ChatBox / NextChat' },
    ],
  },
  {
    key: 'other',
    title: '其他',
    items: [
      { path: '/docs/faq', label: '常见问题' },
    ],
  },
];

// Flat ordered list for prev/next nav. Excludes hideInSidebar entries.
export const flatNav = navGroups.flatMap((g) =>
  g.items.filter((i) => !i.hideInSidebar).map((i) => ({ ...i, group: g.title })),
);

export const findAdjacent = (currentPath) => {
  const idx = flatNav.findIndex((i) => i.path === currentPath);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? flatNav[idx - 1] : null,
    next: idx < flatNav.length - 1 ? flatNav[idx + 1] : null,
  };
};

// Top-bar primary nav items (mimics cubicspaces top menu).
export const topNav = [
  { path: '/docs', label: '首页', match: (p) => p === '/docs' },
  { path: '/docs/guide/getting-started', label: '快速开始', match: (p) => p.startsWith('/docs/guide') && !p.startsWith('/docs/guide/reference') && !p.startsWith('/docs/guide/data-export') },
  {
    label: 'API 参考',
    match: (p) => p.startsWith('/docs/api') || p === '/docs/guide/reference',
    children: [
      { path: '/docs/guide/reference', label: 'API 参考索引' },
      { path: '/docs/api/chat', label: '聊天 Chat' },
      { path: '/docs/api/images', label: '图像 Images' },
      { path: '/docs/api/audio', label: '音频 Audio' },
      { path: '/docs/api/video', label: '视频 Video' },
      { path: '/docs/guide/data-export', label: '日志查询与导出' },
    ],
  },
  {
    label: '工具集成',
    match: (p) => p.startsWith('/docs/tools'),
    children: [
      { path: '/docs/tools/claude-code', label: 'Claude Code' },
      { path: '/docs/tools/codex', label: 'Codex' },
      { path: '/docs/tools/cursor', label: 'Cursor' },
      { path: '/docs/tools/desktop', label: '桌面客户端' },
    ],
  },
  { path: '/docs/faq', label: '常见问题', match: (p) => p === '/docs/faq' },
];
