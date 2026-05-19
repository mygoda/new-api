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

// uploadToVolcAsset 把文件上传到火山方舟 Files API,
// 拿到 asset_url (asset://file-xxxx) 供 Seedance 2.0 引用。
//
// 必须传 modelName,后端按 model 路由到对应渠道,用该渠道的 API Key Bearer 转发。
// 返回 { id, asset_url, bytes, expire_at, filename, status, mime_type, channel_id }
//
// 失败抛错由调用方处理,典型错误:
//   - missing_model:    没传 modelName
//   - no_channel:       该 model 没有可用渠道
//   - channel_no_key:   渠道未配置 API Key
//   - file_too_large:   >512 MB
export async function uploadToVolcAsset(file, modelName) {
  if (!(file instanceof File || file instanceof Blob)) {
    throw new Error('NOT_A_FILE');
  }
  if (!modelName) {
    throw new Error('missing_model');
  }
  const fd = new FormData();
  fd.append('file', file);
  const res = await API.post(
    `/api/creation/upload/volc-asset?model=${encodeURIComponent(modelName)}`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  if (!res?.data?.success) {
    throw new Error(res?.data?.message || 'VOLC_UPLOAD_FAILED');
  }
  return res.data.data;
}
