// hooks/creation/useDebugState.js
//
// 跟踪一次提交的调试数据：
//   - previewReq      实时拼接的预览 req 对象 ({ url, method, body })
//   - previewRequest  预览请求体的格式化 JSON 字符串
//   - request         实际发出去的请求体 JSON 字符串
//   - requestReq      实际发出去的 req 对象（含 URL/method/body）
//   - response        响应（图像同步，或 task 提交成功的返回）
//   - timestamp       最后请求时间
//   - previewTimestamp 预览更新时间

import { useState, useCallback, useMemo } from 'react';

export function useDebugState() {
  const [showPanel, setShowPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');
  const [debugData, setDebugData] = useState({
    previewReq: null,
    previewRequest: null,
    previewTimestamp: null,
    requestReq: null,
    request: null,
    response: null,
    sseMessages: [],
    timestamp: null,
  });

  const setPreview = useCallback((req) => {
    setDebugData((prev) => ({
      ...prev,
      previewReq: req || null,
      previewRequest: req ? JSON.stringify(req.body, null, 2) : null,
      previewTimestamp: Date.now(),
    }));
  }, []);

  const setRequest = useCallback((req) => {
    setDebugData((prev) => ({
      ...prev,
      requestReq: req || null,
      request: req ? JSON.stringify(req.body, null, 2) : null,
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
