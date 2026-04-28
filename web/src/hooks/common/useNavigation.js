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

import { useMemo } from 'react';

export const useNavigation = (t, docsLink, headerNavModules, isAdminUser = false) => {
  const mainNavLinks = useMemo(() => {
    // 默认配置，如果没有传入配置则显示所有模块
    const defaultModules = {
      home: true,
      console: true,
      pricing: true,
      marketplaceV2: { enabled: true, requireAdmin: false },
      docs: true,
      about: true,
    };

    // 使用传入的配置或默认配置
    const modules = headerNavModules || defaultModules;

    const allLinks = [
      {
        text: t('首页'),
        itemKey: 'home',
        to: '/',
      },
      {
        text: t('控制台'),
        itemKey: 'console',
        to: '/console',
      },
      {
        text: t('模型广场'),
        itemKey: 'pricing',
        to: '/pricing',
      },
      {
        text: t('模型'),
        itemKey: 'marketplaceV2',
        to: '/marketplace',
      },
      {
        text: t('文档'),
        itemKey: 'docs',
        to: '/docs',
      },
      {
        text: t('关于'),
        itemKey: 'about',
        to: '/about',
      },
    ];

    // 根据配置过滤导航链接
    return allLinks.filter((link) => {
      if (link.itemKey === 'pricing') {
        // 模型广场（旧）—— 仅管理员可见
        const enabled = typeof modules.pricing === 'object'
          ? modules.pricing.enabled
          : modules.pricing;
        if (!enabled) return false;
        return isAdminUser;
      }
      if (link.itemKey === 'marketplaceV2') {
        // marketplaceV2 默认开启 + 默认 requireAdmin=false（所有用户可见，含未登录）
        // 配置格式：{enabled: bool, requireAdmin: bool}
        const cfg = modules.marketplaceV2;
        let enabled = true;
        let requireAdmin = false;
        if (typeof cfg === 'object' && cfg !== null) {
          enabled = cfg.enabled !== false;
          requireAdmin = cfg.requireAdmin === true;
        } else if (typeof cfg === 'boolean') {
          enabled = cfg;
        }
        if (!enabled) return false;
        if (requireAdmin && !isAdminUser) return false;
        return true;
      }
      return modules[link.itemKey] === true;
    });
  }, [t, docsLink, headerNavModules, isAdminUser]);

  return {
    mainNavLinks,
  };
};
