/*
Copyright (C) 2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later

仅管理员可见的模型筛选规则提示。
点击 ⓘ 图标弹出 Popover，展示当前模态下创作中心的模型筛选逻辑：
  - 数据源：/api/creation/models
  - endpoints/tags/模型名兜底正则
  - 总模型数 vs 当前模态命中数
*/

import React, { useEffect, useState } from 'react';
import { Popover, Typography, Tag, Button, Tooltip } from '@douyinfe/semi-ui';
import { Info } from 'lucide-react';
import { isAdmin } from '../../helpers/utils';
import { getFilterRules, getAllRawModels } from '../../services/creation/modelLoader';

const { Text, Paragraph } = Typography;

const Bubble = ({ rules, total, hit }) => (
  <div className='w-[360px] p-3 space-y-2.5 text-[12px]'>
    <div className='flex items-center gap-2'>
      <Text strong className='!text-[13px]'>当前筛选规则</Text>
      <Tag size='small' color='blue'>{rules.modality}</Tag>
    </div>

    <div>
      <Text type='tertiary' className='!text-[10px] !block mb-0.5'>数据源</Text>
      <code className='block px-2 py-1 bg-gray-50 rounded text-[11px] border border-gray-200/70 break-all'>
        {rules.source}
      </code>
    </div>

    <div>
      <Text type='tertiary' className='!text-[10px] !block mb-0.5'>匹配顺序</Text>
      <ol className='list-decimal pl-4 space-y-0.5 text-[11px] text-gray-700'>
        {rules.matchOrder.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>

    <div>
      <Text type='tertiary' className='!text-[10px] !block mb-0.5'>endpoints / tags 关键字</Text>
      <div className='flex flex-wrap gap-1'>
        {rules.endpointKeywords.map((k) => (
          <code
            key={k}
            className='px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] border border-blue-100'
          >
            {k}
          </code>
        ))}
      </div>
    </div>

    {rules.capabilityKeywords && rules.capabilityKeywords.length > 0 && (
      <div>
        <Text type='tertiary' className='!text-[10px] !block mb-0.5'>capabilities 字段关键字</Text>
        <div className='flex flex-wrap gap-1'>
          {rules.capabilityKeywords.map((k) => (
            <code
              key={k}
              className='px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[11px] border border-purple-100'
            >
              {k}
            </code>
          ))}
        </div>
      </div>
    )}

    {rules.nameFallbackRegex && (
      <div>
        <Text type='tertiary' className='!text-[10px] !block mb-0.5'>模型名兜底正则</Text>
        <code className='block px-2 py-1 bg-gray-50 rounded text-[11px] border border-gray-200/70 break-all font-mono'>
          /{rules.nameFallbackRegex}/i
        </code>
      </div>
    )}

    <div className='pt-1 border-t border-gray-100 text-[11px] text-gray-600'>
      {`已启用模型 ${total} 个，当前模态命中 `}
      <Text strong>{hit}</Text>
      {' 个'}
    </div>

    <Text type='tertiary' className='!text-[10px] !block !leading-relaxed'>
      在「模型管理」给模型配置 endpoints / tags 字段后会立刻生效；缓存 60s。
    </Text>
  </div>
);

const ModelFilterInfo = ({ modality, hit }) => {
  const [total, setTotal] = useState(null);

  useEffect(() => {
    if (!isAdmin()) return;
    getAllRawModels().then((list) => setTotal((list || []).length));
  }, [modality]);

  if (!isAdmin()) return null;
  const rules = getFilterRules(modality);

  return (
    <Popover
      trigger='click'
      position='bottomLeft'
      showArrow
      content={<Bubble rules={rules} total={total ?? '—'} hit={hit ?? '—'} />}
    >
      <Tooltip content='筛选规则（管理员可见）'>
        <Button
          size='small'
          theme='borderless'
          type='tertiary'
          icon={<Info size={12} />}
          className='!h-5 !w-5 !min-w-0 !p-0 !text-gray-400 hover:!text-blue-500'
        />
      </Tooltip>
    </Popover>
  );
};

export default ModelFilterInfo;
