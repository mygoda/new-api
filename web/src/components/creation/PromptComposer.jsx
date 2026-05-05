/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState, useEffect } from 'react';
import { TextArea, Button, Tooltip, Typography, Modal, Tabs, TabPane, Spin, Toast, Popover, Select } from '@douyinfe/semi-ui';
import { Sparkles, Wand2, Tag as TagIcon, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PROMPT_EXAMPLES } from '../../constants/creation/prompt-examples';
import { enhancePrompt, getEnhancerModel, setEnhancerModel } from '../../services/creation/promptEnhance';
import { loadChatModels } from '../../services/creation/modelLoader';
import QuickTags from './QuickTags';

const { Text } = Typography;

const PromptComposer = ({
  modality,
  modelName,
  value,
  onChange,
  maxLength = 1000,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [showExamples, setShowExamples] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(false);
  const [enhancedText, setEnhancedText] = useState('');
  const [usedModel, setUsedModel] = useState('');
  const [enhancerModel, setEnhancerModelState] = useState(getEnhancerModel());
  const [chatModels, setChatModels] = useState([]);
  const [showEnhancerCfg, setShowEnhancerCfg] = useState(false);
  const examples = PROMPT_EXAMPLES[modality] || [];
  const len = (value || '').length;

  useEffect(() => {
    loadChatModels()
      .then((list) => {
        setChatModels(list || []);
        // 首次无配置：默认选第一个 chat 模型作为兜底默认
        if (!getEnhancerModel() && list && list.length > 0) {
          setEnhancerModel(list[0].modelName);
          setEnhancerModelState(list[0].modelName);
        }
      })
      .catch(() => setChatModels([]));
  }, []);

  // ⌘+Enter / Ctrl+Enter 提交
  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (value && value.trim()) onSubmit?.();
    }
  };

  const handleEnhance = async () => {
    if (!value || !value.trim()) {
      Toast.warning(t('请先输入提示词再优化'));
      return;
    }
    setEnhancing(true);
    try {
      const r = await enhancePrompt(modality || 'image', modelName || '', value.trim());
      if (r.success) {
        setEnhancedText(r.prompt);
        setUsedModel(r.modelUsed);
        setShowEnhanced(true);
      } else {
        Toast.error(t('提示词优化失败：') + (r.error || ''));
      }
    } finally {
      setEnhancing(false);
    }
  };

  const acceptEnhanced = () => {
    onChange(enhancedText);
    setShowEnhanced(false);
  };

  return (
    <div className='space-y-2'>
      {/* Prompt 输入区 - 视觉中心 */}
      <div className='relative rounded-xl border-2 border-blue-200 bg-white shadow-[0_2px_12px_rgba(37,99,235,0.08)] focus-within:border-blue-500 focus-within:shadow-[0_4px_16px_rgba(37,99,235,0.18)] transition-all'>
        <div className='flex items-center gap-1.5 px-3 pt-2.5 pb-1'>
          <Sparkles size={13} className='text-blue-500' />
          <Text className='!text-[12px] !font-semibold !text-blue-600'>
            {t('提示词')}
          </Text>
          <Text type='tertiary' className='!text-[10px] !text-gray-500'>
            {t('描述你想生成的内容')}
          </Text>
        </div>
        <TextArea
          value={value}
          onChange={onChange}
          placeholder={t('例如：一只穿着宇航服的猫漂浮在星空中…   ⌘/Ctrl + Enter 提交')}
          autosize={{ minRows: 3, maxRows: 8 }}
          className='!text-[14px] !border-0 !shadow-none !bg-transparent prompt-composer-input'
          style={{ background: 'transparent' }}
          onKeyDown={handleKeyDown}
        />
        {value && value.length > 0 && (
          <Text
            type={len > maxLength ? 'danger' : 'tertiary'}
            size='small'
            className='!text-[10px] tabular-nums absolute right-3 bottom-2 bg-white/90 px-1.5 py-0.5 rounded pointer-events-none'
          >
            {len}/{maxLength}
          </Text>
        )}
      </div>

      {/* 工具栏：示例 / 标签 / AI 优化 */}
      <div className='flex items-center gap-1'>
        {examples.length > 0 && (
          <Button
            size='small'
            theme='borderless'
            type='tertiary'
            icon={<Sparkles size={12} />}
            onClick={() => setShowExamples((v) => !v)}
            className='!text-[11px] !text-gray-700 !h-6'
          >
            {t('示例')}
          </Button>
        )}
        <Button
          size='small'
          theme={showTags ? 'light' : 'borderless'}
          type={showTags ? 'primary' : 'tertiary'}
          icon={<TagIcon size={12} />}
          onClick={() => setShowTags((v) => !v)}
          className='!text-[11px] !text-gray-700 !h-6'
        >
          {t('快速标签')}
        </Button>
        <Tooltip content={enhancerModel ? t('用 Chat 模型重写提示词') : t('请先在右侧齿轮中选择优化用的 Chat 模型')}>
          <Button
            size='small'
            theme='borderless'
            type='tertiary'
            icon={<Wand2 size={12} />}
            loading={enhancing}
            onClick={handleEnhance}
            className='!text-[11px] !text-gray-700 !h-6'
          >
            {t('AI 优化')}
            {enhancerModel && (
              <Text type='tertiary' className='!text-[10px] ml-1 !text-gray-500'>
                · {enhancerModel}
              </Text>
            )}
          </Button>
        </Tooltip>
        <Popover
          trigger='click'
          visible={showEnhancerCfg}
          onVisibleChange={setShowEnhancerCfg}
          position='bottomRight'
          content={
            <div className='p-3 w-72 space-y-2'>
              <Text strong className='!text-[12px]'>
                {t('选择「AI 优化」用的 Chat 模型')}
              </Text>
              <Text type='tertiary' className='!text-[11px] !block'>
                {t('该模型用于把你的提示词重写得更具镜头语言。需为账户内可用的 Chat 模型。')}
              </Text>
              <Select
                value={enhancerModel || undefined}
                onChange={(v) => {
                  setEnhancerModel(v);
                  setEnhancerModelState(v);
                  Toast.success(t('已切换为 ') + v);
                }}
                placeholder={t('请选择模型')}
                style={{ width: '100%' }}
                filter
                showClear
                onClear={() => {
                  setEnhancerModel('');
                  setEnhancerModelState('');
                }}
                emptyContent={
                  <div className='p-2 text-xs text-gray-400'>
                    {t('暂无可用 Chat 模型，请到「模型管理」启用')}
                  </div>
                }
                optionList={chatModels.map((m) => ({
                  label: m.modelName,
                  value: m.modelName,
                }))}
              />
            </div>
          }
        >
          <Tooltip content={t('AI 优化设置')}>
            <Button
              size='small'
              theme='borderless'
              type='tertiary'
              icon={<Settings2 size={12} />}
              onClick={() => setShowEnhancerCfg((v) => !v)}
              className='!text-gray-600 !h-6'
            />
          </Tooltip>
        </Popover>
      </div>

      {/* 快速标签 */}
      {showTags && (
        <div className='p-3 bg-gray-50 border border-gray-100 rounded-lg'>
          <QuickTags modality={modality} value={value} onChange={onChange} />
        </div>
      )}

      {showExamples && examples.length > 0 && (
        <div className='grid grid-cols-2 gap-2 mt-2'>
          {examples.map((ex) => (
            <button
              key={ex.title}
              type='button'
              onClick={() => {
                onChange(ex.text);
                setShowExamples(false);
              }}
              className='text-left px-3 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-xs transition-colors'
            >
              <div className='font-medium mb-1 text-gray-800'>{ex.title}</div>
              <div className='text-gray-500 line-clamp-2'>{ex.text}</div>
            </button>
          ))}
        </div>
      )}

      <Modal
        title={t('提示词优化建议')}
        visible={showEnhanced}
        onCancel={() => setShowEnhanced(false)}
        onOk={acceptEnhanced}
        okText={t('采用优化后的')}
        cancelText={t('保留原文')}
        width={620}
      >
        <Spin spinning={enhancing}>
          <Tabs type='line' size='small'>
            <TabPane tab={t('优化后')} itemKey='new'>
              <div className='whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded border border-gray-200'>
                {enhancedText}
              </div>
              <Text type='tertiary' className='!text-xs block mt-2'>
                {t('使用模型：')}
                <span className='font-medium text-gray-700'>{usedModel}</span>
              </Text>
            </TabPane>
            <TabPane tab={t('原文')} itemKey='old'>
              <div className='whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded border border-gray-200 text-gray-500'>
                {value}
              </div>
            </TabPane>
          </Tabs>
        </Spin>
      </Modal>
    </div>
  );
};

export default PromptComposer;
