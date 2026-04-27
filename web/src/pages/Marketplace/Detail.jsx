/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Empty, Avatar, Tag, Card, Button, Typography } from '@douyinfe/semi-ui';
import { ArrowLeft } from 'lucide-react';
import { API, showError } from '../../helpers';
import CapabilityIcons from './components/CapabilityIcons';
import PriceBlock from './components/PriceBlock';
import MarkdownRenderer from '../../components/common/markdown/MarkdownRenderer';

const { Title, Text } = Typography;

const MarketplaceDetail = () => {
  const { t } = useTranslation();
  const { name } = useParams();
  const navigate = useNavigate();
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!name) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await API.get(
          `/api/marketplace/models/${encodeURIComponent(name)}`,
        );
        const { success, message, data } = res.data;
        if (success) {
          setModel(data);
        } else {
          showError(message);
        }
      } catch (err) {
        showError(err.message || t('加载失败'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [name, t]);

  if (loading) {
    return (
      <div className='flex justify-center py-20'>
        <Spin size='large' />
      </div>
    );
  }
  if (!model) {
    return (
      <div className='py-20'>
        <Empty title={t('未找到该模型')} />
      </div>
    );
  }

  const tags = (model.tags || '').split(',').filter(Boolean);

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-zinc-900'>
      <div className='max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6'>
        <Button
          icon={<ArrowLeft size={16} />}
          theme='borderless'
          onClick={() => navigate('/marketplace')}
          className='mb-4'
        >
          {t('返回列表')}
        </Button>

        {/* Hero */}
        <Card className='!rounded-2xl mb-4' bodyStyle={{ padding: 24 }}>
          <div className='flex items-start gap-4'>
            {model.icon ? (
              <Avatar size='large' src={model.icon} shape='square' />
            ) : (
              <Avatar size='large' shape='square'>
                {(model.model_name || '?').slice(0, 2).toUpperCase()}
              </Avatar>
            )}
            <div className='flex-1 min-w-0'>
              <Title heading={4} className='!mb-2 break-all'>
                {model.model_name}
              </Title>
              {tags.length > 0 && (
                <div className='flex flex-wrap gap-1 mb-3'>
                  {tags.map((tag) => (
                    <Tag key={tag} color='blue' shape='circle' size='small'>
                      {tag}
                    </Tag>
                  ))}
                </div>
              )}
              <CapabilityIcons
                capabilities={model.capabilities || []}
                size={16}
                t={t}
              />
            </div>
          </div>
          {model.description && (
            <Text type='tertiary' className='!mt-4 block'>
              {model.description}
            </Text>
          )}
        </Card>

        {/* 模型简介（markdown long_description） */}
        {model.long_description && (
          <Card
            className='!rounded-2xl mb-4'
            title={t('模型简介')}
            bodyStyle={{ padding: 20 }}
          >
            <MarkdownRenderer content={model.long_description} />
          </Card>
        )}

        {/* 定价 */}
        <div className='mb-4'>
          <Title heading={6} className='!mb-2'>
            {t('定价')}
          </Title>
          <PriceBlock model={model} t={t} />
        </div>

        {/* 技术参数 */}
        <Card
          className='!rounded-2xl mb-4'
          title={t('技术参数')}
          bodyStyle={{ padding: 20 }}
        >
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            <div>
              <div className='text-xs text-gray-500 mb-1'>{t('上下文窗口')}</div>
              <div className='text-lg font-medium'>
                {model.context_length || '-'}
              </div>
            </div>
            <div>
              <div className='text-xs text-gray-500 mb-1'>{t('最大输出')}</div>
              <div className='text-lg font-medium'>
                {model.max_output_tokens || '-'}
              </div>
            </div>
            <div>
              <div className='text-xs text-gray-500 mb-1'>{t('知识截止')}</div>
              <div className='text-lg font-medium'>
                {model.knowledge_cutoff || '-'}
              </div>
            </div>
            <div>
              <div className='text-xs text-gray-500 mb-1'>{t('计费类型')}</div>
              <div className='text-lg font-medium'>
                {model.quota_type === 1 ? t('按次计费') : t('按量计费')}
              </div>
            </div>
            {model.endpoints && model.endpoints.length > 0 && (
              <div className='sm:col-span-2'>
                <div className='text-xs text-gray-500 mb-1'>{t('支持端点')}</div>
                <div className='flex flex-wrap gap-1'>
                  {model.endpoints.map((ep) => (
                    <Tag key={ep} color='cyan' shape='circle' size='small'>
                      {ep}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default MarketplaceDetail;
