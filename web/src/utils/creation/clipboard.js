/*
Copyright (C) 2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { Toast } from '@douyinfe/semi-ui';

// 写剪贴板。
// 优先 navigator.clipboard（仅 HTTPS / localhost 可用），
// 非安全上下文（HTTP 站点）时回退到 document.execCommand('copy')。
// 返回 true/false 表示是否成功，并统一 Toast 反馈。
export async function copyText(text, { silent = false } = {}) {
  const value = text == null ? '' : String(text);

  // 优先路径
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function' &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(value);
      if (!silent) Toast.success('已复制到剪贴板');
      return true;
    }
  } catch {
    // 继续走降级
  }

  // 降级：textarea + execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) {
      if (!silent) Toast.success('已复制到剪贴板');
      return true;
    }
  } catch {
    // fall through
  }

  if (!silent) Toast.error('复制失败，请手动选中文本复制');
  return false;
}

// 下载远端文件。
// 优先 fetch → blob → <a download>（可控制文件名、强制下载）。
// 跨域 CORS 阻断时回退到直接 <a download href>（浏览器会尝试下载或预览）。
export async function downloadUrl(url, filename) {
  if (!url) return false;
  const inferredName =
    filename ||
    (() => {
      try {
        const u = new URL(url, window.location.origin);
        const base = u.pathname.split('/').pop() || 'download';
        return base.includes('.') ? base : `${base}.png`;
      } catch {
        return `download-${Date.now()}.png`;
      }
    })();

  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = inferredName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    Toast.success('下载已开始');
    return true;
  } catch {
    // CORS 或网络失败 → 直接 <a download>（成功与否看 Content-Disposition）
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = inferredName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch {
      Toast.error('下载失败，请右键图片另存为');
      return false;
    }
  }
}
