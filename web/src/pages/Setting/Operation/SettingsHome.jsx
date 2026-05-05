/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Form,
  Row,
  Col,
  Spin,
  Toast,
  Card,
  Typography,
  Space,
} from '@douyinfe/semi-ui';
import { IconPlus, IconDelete } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../../helpers';

/**
 * SettingsHome — 首页内容配置(C 端首页所用的证言 / FAQ / Footer / SLA)。
 *
 * 后端 4 个 option key:
 *   HomeStatsSLA      string,如 "99.95"
 *   HomeTestimonials  JSON 数组 [{quote,name,title,avatar}]
 *   HomeFAQ           JSON 数组 [{question,answer}]
 *   HomeFooter        JSON 对象 {tagline, columns:[{title,links:[{text,url}]}], copyright}
 *
 * 这里把它们做成可视化表单,管理员不直接写 JSON。
 */
export default function SettingsHome(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const refForm = useRef();

  const [sla, setSla] = useState('');
  const [testimonials, setTestimonials] = useState([]);
  const [faq, setFaq] = useState([]);
  const [footer, setFooter] = useState({ tagline: '', columns: [], copyright: '' });

  const safeParseArray = (s) => {
    if (!s) return [];
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const safeParseObject = (s) => {
    if (!s) return {};
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  };

  useEffect(() => {
    const opts = props.options || {};
    setSla(opts.HomeStatsSLA || '');
    setTestimonials(safeParseArray(opts.HomeTestimonials));
    setFaq(safeParseArray(opts.HomeFAQ));
    const f = safeParseObject(opts.HomeFooter);
    setFooter({
      tagline: f.tagline || '',
      columns: Array.isArray(f.columns) ? f.columns : [],
      copyright: f.copyright || '',
    });
  }, [props.options]);

  const submit = async (key, value) => {
    try {
      const res = await API.put('/api/option/', { key, value });
      const { success, message } = res.data;
      if (!success) {
        showError(message || t('保存失败'));
        return false;
      }
      return true;
    } catch (e) {
      showError(t('保存失败'));
      return false;
    }
  };

  const onSubmitAll = async () => {
    setLoading(true);
    try {
      const ok1 = await submit('HomeStatsSLA', sla);
      const ok2 = await submit('HomeTestimonials', JSON.stringify(testimonials));
      const ok3 = await submit('HomeFAQ', JSON.stringify(faq));
      const ok4 = await submit(
        'HomeFooter',
        JSON.stringify({
          tagline: footer.tagline,
          columns: footer.columns,
          copyright: footer.copyright,
        }),
      );
      if (ok1 && ok2 && ok3 && ok4) {
        showSuccess(t('首页配置已保存,5 分钟内全站生效(或重启容器立即生效)'));
        props.refresh?.();
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── 证言操作 ────────────────────────────────────────
  const addTestimonial = () =>
    setTestimonials([
      ...testimonials,
      { quote: '', name: '', title: '', avatar: 'from-slate-400 to-slate-600' },
    ]);
  const updateTestimonial = (i, patch) => {
    const next = [...testimonials];
    next[i] = { ...next[i], ...patch };
    setTestimonials(next);
  };
  const removeTestimonial = (i) => setTestimonials(testimonials.filter((_, idx) => idx !== i));

  // ─── FAQ 操作 ────────────────────────────────────────
  const addFAQ = () => setFaq([...faq, { question: '', answer: '' }]);
  const updateFAQ = (i, patch) => {
    const next = [...faq];
    next[i] = { ...next[i], ...patch };
    setFaq(next);
  };
  const removeFAQ = (i) => setFaq(faq.filter((_, idx) => idx !== i));

  // ─── Footer 列操作 ────────────────────────────────────
  const addColumn = () =>
    setFooter({ ...footer, columns: [...footer.columns, { title: '', links: [] }] });
  const updateColumn = (i, patch) => {
    const next = [...footer.columns];
    next[i] = { ...next[i], ...patch };
    setFooter({ ...footer, columns: next });
  };
  const removeColumn = (i) =>
    setFooter({ ...footer, columns: footer.columns.filter((_, idx) => idx !== i) });
  const addLink = (ci) => {
    const cols = [...footer.columns];
    cols[ci] = { ...cols[ci], links: [...(cols[ci].links || []), { text: '', url: '' }] };
    setFooter({ ...footer, columns: cols });
  };
  const updateLink = (ci, li, patch) => {
    const cols = [...footer.columns];
    const links = [...(cols[ci].links || [])];
    links[li] = { ...links[li], ...patch };
    cols[ci] = { ...cols[ci], links };
    setFooter({ ...footer, columns: cols });
  };
  const removeLink = (ci, li) => {
    const cols = [...footer.columns];
    cols[ci] = {
      ...cols[ci],
      links: (cols[ci].links || []).filter((_, idx) => idx !== li),
    };
    setFooter({ ...footer, columns: cols });
  };

  return (
    <Spin spinning={loading}>
      <Form
        getFormApi={(api) => (refForm.current = api)}
        layout='vertical'
      >
        <Form.Section text={t('首页配置')}>
          <Typography.Text type='tertiary' className='!text-xs !mb-3 !block'>
            {t('对应 C 端首页 (/) 的证言、FAQ、Footer、SLA 等数据。修改后 5 分钟内生效或重启容器立即生效。')}
          </Typography.Text>

          {/* SLA */}
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <div className='mb-1 text-sm font-medium'>{t('SLA 可用性 (%)')}</div>
              <input
                type='text'
                className='w-full px-3 py-2 border border-slate-200 rounded-md text-sm'
                value={sla}
                onChange={(e) => setSla(e.target.value)}
                placeholder='99.95'
              />
              <Typography.Text type='tertiary' className='!text-xs !mt-1 !block'>
                {t('展示在 Hero 区数字条中。仅作展示,不参与计费。')}
              </Typography.Text>
            </Col>
          </Row>

          {/* 证言 */}
          <Card style={{ marginTop: 24 }} bordered>
            <div className='flex items-center justify-between mb-3'>
              <div>
                <Typography.Title heading={6} className='!mb-0'>
                  {t('用户证言')}
                </Typography.Title>
                <Typography.Text type='tertiary' className='!text-xs'>
                  {t('展示在 Testimonials 区。建议 3 条左右。')}
                </Typography.Text>
              </div>
              <Button icon={<IconPlus />} onClick={addTestimonial}>
                {t('新增')}
              </Button>
            </div>
            {testimonials.length === 0 && (
              <div className='text-center py-6 text-slate-400 text-sm'>{t('暂无证言')}</div>
            )}
            <Space vertical style={{ width: '100%' }} spacing={12}>
              {testimonials.map((it, i) => (
                <Card key={i} bordered className='!bg-slate-50/40'>
                  <Row gutter={12}>
                    <Col span={24}>
                      <div className='mb-1 text-xs text-slate-500'>{t('引用')}</div>
                      <textarea
                        className='w-full px-3 py-2 border border-slate-200 rounded-md text-sm'
                        rows={3}
                        value={it.quote || ''}
                        onChange={(e) => updateTestimonial(i, { quote: e.target.value })}
                        placeholder={t('客户的原话(不要加引号)')}
                      />
                    </Col>
                    <Col xs={24} sm={8}>
                      <div className='mb-1 mt-2 text-xs text-slate-500'>{t('姓名')}</div>
                      <input
                        type='text'
                        className='w-full px-3 py-2 border border-slate-200 rounded-md text-sm'
                        value={it.name || ''}
                        onChange={(e) => updateTestimonial(i, { name: e.target.value })}
                      />
                    </Col>
                    <Col xs={24} sm={8}>
                      <div className='mb-1 mt-2 text-xs text-slate-500'>{t('职位')}</div>
                      <input
                        type='text'
                        className='w-full px-3 py-2 border border-slate-200 rounded-md text-sm'
                        value={it.title || ''}
                        onChange={(e) => updateTestimonial(i, { title: e.target.value })}
                      />
                    </Col>
                    <Col xs={24} sm={8}>
                      <div className='mb-1 mt-2 text-xs text-slate-500'>
                        {t('头像渐变 (Tailwind class)')}
                      </div>
                      <input
                        type='text'
                        className='w-full px-3 py-2 border border-slate-200 rounded-md text-sm'
                        value={it.avatar || ''}
                        onChange={(e) => updateTestimonial(i, { avatar: e.target.value })}
                        placeholder='from-orange-400 to-pink-500'
                      />
                    </Col>
                    <Col span={24} style={{ marginTop: 12 }}>
                      <Button
                        type='danger'
                        size='small'
                        icon={<IconDelete />}
                        onClick={() => removeTestimonial(i)}
                      >
                        {t('删除')}
                      </Button>
                    </Col>
                  </Row>
                </Card>
              ))}
            </Space>
          </Card>

          {/* FAQ */}
          <Card style={{ marginTop: 24 }} bordered>
            <div className='flex items-center justify-between mb-3'>
              <div>
                <Typography.Title heading={6} className='!mb-0'>
                  {t('常见问题 FAQ')}
                </Typography.Title>
                <Typography.Text type='tertiary' className='!text-xs'>
                  {t('展示在 FAQ 区。建议 5 条以内,问题简洁有力。')}
                </Typography.Text>
              </div>
              <Button icon={<IconPlus />} onClick={addFAQ}>
                {t('新增')}
              </Button>
            </div>
            {faq.length === 0 && (
              <div className='text-center py-6 text-slate-400 text-sm'>{t('暂无 FAQ')}</div>
            )}
            <Space vertical style={{ width: '100%' }} spacing={12}>
              {faq.map((it, i) => (
                <Card key={i} bordered className='!bg-slate-50/40'>
                  <Row gutter={12}>
                    <Col span={24}>
                      <div className='mb-1 text-xs text-slate-500'>{t('问题')}</div>
                      <input
                        type='text'
                        className='w-full px-3 py-2 border border-slate-200 rounded-md text-sm'
                        value={it.question || ''}
                        onChange={(e) => updateFAQ(i, { question: e.target.value })}
                      />
                    </Col>
                    <Col span={24}>
                      <div className='mb-1 mt-2 text-xs text-slate-500'>{t('答案')}</div>
                      <textarea
                        className='w-full px-3 py-2 border border-slate-200 rounded-md text-sm'
                        rows={3}
                        value={it.answer || ''}
                        onChange={(e) => updateFAQ(i, { answer: e.target.value })}
                      />
                    </Col>
                    <Col span={24} style={{ marginTop: 12 }}>
                      <Button
                        type='danger'
                        size='small'
                        icon={<IconDelete />}
                        onClick={() => removeFAQ(i)}
                      >
                        {t('删除')}
                      </Button>
                    </Col>
                  </Row>
                </Card>
              ))}
            </Space>
          </Card>

          {/* Footer */}
          <Card style={{ marginTop: 24 }} bordered>
            <Typography.Title heading={6} className='!mb-0'>
              {t('页脚 Footer')}
            </Typography.Title>
            <Typography.Text type='tertiary' className='!text-xs'>
              {t('展示在首页底部 dark footer。建议 2-3 列。')}
            </Typography.Text>
            <Row gutter={16} style={{ marginTop: 12 }}>
              <Col xs={24} sm={16}>
                <div className='mb-1 text-xs text-slate-500'>{t('副标题 / 简介')}</div>
                <input
                  type='text'
                  className='w-full px-3 py-2 border border-slate-200 rounded-md text-sm'
                  value={footer.tagline}
                  onChange={(e) => setFooter({ ...footer, tagline: e.target.value })}
                  placeholder={t('统一的 AI 模型聚合与分发网关')}
                />
              </Col>
              <Col xs={24} sm={8}>
                <div className='mb-1 text-xs text-slate-500'>{t('版权信息')}</div>
                <input
                  type='text'
                  className='w-full px-3 py-2 border border-slate-200 rounded-md text-sm'
                  value={footer.copyright}
                  onChange={(e) => setFooter({ ...footer, copyright: e.target.value })}
                  placeholder='© 2026 QuantumNous · ICP 备 XXXX'
                />
              </Col>
            </Row>

            <div className='flex items-center justify-between mt-5 mb-2'>
              <Typography.Text strong className='!text-sm'>
                {t('链接列')}
              </Typography.Text>
              <Button size='small' icon={<IconPlus />} onClick={addColumn}>
                {t('新增列')}
              </Button>
            </div>
            <Space vertical style={{ width: '100%' }} spacing={12}>
              {(footer.columns || []).map((col, ci) => (
                <Card key={ci} bordered className='!bg-slate-50/40'>
                  <Row gutter={12}>
                    <Col xs={24} sm={20}>
                      <div className='mb-1 text-xs text-slate-500'>{t('列标题')}</div>
                      <input
                        type='text'
                        className='w-full px-3 py-2 border border-slate-200 rounded-md text-sm'
                        value={col.title || ''}
                        onChange={(e) => updateColumn(ci, { title: e.target.value })}
                        placeholder={t('产品 / 开发者 / 公司')}
                      />
                    </Col>
                    <Col xs={24} sm={4} className='!flex !items-end'>
                      <Button
                        type='danger'
                        size='small'
                        icon={<IconDelete />}
                        onClick={() => removeColumn(ci)}
                      >
                        {t('删除列')}
                      </Button>
                    </Col>
                  </Row>
                  <div className='mt-3 flex items-center justify-between'>
                    <Typography.Text type='tertiary' className='!text-xs'>
                      {t('链接项')}
                    </Typography.Text>
                    <Button size='small' onClick={() => addLink(ci)}>
                      {t('+ 链接')}
                    </Button>
                  </div>
                  <Space vertical style={{ width: '100%', marginTop: 8 }} spacing={6}>
                    {(col.links || []).map((link, li) => (
                      <Row key={li} gutter={8}>
                        <Col xs={10}>
                          <input
                            type='text'
                            className='w-full px-2 py-1.5 border border-slate-200 rounded text-sm'
                            value={link.text || ''}
                            onChange={(e) => updateLink(ci, li, { text: e.target.value })}
                            placeholder={t('文本')}
                          />
                        </Col>
                        <Col xs={12}>
                          <input
                            type='text'
                            className='w-full px-2 py-1.5 border border-slate-200 rounded text-sm'
                            value={link.url || ''}
                            onChange={(e) => updateLink(ci, li, { url: e.target.value })}
                            placeholder='/docs 或 https://...'
                          />
                        </Col>
                        <Col xs={2}>
                          <Button
                            type='danger'
                            size='small'
                            icon={<IconDelete />}
                            onClick={() => removeLink(ci, li)}
                          />
                        </Col>
                      </Row>
                    ))}
                  </Space>
                </Card>
              ))}
            </Space>
          </Card>

          <div style={{ marginTop: 24 }}>
            <Button theme='solid' type='primary' onClick={onSubmitAll}>
              {t('保存首页配置')}
            </Button>
          </div>
        </Form.Section>
      </Form>
    </Spin>
  );
}
