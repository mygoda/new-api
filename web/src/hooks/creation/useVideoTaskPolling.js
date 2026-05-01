// hooks/creation/useVideoTaskPolling.js
//
// 单任务的指数退避轮询：
//   - 0-30s：3s/次
//   - 30-90s：10s/次
//   - 90s-15min：30s/次
//   - >15min：停止，提示「任务仍在处理」

import { useEffect, useRef } from 'react';
import { API } from '../../helpers/api';

const TIMEOUT_MS = 15 * 60 * 1000;

function pickInterval(elapsedMs) {
  if (elapsedMs < 30_000) return 3_000;
  if (elapsedMs < 90_000) return 10_000;
  return 30_000;
}

const TERMINAL_STATUSES = ['completed', 'failed', 'expired', 'canceled'];

export function useVideoTaskPolling(taskId, { onUpdate, onTerminal } = {}) {
  const timerRef = useRef(null);
  const cancelledRef = useRef(false);
  const startRef = useRef(0);

  useEffect(() => {
    if (!taskId) return undefined;
    cancelledRef.current = false;
    startRef.current = Date.now();

    const tick = async () => {
      if (cancelledRef.current) return;
      try {
        const res = await API.get(
          `/v1/video/generations/${encodeURIComponent(taskId)}`,
        );
        if (cancelledRef.current) return;
        // axios response.data 有可能是 OpenAIVideo 直接对象，也可能是 { data: {...} } wrapper
        const payload = res?.data?.data ?? res?.data;
        if (payload && typeof payload === 'object') {
          onUpdate?.(payload);
          if (TERMINAL_STATUSES.includes(payload.status)) {
            onTerminal?.(payload);
            return;
          }
        }
      } catch (e) {
        // 网络抖动 — 静默重试，不弹错
        console.warn('[creation] poll failed', e?.message);
      }
      const elapsed = Date.now() - startRef.current;
      if (elapsed > TIMEOUT_MS) {
        onTerminal?.({ status: 'timeout' });
        return;
      }
      timerRef.current = setTimeout(tick, pickInterval(elapsed));
    };

    tick();
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);
}
