// services/creation/fileUpload.js
//
// 通用本地文件上传 → 后端图床（POST /api/upload/image，名称沿用旧路由）。
// 后端按 MIME 嗅探落地，支持 image / video / audio 三类。
//
// 返回：{ url, key, size_bytes, mime, driver }
// 失败抛错由调用方处理。

import { API } from '../../helpers/api';

export async function uploadFile(file) {
  if (!(file instanceof File || file instanceof Blob)) {
    throw new Error('NOT_A_FILE');
  }
  const fd = new FormData();
  fd.append('file', file);
  const res = await API.post('/api/upload/image', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  if (!res?.data?.success) {
    throw new Error(res?.data?.message || 'UPLOAD_FAILED');
  }
  return res.data.data;
}

// 旧 API 别名,保留导入兼容
export const uploadImage = uploadFile;
export const uploadVideo = uploadFile;
export const uploadAudio = uploadFile;
