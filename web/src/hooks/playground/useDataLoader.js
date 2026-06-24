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

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  processModelsData,
  processGroupsData,
  showError,
} from '../../helpers';
import { API_ENDPOINTS } from '../../constants/playground.constants';

export const useDataLoader = (
  userState,
  inputs,
  handleInputChange,
  setModels,
  setGroups,
) => {
  const { t } = useTranslation();
  const prevGroupRef = useRef(inputs.group);

  const loadModels = useCallback(
    async (group) => {
      try {
        const url = group
          ? `${API_ENDPOINTS.USER_MODELS}?group=${encodeURIComponent(group)}`
          : API_ENDPOINTS.USER_MODELS;
        const res = await API.get(url);
        const { success, message, data } = res.data;

        if (success) {
          const { modelOptions, selectedModel } = processModelsData(
            data,
            inputs.model,
          );
          setModels(modelOptions);

          if (selectedModel !== inputs.model) {
            handleInputChange('model', selectedModel);
          }
        } else {
          showError(t(message));
        }
      } catch (error) {
        showError(t('加载模型失败'));
      }
    },
    [inputs.model, handleInputChange, setModels, t],
  );

  const loadGroups = useCallback(async () => {
    try {
      const res = await API.get(API_ENDPOINTS.USER_GROUPS);
      const { success, message, data } = res.data;

      if (success) {
        const userGroup =
          userState?.user?.group ||
          JSON.parse(localStorage.getItem('user'))?.group;

        // /api/user/groups 后端已按 用户分组 + extra_groups + 全局可见 完成鉴权过滤
        // (管理员返回全部)，前端直接全用，不能再砍成只剩 userGroup，
        // 否则靠 extra_groups 单独授权的分组在 playground 里看不到。
        const groupOptions = processGroupsData(data, userGroup);
        setGroups(groupOptions);

        const hasCurrentGroup = groupOptions.some(
          (option) => option.value === inputs.group,
        );
        const selectedGroup = hasCurrentGroup
          ? inputs.group
          : groupOptions[0]?.value || '';

        if (!hasCurrentGroup) {
          handleInputChange('group', selectedGroup);
        }

        // Load models for the resolved group
        return selectedGroup;
      } else {
        showError(t(message));
      }
    } catch (error) {
      showError(t('加载分组失败'));
    }
    return null;
  }, [userState, inputs.group, handleInputChange, setGroups, t]);

  // Initial load: groups first, then models with the selected group
  useEffect(() => {
    if (userState?.user) {
      loadGroups().then((group) => {
        if (group) {
          loadModels(group);
        }
      });
    }
  }, [userState?.user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload models when group changes (after initial load)
  useEffect(() => {
    if (inputs.group && inputs.group !== prevGroupRef.current) {
      prevGroupRef.current = inputs.group;
      loadModels(inputs.group);
    }
  }, [inputs.group, loadModels]);

  return {
    loadModels,
    loadGroups,
  };
};
