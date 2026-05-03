// hooks/creation/useMjTaskPolling.js
//
// MJ 任务轮询：GET /mj/task/:id/fetch
// 与视频任务轮询相似，但响应结构不同（progress 是 "0%" 字符串、status 是 SUCCESS / FAILURE / IN_PROGRESS）

import { useEffect, useRef } from 'react';
import { API } from '../../helpers/api';
import { mapMjStatusToUnified } from '../../services/creation/normalizer';
import { tokenAuthHeader } from '../../services/creation/tokens';

const TIMEOUT_MS = 15 * 60 * 1000;

function pickInterval(elapsedMs) {
  if (elapsedMs < 30_000) return 3_000;
  if (elapsedMs < 90_000) return 10_000;
  return 30_000;
}

export function useMjTaskPolling(taskId, { onUpdate, onTerminal } = {}) {
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
        const res = await API.get(`/mj/task/${encodeURIComponent(taskId)}/fetch`, {
          headers: tokenAuthHeader(),
        });
        if (cancelledRef.current) return;
        const t = res?.data?.data ?? res?.data;
        if (t && typeof t === 'object') {
          const unified = {
            status: mapMjStatusToUnified(t.status),
            progress: parseInt(String(t.progress || '0').replace('%', ''), 10) || 0,
            url: t.result_url || t.imageUrl || '',
            error: t.fail_reason ? { message: t.fail_reason } : undefined,
            metadata: { url: t.result_url || t.imageUrl || '' },
          };
          onUpdate?.(unified);
          if (unified.status === 'completed' || unified.status === 'failed') {
            onTerminal?.(unified);
            return;
          }
        }
      } catch (e) {
        console.warn('[creation] mj poll failed', e?.message);
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
