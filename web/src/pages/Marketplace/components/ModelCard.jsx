/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { Card, Tag, Avatar, Typography } from '@douyinfe/semi-ui';
import { useNavigate } from 'react-router-dom';
import CapabilityIcons from './CapabilityIcons';

const { Text, Title } = Typography;

const formatPrice = (val) => {
  if (val == null) return '-';
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val >= 0.01) return `$${val.toFixed(3)}`;
  return `$${val.toFixed(4)}`;
};

const ModelCard = ({ model, t }) => {
  const navigate = useNavigate();
  const tags = (model.tags || '').split(',').filter(Boolean);
  return (
    <Card
      shadows='hover'
      className='!rounded-2xl cursor-pointer transition-shadow hover:shadow-lg'
      bodyStyle={{ padding: 16 }}
      onClick={() =>
        navigate(`/marketplace/${encodeURIComponent(model.model_name)}`)
      }
    >
      <div className='flex items-start gap-3'>
        {model.icon ? (
          <Avatar size='small' src={model.icon} shape='square' />
        ) : (
          <Avatar size='small' shape='square'>
            {(model.model_name || '?').slice(0, 2).toUpperCase()}
          </Avatar>
        )}
        <div className='flex-1 min-w-0'>
          <Title heading={6} className='!mb-1 truncate'>
            {model.model_name}
          </Title>
          {tags.length > 0 && (
            <div className='flex flex-wrap gap-1 mb-2'>
              {tags.slice(0, 3).map((tag) => (
                <Tag key={tag} size='small' color='blue' shape='circle'>
                  {tag}
                </Tag>
              ))}
            </div>
          )}
        </div>
      </div>

      {model.description && (
        <Text
          size='small'
          type='tertiary'
          ellipsis={{ rows: 2, showTooltip: { type: 'tooltip' } }}
          className='!mt-2 block min-h-[36px]'
        >
          {model.description}
        </Text>
      )}

      <div className='mt-3'>
        <CapabilityIcons
          capabilities={model.capabilities || []}
          size={14}
          t={t}
        />
      </div>

      <div className='mt-3 grid grid-cols-2 gap-2 text-xs'>
        <div className='flex flex-col'>
          <span className='text-gray-400'>{t('上下文')}</span>
          <span className='font-medium'>{model.context_length || '-'}</span>
        </div>
        <div className='flex flex-col'>
          <span className='text-gray-400'>{t('最大输出')}</span>
          <span className='font-medium'>{model.max_output_tokens || '-'}</span>
        </div>
      </div>

      <div className='mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs'>
        {model.quota_type === 1 ? (
          <span className='font-semibold text-orange-600'>
            {formatPrice(model.price_per_request)}{' '}
            <span className='text-gray-400 font-normal'>/ {t('次')}</span>
          </span>
        ) : (
          <>
            <span className='flex flex-col'>
              <span className='text-gray-400'>{t('输入')}</span>
              <span className='font-semibold text-orange-600'>
                {formatPrice(model.input_price)}{' '}
                <span className='text-gray-400 font-normal'>/ 1M</span>
              </span>
            </span>
            <span className='flex flex-col text-right'>
              <span className='text-gray-400'>{t('输出')}</span>
              <span className='font-semibold text-orange-600'>
                {formatPrice(model.output_price)}{' '}
                <span className='text-gray-400 font-normal'>/ 1M</span>
              </span>
            </span>
          </>
        )}
      </div>

      {model.knowledge_cutoff && (
        <div className='mt-2 text-xs text-gray-400'>
          {t('知识截止')}：{model.knowledge_cutoff}
        </div>
      )}
    </Card>
  );
};

export default ModelCard;
