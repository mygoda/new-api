// services/creation/imageUpload.js
//
// 上传一张本地文件到后端图床（POST /api/upload/image），返回 { url, key }
// 失败时抛错，调用方处理。

import { API } from '../../helpers/api';

export async function uploadImage(file) {
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
  return res.data.data; // { url, key, size_bytes, mime, driver }
}
