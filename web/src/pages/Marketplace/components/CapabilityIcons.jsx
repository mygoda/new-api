/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { Tooltip } from '@douyinfe/semi-ui';
import {
  Eye,
  Wrench,
  Brain,
  Database,
  Image as ImageIcon,
  Mouse,
} from 'lucide-react';

const CAPABILITY_META = {
  vision: { label: '视觉', Icon: Eye, color: '#10b981' },
  tool_calling: { label: '工具调用', Icon: Wrench, color: '#6366f1' },
  reasoning: { label: '推理', Icon: Brain, color: '#a855f7' },
  caching: { label: '缓存', Icon: Database, color: '#0ea5e9' },
  image_generation: { label: '图像生成', Icon: ImageIcon, color: '#f59e0b' },
  computer_use: { label: '电脑操作', Icon: Mouse, color: '#ef4444' },
};

const CapabilityIcons = ({ capabilities = [], size = 14, t }) => {
  if (!capabilities || capabilities.length === 0) return null;
  return (
    <div className='flex items-center gap-1.5 flex-wrap'>
      {capabilities.map((c) => {
        const meta = CAPABILITY_META[c];
        if (!meta) return null;
        const Icon = meta.Icon;
        return (
          <Tooltip key={c} content={t(meta.label)}>
            <span
              className='inline-flex items-center justify-center rounded-md px-1.5 py-0.5'
              style={{
                background: `${meta.color}1a`,
                color: meta.color,
              }}
            >
              <Icon size={size} strokeWidth={2} />
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
};

export default CapabilityIcons;
export { CAPABILITY_META };
