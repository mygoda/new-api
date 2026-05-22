import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from '@douyinfe/semi-ui';
import DocsLayout from './DocsLayout';

const Home = lazy(() => import('./pages/Home'));
const GettingStarted = lazy(() => import('./pages/guide/GettingStarted'));
const Examples = lazy(() => import('./pages/guide/Examples'));
const Reference = lazy(() => import('./pages/guide/Reference'));
const DataExport = lazy(() => import('./pages/guide/DataExport'));
const Faq = lazy(() => import('./pages/Faq'));

const ApiChat = lazy(() => import('./pages/api/ApiChat'));
const ApiEmbeddings = lazy(() => import('./pages/api/ApiEmbeddings'));
const ApiImages = lazy(() => import('./pages/api/ApiImages'));
const ApiAudio = lazy(() => import('./pages/api/ApiAudio'));
const ApiRerank = lazy(() => import('./pages/api/ApiRerank'));
const ApiRealtime = lazy(() => import('./pages/api/ApiRealtime'));
const ApiMusic = lazy(() => import('./pages/api/ApiMusic'));
const ApiVideo = lazy(() => import('./pages/api/ApiVideo'));

const ToolsClaudeCode = lazy(() => import('./pages/tools/ToolsClaudeCode'));
const ToolsCodex = lazy(() => import('./pages/tools/ToolsCodex'));
const ToolsOpenCode = lazy(() => import('./pages/tools/ToolsOpenCode'));
const ToolsOpenClaw = lazy(() => import('./pages/tools/ToolsOpenClaw'));
const ToolsCursor = lazy(() => import('./pages/tools/ToolsCursor'));
const ToolsTrae = lazy(() => import('./pages/tools/ToolsTrae'));
const ToolsContinue = lazy(() => import('./pages/tools/ToolsContinue'));
const ToolsCline = lazy(() => import('./pages/tools/ToolsCline'));
const ToolsKiloCode = lazy(() => import('./pages/tools/ToolsKiloCode'));
const ToolsDesktop = lazy(() => import('./pages/tools/ToolsDesktop'));

const PageFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
    <Spin size='large' />
  </div>
);

const Docs = () => (
  <DocsLayout>
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route index element={<Home />} />
        <Route path='guide/getting-started' element={<GettingStarted />} />
        <Route path='guide/examples' element={<Examples />} />
        <Route path='guide/reference' element={<Reference />} />
        <Route path='guide/data-export' element={<DataExport />} />

        <Route path='api/chat' element={<ApiChat />} />
        <Route path='api/embeddings' element={<ApiEmbeddings />} />
        <Route path='api/images' element={<ApiImages />} />
        <Route path='api/audio' element={<ApiAudio />} />
        <Route path='api/rerank' element={<ApiRerank />} />
        <Route path='api/realtime' element={<ApiRealtime />} />
        <Route path='api/music' element={<ApiMusic />} />
        <Route path='api/video' element={<ApiVideo />} />

        <Route path='tools/claude-code' element={<ToolsClaudeCode />} />
        <Route path='tools/codex' element={<ToolsCodex />} />
        <Route path='tools/opencode' element={<ToolsOpenCode />} />
        <Route path='tools/openclaw' element={<ToolsOpenClaw />} />
        <Route path='tools/cursor' element={<ToolsCursor />} />
        <Route path='tools/trae' element={<ToolsTrae />} />
        <Route path='tools/continue' element={<ToolsContinue />} />
        <Route path='tools/cline' element={<ToolsCline />} />
        <Route path='tools/kilo-code' element={<ToolsKiloCode />} />
        <Route path='tools/desktop' element={<ToolsDesktop />} />

        <Route path='faq' element={<Faq />} />

        <Route path='*' element={<Navigate to='/docs' replace />} />
      </Routes>
    </Suspense>
  </DocsLayout>
);

export default Docs;
