// hooks/creation/useDebugState.js
//
// 跟踪一次提交的调试数据，喂给 playground/DebugPanel：
//   - previewRequest  实时拼接的预览请求体（normalize 后的 body）
//   - request         实际发出去的请求体
//   - response        响应（图像同步，或 task 提交成功的返回）
//   - curl            等价 cURL
//   - timestamp       最后请求时间
//   - previewTimestamp 预览更新时间

import { useState, useCallback, useMemo } from 'react';

export function useDebugState() {
  const [showPanel, setShowPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');
  const [debugData, setDebugData] = useState({
    previewRequest: null,
    previewTimestamp: null,
    request: null,
    response: null,
    sseMessages: [],
    timestamp: null,
  });

  const setPreview = useCallback((req, curl) => {
    setDebugData((prev) => ({
      ...prev,
      previewRequest: req ? JSON.stringify(req, null, 2) : null,
      previewTimestamp: Date.now(),
      curl: curl || prev.curl,
    }));
  }, []);

  const setRequest = useCallback((req) => {
    setDebugData((prev) => ({
      ...prev,
      request: req ? JSON.stringify(req, null, 2) : null,
      timestamp: Date.now(),
    }));
  }, []);

  const setResponse = useCallback((resp) => {
    setDebugData((prev) => ({
      ...prev,
      response: resp ? JSON.stringify(resp, null, 2) : null,
      timestamp: Date.now(),
    }));
  }, []);

  const togglePanel = useCallback(() => {
    setShowPanel((v) => !v);
  }, []);

  return useMemo(
    () => ({
      showPanel,
      togglePanel,
      activeTab,
      setActiveTab,
      debugData,
      setPreview,
      setRequest,
      setResponse,
    }),
    [showPanel, togglePanel, activeTab, debugData, setPreview, setRequest, setResponse],
  );
}
