/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Button,
  Spin,
  Banner,
  Divider,
  Typography,
  Select,
  Switch,
  Input,
  InputNumber,
  Toast,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API } from '../../helpers';

const { Text } = Typography;

// 创作中心设置页（管理端）
//
// 配置 key 命名约定：creation_setting.{json_tag}
// 例如：creation_setting.s3_bucket、creation_setting.mirror_upstream_urls
//
// 注意：以 "Secret" / "secret" / "Key" 等结尾的 key 在 GET /api/option/ 中会被过滤，
// 因此 s3_access_key_secret 永远不会回填到表单——为空值即「保持原样不变」语义。

const PREFIX = 'creation_setting.';

// 表单字段定义；boolean 与 number 单独标注
const FIELDS = [
  { key: 'enabled', label: '启用创作中心', type: 'bool', help: '关闭后侧边栏菜单隐藏' },
  { key: 'upload_driver', label: '存储驱动', type: 'select', options: [{ label: 'Local 文件系统', value: 'local' }, { label: 'S3 / S3 兼容', value: 's3' }] },
  { key: 'upload_max_file_mb', label: '单文件最大体积 (MB)', type: 'number' },
  { key: 'upload_daily_quota_mb', label: '单用户每日配额 (MB，<= 0 不限)', type: 'number' },
  { key: 'cloud_gallery_enabled', label: '启用云端作品库', type: 'bool', help: '开启后作品自动同步到数据库；关闭则仅使用浏览器本地存储' },

  // local
  { key: 'local_upload_path', label: '本地存储根目录', type: 'text', section: 'local', placeholder: './data/uploads' },
  { key: 'local_public_base_url', label: '本地对外 URL 前缀（可选）', type: 'text', section: 'local', placeholder: '为空则使用 /api/upload/file/' },

  // s3
  { key: 's3_endpoint', label: 'S3 Endpoint', type: 'text', section: 's3', placeholder: 'https://s3.amazonaws.com（AWS 留空）/ https://oss-cn-hangzhou.aliyuncs.com / https://tos-s3-cn-beijing.volces.com' },
  { key: 's3_region', label: 'Region', type: 'text', section: 's3', placeholder: 'us-east-1 / cn-beijing 等' },
  { key: 's3_bucket', label: 'Bucket', type: 'text', section: 's3' },
  { key: 's3_access_key_id', label: 'Access Key ID', type: 'text', section: 's3' },
  { key: 's3_access_key_secret', label: 'Access Key Secret', type: 'password', section: 's3', help: '出于安全考虑当前值不显示。留空保持不变；填入新值后保存即覆盖。' },
  { key: 's3_use_path_style', label: '使用 Path Style（MinIO/部分私有部署需要）', type: 'bool', section: 's3' },
  { key: 's3_public_base_url', label: '自定义对外 URL 前缀（CDN）', type: 'text', section: 's3', placeholder: '为空按 endpoint+bucket 拼接' },
  { key: 's3_key_prefix', label: '对象 Key 前缀', type: 'text', section: 's3', placeholder: 'creation/' },

  // mirror
  { key: 'mirror_upstream_urls', label: '镜像上游 URL', type: 'bool', section: 'mirror', help: '可灵 / 火山方舟等返回的视频/图片 URL 一般 24 小时内有效。开启后任务成功时会异步把资源拉到本地存储并回写 URL。默认关闭。' },
  { key: 'mirror_download_timeout_sec', label: '下载超时（秒）', type: 'number', section: 'mirror' },
  { key: 'mirror_max_file_mb', label: '最大文件体积（MB）', type: 'number', section: 'mirror' },
];

export default function CreationSetting() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({});
  const [original, setOriginal] = useState({});
  const refForm = React.useRef();

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option/');
      if (!res?.data?.success) {
        Toast.error(res?.data?.message || t('加载失败'));
        return;
      }
      const next = {};
      for (const it of res.data.data || []) {
        if (typeof it.key === 'string' && it.key.startsWith(PREFIX)) {
          const k = it.key.slice(PREFIX.length);
          next[k] = it.value;
        }
      }
      // 转换类型
      const fixed = {};
      for (const f of FIELDS) {
        const raw = next[f.key];
        if (f.type === 'bool') {
          fixed[f.key] = raw === 'true' || raw === true;
        } else if (f.type === 'number') {
          fixed[f.key] = raw == null || raw === '' ? null : Number(raw);
        } else {
          fixed[f.key] = raw ?? '';
        }
      }
      setValues(fixed);
      setOriginal(fixed);
      refForm.current?.formApi?.setValues?.(fixed);
    } catch (e) {
      Toast.error(e?.message || t('加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    const changes = [];
    for (const f of FIELDS) {
      const cur = values[f.key];
      const old = original[f.key];
      // s3_access_key_secret：空值表示保持不变，不下发
      if (f.key === 's3_access_key_secret') {
        if (cur && String(cur).length > 0) changes.push([f.key, String(cur)]);
        continue;
      }
      const same = String(cur ?? '') === String(old ?? '');
      if (!same) {
        let v = cur;
        if (f.type === 'bool') v = v ? 'true' : 'false';
        else if (f.type === 'number') v = v == null ? '' : String(v);
        else v = String(v ?? '');
        changes.push([f.key, v]);
      }
    }
    if (!changes.length) {
      Toast.info(t('未检测到改动'));
      return;
    }
    setSaving(true);
    try {
      const tasks = changes.map(([k, v]) =>
        API.put('/api/option/', { key: PREFIX + k, value: v }),
      );
      const results = await Promise.allSettled(tasks);
      const failed = results.filter((r) => r.status === 'rejected' || r.value?.data?.success === false);
      if (failed.length) {
        Toast.error(t('部分项保存失败'));
      } else {
        Toast.success(t('保存成功'));
      }
      await load();
    } catch (e) {
      Toast.error(e?.message || t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f) => {
    const common = {
      field: f.key,
      label: t(f.label),
      extraText: f.help ? t(f.help) : undefined,
      style: { width: '100%' },
    };
    if (f.type === 'bool') {
      return (
        <Form.Switch {...common} />
      );
    }
    if (f.type === 'number') {
      return (
        <Form.InputNumber
          {...common}
          min={0}
          style={{ width: 200 }}
        />
      );
    }
    if (f.type === 'select') {
      return (
        <Form.Select
          {...common}
          optionList={f.options}
          style={{ width: 240 }}
        />
      );
    }
    if (f.type === 'password') {
      return (
        <Form.Input
          {...common}
          mode='password'
          placeholder={t('保持不变请留空')}
        />
      );
    }
    return (
      <Form.Input
        {...common}
        placeholder={f.placeholder ? t(f.placeholder) : ''}
      />
    );
  };

  const renderSection = (label, sectionKey) => {
    const items = FIELDS.filter((f) =>
      sectionKey ? f.section === sectionKey : !f.section,
    );
    if (!items.length) return null;
    return (
      <div className='mb-6'>
        {label && (
          <>
            <Text strong className='!text-sm block mb-2'>
              {t(label)}
            </Text>
            <Divider margin='8px' />
          </>
        )}
        {items.map((f) => (
          <div key={f.key} className='mb-3'>
            {renderField(f)}
          </div>
        ))}
      </div>
    );
  };

  const isS3 = values.upload_driver === 's3';

  return (
    <Spin spinning={loading} size='large'>
      <Card style={{ marginTop: 10 }}>
        <Banner
          type='info'
          fullMode={false}
          closeIcon={null}
          description={
            <span>
              {t('S3 / S3 兼容存储适配：AWS S3、阿里云 OSS、腾讯云 COS、火山引擎 TOS、MinIO 等。详见')}
              <a
                href='/docs/pm/creation-center-tech-design.md'
                target='_blank'
                rel='noreferrer'
                style={{ marginLeft: 4 }}
              >
                {t('技术设计文档')}
              </a>
            </span>
          }
        />

        <Form
          getFormApi={(api) => (refForm.current = { formApi: api })}
          initValues={values}
          onValueChange={(v) => setValues((prev) => ({ ...prev, ...v }))}
          style={{ marginTop: 16 }}
        >
          {renderSection('', null)}
          {!isS3 && renderSection('本地存储', 'local')}
          {isS3 && renderSection('S3 / S3 兼容存储', 's3')}
          {renderSection('上游 URL 镜像', 'mirror')}

          <Button theme='solid' type='primary' onClick={handleSave} loading={saving}>
            {t('保存')}
          </Button>
        </Form>
      </Card>
    </Spin>
  );
}
