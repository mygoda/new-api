/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useState, useEffect, useRef, useMemo } from 'react';
import JSONEditor from '../../../common/ui/JSONEditor';
import {
  Banner,
  SideSheet,
  Form,
  Button,
  Space,
  Spin,
  Typography,
  Card,
  Tag,
  Avatar,
  Col,
  Row,
} from '@douyinfe/semi-ui';
import { Save, X, FileText } from 'lucide-react';
import { IconAlertTriangle, IconLink } from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../../../helpers';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

const { Text, Title } = Typography;

// Example endpoint template for quick fill
const ENDPOINT_TEMPLATE = {
  openai: { path: '/v1/chat/completions', method: 'POST' },
  'openai-response': { path: '/v1/responses', method: 'POST' },
  'openai-response-compact': { path: '/v1/responses/compact', method: 'POST' },
  anthropic: { path: '/v1/messages', method: 'POST' },
  gemini: { path: '/v1beta/models/{model}:generateContent', method: 'POST' },
  'jina-rerank': { path: '/v1/rerank', method: 'POST' },
  'image-generation': { path: '/v1/images/generations', method: 'POST' },
};

const nameRuleOptions = [
  { label: '精确名称匹配', value: 0 },
  { label: '前缀名称匹配', value: 1 },
  { label: '包含名称匹配', value: 2 },
  { label: '后缀名称匹配', value: 3 },
];

const EditModelModal = (props) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();
  const formApiRef = useRef(null);
  const isEdit = props.editingModel && props.editingModel.id !== undefined;
  const placement = useMemo(() => (isEdit ? 'right' : 'left'), [isEdit]);

  // 供应商列表
  const [vendors, setVendors] = useState([]);

  // 渠道管理中已配置的模型列表（用于创建模型时模糊搜索）
  const [channelModels, setChannelModels] = useState([]);
  // 模型名输入框当前的搜索关键字（用于实时过滤下拉项）
  const [modelNameSearch, setModelNameSearch] = useState('');

  // 预填组（标签、端点）
  const [tagGroups, setTagGroups] = useState([]);
  const [endpointGroups, setEndpointGroups] = useState([]);

  // 获取供应商列表
  const fetchVendors = async () => {
    try {
      const res = await API.get('/api/vendors/?page_size=1000'); // 获取全部供应商
      if (res.data.success) {
        const items = res.data.data.items || res.data.data || [];
        setVendors(Array.isArray(items) ? items : []);
      }
    } catch (error) {
      // ignore
    }
  };

  // 获取渠道管理中已启用的模型名列表
  const fetchChannelModels = async () => {
    try {
      const res = await API.get('/api/channel/models_enabled');
      if (res.data.success) {
        const list = Array.isArray(res.data.data) ? res.data.data : [];
        // 去重 + 排序
        setChannelModels([...new Set(list)].sort());
      }
    } catch (error) {
      // ignore
    }
  };

  // 获取预填组（标签、端点）
  const fetchPrefillGroups = async () => {
    try {
      const [tagRes, endpointRes] = await Promise.all([
        API.get('/api/prefill_group?type=tag'),
        API.get('/api/prefill_group?type=endpoint'),
      ]);
      if (tagRes?.data?.success) {
        setTagGroups(tagRes.data.data || []);
      }
      if (endpointRes?.data?.success) {
        setEndpointGroups(endpointRes.data.data || []);
      }
    } catch (error) {
      // ignore
    }
  };

  useEffect(() => {
    if (props.visiable) {
      fetchVendors();
      fetchPrefillGroups();
      fetchChannelModels();
    }
  }, [props.visiable]);

  // 根据用户输入实时计算下拉候选项（不区分大小写 substring 匹配）
  const filteredChannelModels = useMemo(() => {
    const kw = (modelNameSearch || '').trim().toLowerCase();
    if (!kw) return channelModels;
    return channelModels.filter((m) => m.toLowerCase().includes(kw));
  }, [channelModels, modelNameSearch]);

  const getInitValues = () => ({
    model_name: props.editingModel?.model_name || '',
    description: '',
    icon: '',
    tags: [],
    vendor_id: undefined,
    vendor: '',
    vendor_icon: '',
    context_length: '',
    max_output_tokens: '',
    capabilities_list: [],
    knowledge_cutoff: '',
    long_description: '',
    endpoints: '',
    creation_target: '',
    home_priority: 0,
    video_input_ratio: 0,
    name_rule: props.editingModel?.model_name ? 0 : undefined, // 通过未配置模型过来的固定为精确匹配
    status: true,
    sync_official: true,
  });

  const handleCancel = () => {
    props.handleClose();
  };

  const loadModel = async () => {
    if (!isEdit || !props.editingModel.id) return;

    setLoading(true);
    try {
      const res = await API.get(`/api/models/${props.editingModel.id}`);
      const { success, message, data } = res.data;
      if (success) {
        // 处理tags
        if (data.tags) {
          data.tags = data.tags.split(',').filter(Boolean);
        } else {
          data.tags = [];
        }
        // 拆解 capabilities csv → 数组（前端 CheckboxGroup 用）
        data.capabilities_list = data.capabilities
          ? data.capabilities.split(',').filter(Boolean)
          : [];
        // endpoints 保持原始 JSON 字符串，若为空设为空串
        if (!data.endpoints) {
          data.endpoints = '';
        }
        // 处理status/sync_official，将数字转为布尔值
        data.status = data.status === 1;
        data.sync_official = (data.sync_official ?? 1) === 1;
        if (formApiRef.current) {
          formApiRef.current.setValues({ ...getInitValues(), ...data });
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('加载模型信息失败'));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (formApiRef.current) {
      if (!isEdit) {
        formApiRef.current.setValues({
          ...getInitValues(),
          model_name: props.editingModel?.model_name || '',
        });
      }
    }
  }, [props.editingModel?.id, props.editingModel?.model_name]);

  useEffect(() => {
    if (props.visiable) {
      if (isEdit) {
        loadModel();
      } else {
        formApiRef.current?.setValues({
          ...getInitValues(),
          model_name: props.editingModel?.model_name || '',
        });
      }
    } else {
      formApiRef.current?.reset();
    }
  }, [props.visiable, props.editingModel?.id, props.editingModel?.model_name]);

  const submit = async (values) => {
    setLoading(true);
    try {
      const submitData = {
        ...values,
        tags: Array.isArray(values.tags) ? values.tags.join(',') : values.tags,
        capabilities: Array.isArray(values.capabilities_list)
          ? values.capabilities_list.join(',')
          : '',
        endpoints: values.endpoints || '',
        status: values.status ? 1 : 0,
        sync_official: values.sync_official ? 1 : 0,
      };
      delete submitData.capabilities_list;

      if (isEdit) {
        submitData.id = props.editingModel.id;
        const res = await API.put('/api/models/', submitData);
        const { success, message } = res.data;
        if (success) {
          showSuccess(t('模型更新成功！'));
          props.refresh();
          props.handleClose();
        } else {
          showError(t(message));
        }
      } else {
        const res = await API.post('/api/models/', submitData);
        const { success, message } = res.data;
        if (success) {
          showSuccess(t('模型创建成功！'));
          props.refresh();
          props.handleClose();
        } else {
          showError(t(message));
        }
      }
    } catch (error) {
      showError(error.response?.data?.message || t('操作失败'));
    }
    setLoading(false);
    formApiRef.current?.setValues(getInitValues());
  };

  return (
    <SideSheet
      placement={placement}
      title={
        <Space>
          {isEdit ? (
            <Tag color='blue' shape='circle'>
              {t('更新')}
            </Tag>
          ) : (
            <Tag color='green' shape='circle'>
              {t('新建')}
            </Tag>
          )}
          <Title heading={4} className='m-0'>
            {isEdit ? t('更新模型信息') : t('创建新的模型')}
          </Title>
        </Space>
      }
      bodyStyle={{ padding: '0' }}
      visible={props.visiable}
      width={isMobile ? '100%' : 600}
      footer={
        <div className='flex justify-end bg-white'>
          <Space>
            <Button
              theme='solid'
              className='!rounded-lg'
              onClick={() => formApiRef.current?.submitForm()}
              icon={<Save size={16} />}
              loading={loading}
            >
              {t('提交')}
            </Button>
            <Button
              theme='light'
              className='!rounded-lg'
              type='primary'
              onClick={handleCancel}
              icon={<X size={16} />}
            >
              {t('取消')}
            </Button>
          </Space>
        </div>
      }
      closeIcon={null}
      onCancel={() => handleCancel()}
    >
      <Spin spinning={loading}>
        <Form
          key={isEdit ? 'edit' : 'new'}
          initValues={getInitValues()}
          getFormApi={(api) => (formApiRef.current = api)}
          onSubmit={submit}
        >
          {({ values }) => (
            <div className='p-2'>
              {/* 基本信息 */}
              <Card className='!rounded-2xl shadow-sm border-0'>
                <div className='flex items-center mb-2'>
                  <Avatar size='small' color='green' className='mr-2 shadow-md'>
                    <FileText size={16} />
                  </Avatar>
                  <div>
                    <Text className='text-lg font-medium'>{t('基本信息')}</Text>
                    <div className='text-xs text-gray-600'>
                      {t('设置模型的基本信息')}
                    </div>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.AutoComplete
                      field='model_name'
                      label={t('模型名称')}
                      placeholder={t('请输入模型名称，如：gpt-4')}
                      data={filteredChannelModels}
                      filter={false}
                      onSearch={(val) => {
                        setModelNameSearch(val || '');
                        formApiRef.current?.setValue('model_name', val || '');
                      }}
                      onChange={(val) => {
                        setModelNameSearch(val || '');
                      }}
                      onSelect={(option) => {
                        const val =
                          typeof option === 'object'
                            ? option?.value ?? option?.label ?? ''
                            : option;
                        setModelNameSearch(val || '');
                        formApiRef.current?.setValue('model_name', val || '');
                      }}
                      showClear
                      maxHeight={260}
                      emptyContent={t('无匹配的渠道模型')}
                      style={{ width: '100%' }}
                      rules={[{ required: true, message: t('请输入模型名称') }]}
                      extraText={t(
                        '输入关键字可模糊搜索「渠道管理」中已配置的模型；也可直接输入自定义名称',
                      )}
                    />
                  </Col>

                  <Col span={24}>
                    <Form.Select
                      field='name_rule'
                      label={t('名称匹配类型')}
                      placeholder={t('请选择名称匹配类型')}
                      optionList={nameRuleOptions.map((o) => ({
                        label: t(o.label),
                        value: o.value,
                      }))}
                      rules={[
                        { required: true, message: t('请选择名称匹配类型') },
                      ]}
                      extraText={t(
                        '根据模型名称和匹配规则查找模型元数据，优先级：精确 > 前缀 > 后缀 > 包含',
                      )}
                      style={{ width: '100%' }}
                    />
                  </Col>

                  <Col span={24}>
                    <Form.Input
                      field='icon'
                      label={t('模型图标')}
                      placeholder={t('请输入图标名称')}
                      extraText={
                        <span>
                          {t(
                            "图标使用@lobehub/icons库，如：OpenAI、Claude.Color，支持链式参数：OpenAI.Avatar.type={'platform'}、OpenRouter.Avatar.shape={'square'}，查询所有可用图标请 ",
                          )}
                          <Typography.Text
                            link={{
                              href: 'https://icons.lobehub.com/components/lobe-hub',
                              target: '_blank',
                            }}
                            icon={<IconLink />}
                            underline
                          >
                            {t('请点击我')}
                          </Typography.Text>
                        </span>
                      }
                      showClear
                    />
                  </Col>

                  <Col span={24}>
                    <Form.TextArea
                      field='description'
                      label={t('描述')}
                      placeholder={t('请输入模型描述')}
                      rows={3}
                      showClear
                    />
                  </Col>
                  <Col span={24}>
                    <Form.TagInput
                      field='tags'
                      label={t('标签')}
                      placeholder={t('输入标签或使用","分隔多个标签')}
                      addOnBlur
                      showClear
                      onChange={(newTags) => {
                        if (!formApiRef.current) return;
                        const normalize = (tags) => {
                          if (!Array.isArray(tags)) return [];
                          return [
                            ...new Set(
                              tags.flatMap((tag) =>
                                tag
                                  .split(',')
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                              ),
                            ),
                          ];
                        };
                        const normalized = normalize(newTags);
                        formApiRef.current.setValue('tags', normalized);
                      }}
                      style={{ width: '100%' }}
                      {...(tagGroups.length > 0 && {
                        extraText: (
                          <Space wrap>
                            {tagGroups.map((group) => (
                              <Button
                                key={group.id}
                                size='small'
                                type='primary'
                                onClick={() => {
                                  if (formApiRef.current) {
                                    const currentTags =
                                      formApiRef.current.getValue('tags') || [];
                                    const newTags = [
                                      ...currentTags,
                                      ...(group.items || []),
                                    ];
                                    const uniqueTags = [...new Set(newTags)];
                                    formApiRef.current.setValue(
                                      'tags',
                                      uniqueTags,
                                    );
                                  }
                                }}
                              >
                                {group.name}
                              </Button>
                            ))}
                          </Space>
                        ),
                      })}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Select
                      field='vendor_id'
                      label={t('供应商')}
                      placeholder={t('选择模型供应商')}
                      optionList={vendors.map((v) => ({
                        label: v.name,
                        value: v.id,
                      }))}
                      filter
                      showClear
                      onChange={(value) => {
                        const vendorInfo = vendors.find((v) => v.id === value);
                        if (vendorInfo && formApiRef.current) {
                          formApiRef.current.setValue(
                            'vendor',
                            vendorInfo.name,
                          );
                        }
                      }}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Input
                      field='context_length'
                      label={t('上下文长度')}
                      placeholder={t('如：128K、1M、200K')}
                      style={{ width: '100%' }}
                      extraText={t(
                        '模型支持的最大上下文长度，仅作展示用，不参与实际调用限制',
                      )}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Input
                      field='max_output_tokens'
                      label={t('最大输出')}
                      placeholder={t('如：4096、32768、100K')}
                      style={{ width: '100%' }}
                      extraText={t(
                        '模型单次最大输出 token 数，仅在「模型」展示',
                      )}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.CheckboxGroup
                      field='capabilities_list'
                      label={t('能力')}
                      direction='horizontal'
                      extraText={t(
                        '模型支持的能力，仅在「模型」展示',
                      )}
                      options={[
                        { value: 'vision', label: t('视觉') },
                        { value: 'tool_calling', label: t('工具调用') },
                        { value: 'reasoning', label: t('推理') },
                        { value: 'caching', label: t('缓存') },
                        { value: 'image_generation', label: t('图像生成') },
                        { value: 'computer_use', label: t('电脑操作') },
                      ]}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Select
                      field='creation_target'
                      label={t('创作中心可见性')}
                      placeholder={t('自动判断（按 capabilities/endpoints/名称）')}
                      style={{ width: '100%' }}
                      extraText={t(
                        '显式控制本模型是否在「创作中心」出现以及出现在哪些 tab；留空表示按规则自动判断',
                      )}
                      optionList={[
                        { value: '', label: t('自动判断（默认）') },
                        { value: 'none', label: t('不在创作中心显示') },
                        { value: 'image', label: t('仅显示在「图像」') },
                        { value: 'video', label: t('仅显示在「视频」') },
                        { value: 'image,video', label: t('图像 + 视频') },
                      ]}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.InputNumber
                      field='home_priority'
                      label={t('首页推荐优先级')}
                      placeholder='0'
                      min={0}
                      step={1}
                      style={{ width: '100%' }}
                      extraText={t(
                        '0 = 不推荐(自然顺序);数字越大,在首页「能力 Tabs」越靠前。每个能力(对话/图像/视频/代码/音频/向量) 各取前 6 个。',
                      )}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.InputNumber
                      field='video_input_ratio'
                      label={t('视频输入加价乘子')}
                      placeholder='0'
                      min={0}
                      max={20}
                      step={0.1}
                      precision={4}
                      style={{ width: '100%' }}
                      extraText={t(
                        '0 = 禁用(走基准价);>0 = 当用户请求体含 video_url 时,实际扣费 = 基准价 × 此乘子。例如豆包 doubao-seed-2-0-pro 视频输入约比纯文本贵 1.5 倍,这里填 1.5。',
                      )}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Input
                      field='knowledge_cutoff'
                      label={t('知识截止')}
                      placeholder={t('如：2024-04')}
                      style={{ width: '100%' }}
                      extraText={t(
                        '模型训练数据知识截止日期，仅作展示',
                      )}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.TextArea
                      field='long_description'
                      label={t('详细介绍')}
                      placeholder={t('支持 markdown，将在「模型」详情页渲染')}
                      rows={8}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={24}>
                    <Banner
                      type='warning'
                      closeIcon={null}
                      icon={
                        <IconAlertTriangle
                          size='large'
                          style={{ color: 'var(--semi-color-warning)' }}
                        />
                      }
                      description={t(
                        '提示：此处配置仅用于控制「模型广场」对用户的展示效果，不会影响模型的实际调用与路由。若需配置真实调用行为，请前往「渠道管理」进行设置。',
                      )}
                      style={{ marginBottom: 12 }}
                    />
                    <JSONEditor
                      field='endpoints'
                      label={t('在模型广场向用户展示的端点')}
                      placeholder={
                        '{\n  "openai": {"path": "/v1/chat/completions", "method": "POST"}\n}'
                      }
                      value={values.endpoints}
                      onChange={(val) =>
                        formApiRef.current?.setValue('endpoints', val)
                      }
                      formApi={formApiRef.current}
                      editorType='object'
                      template={ENDPOINT_TEMPLATE}
                      templateLabel={t('填入模板')}
                      extraText={t('留空则使用默认端点；支持 {path, method}')}
                      extraFooter={
                        endpointGroups.length > 0 && (
                          <Space wrap>
                            {endpointGroups.map((group) => (
                              <Button
                                key={group.id}
                                size='small'
                                type='primary'
                                onClick={() => {
                                  try {
                                    const current =
                                      formApiRef.current?.getValue(
                                        'endpoints',
                                      ) || '';
                                    let base = {};
                                    if (current && current.trim())
                                      base = JSON.parse(current);
                                    const groupObj =
                                      typeof group.items === 'string'
                                        ? JSON.parse(group.items || '{}')
                                        : group.items || {};
                                    const merged = { ...base, ...groupObj };
                                    formApiRef.current?.setValue(
                                      'endpoints',
                                      JSON.stringify(merged, null, 2),
                                    );
                                  } catch (e) {
                                    try {
                                      const groupObj =
                                        typeof group.items === 'string'
                                          ? JSON.parse(group.items || '{}')
                                          : group.items || {};
                                      formApiRef.current?.setValue(
                                        'endpoints',
                                        JSON.stringify(groupObj, null, 2),
                                      );
                                    } catch {}
                                  }
                                }}
                              >
                                {group.name}
                              </Button>
                            ))}
                          </Space>
                        )
                      }
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Switch
                      field='sync_official'
                      label={t('参与官方同步')}
                      extraText={t(
                        '关闭后，此模型将不会被“同步官方”自动覆盖或创建',
                      )}
                      size='large'
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Switch
                      field='status'
                      label={t('状态')}
                      size='large'
                    />
                  </Col>
                </Row>
              </Card>
            </div>
          )}
        </Form>
      </Spin>
    </SideSheet>
  );
};

export default EditModelModal;
