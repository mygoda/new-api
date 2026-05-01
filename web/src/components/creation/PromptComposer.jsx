/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useState } from 'react';
import { Input, Button, Tooltip, Typography, Modal, Tabs, TabPane, Spin, Toast } from '@douyinfe/semi-ui';
import { Sparkles, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PROMPT_EXAMPLES } from '../../constants/creation/prompt-examples';
import { enhancePrompt } from '../../services/creation/promptEnhance';

const { Text } = Typography;

const PromptComposer = ({
  modality,
  modelName,
  value,
  onChange,
  maxLength = 1000,
}) => {
  const { t } = useTranslation();
  const [showExamples, setShowExamples] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(false);
  const [enhancedText, setEnhancedText] = useState('');
  const [usedModel, setUsedModel] = useState('');
  const examples = PROMPT_EXAMPLES[modality] || [];
  const len = (value || '').length;

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
      <div className='flex items-center justify-between'>
        <Text strong className='!text-sm'>
          {t('提示词')}
        </Text>
        <div className='flex items-center gap-1'>
          {examples.length > 0 && (
            <Button
              size='small'
              theme='borderless'
              type='tertiary'
              icon={<Sparkles size={13} />}
              onClick={() => setShowExamples((v) => !v)}
            >
              {t('示例')}
            </Button>
          )}
          <Tooltip content={t('用 Chat 模型重写提示词')}>
            <Button
              size='small'
              theme='borderless'
              type='tertiary'
              icon={<Wand2 size={13} />}
              loading={enhancing}
              onClick={handleEnhance}
            >
              {t('AI 优化')}
            </Button>
          </Tooltip>
          <Text
            type={len > maxLength ? 'danger' : 'tertiary'}
            size='small'
            className='!text-xs ml-1 tabular-nums'
          >
            {len} / {maxLength}
          </Text>
        </div>
      </div>

      <Input
        value={value}
        onChange={onChange}
        rows={5}
        placeholder={t('描述你想要生成的内容…')}
        autosize={{ minRows: 4, maxRows: 12 }}
        showClear
        className='!rounded-lg'
      />

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
