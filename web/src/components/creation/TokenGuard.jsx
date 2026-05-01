/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useState } from 'react';
import {
  Modal,
  Button,
  Toast,
  Spin,
  Typography,
  Tag,
  Empty,
} from '@douyinfe/semi-ui';
import { Sparkles, KeyRound, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  listTokens,
  fetchTokenKey,
  saveActiveToken,
  loadActiveToken,
  quickCreateAndActivate,
} from '../../services/creation/tokens';

const { Text, Title } = Typography;

// 进入创作中心时的 Token 选择守卫。
//
// 行为：
//   - 检测 localStorage 里是否有 active token
//   - 没有 → 拉列表展示选择 / 提供「快速创建」按钮
//   - 选择某个 token → 调 /api/token/{id}/key 拿完整 key，写入 localStorage
const TokenGuard = ({ visible, onResolved, onClose }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tokens, setTokens] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const items = await listTokens();
      setTokens(items.filter((tk) => tk.status === 1));
    } catch (e) {
      Toast.error(e?.message || t('加载 Token 失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pick = async (tk) => {
    setLoading(true);
    try {
      const key = await fetchTokenKey(tk.id);
      const active = { id: tk.id, name: tk.name, key };
      saveActiveToken(active);
      Toast.success(t('已选择 Token：') + tk.name);
      onResolved?.(active);
    } catch (e) {
      Toast.error(e?.message || t('获取 Token Key 失败'));
    } finally {
      setLoading(false);
    }
  };

  const quickCreate = async () => {
    setCreating(true);
    try {
      const active = await quickCreateAndActivate('creation-default');
      Toast.success(t('已为你创建并启用默认 Token'));
      onResolved?.(active);
    } catch (e) {
      Toast.error(e?.message || t('创建失败'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      title={
        <span className='flex items-center gap-2'>
          <KeyRound size={16} />
          {t('选择创作中心使用的 Token')}
        </span>
      }
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={520}
    >
      <div className='space-y-3'>
        <Text type='tertiary' className='!text-xs'>
          {t(
            '创作中心调用上游模型需要使用一个有效 Token 进行计费。下方列出账户里启用的 Token，选一个即可。',
          )}
        </Text>

        <Spin spinning={loading}>
          {tokens.length === 0 && !loading ? (
            <Empty
              title={t('暂无可用 Token')}
              description={t('点击下方「快速创建」生成一个默认 Token')}
            />
          ) : (
            <div className='space-y-1.5 max-h-[280px] overflow-y-auto'>
              {tokens.map((tk) => (
                <button
                  key={tk.id}
                  type='button'
                  onClick={() => pick(tk)}
                  className='w-full text-left px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 flex items-center justify-between'
                >
                  <div className='flex flex-col items-start'>
                    <Text strong className='!text-sm'>{tk.name || `Token #${tk.id}`}</Text>
                    <Text type='tertiary' className='!text-xs'>{tk.key}</Text>
                  </div>
                  <Tag size='small' color={tk.unlimited_quota ? 'green' : 'blue'}>
                    {tk.unlimited_quota ? t('不限额') : `${tk.remain_quota} ${t('点')}`}
                  </Tag>
                </button>
              ))}
            </div>
          )}
        </Spin>

        <div className='flex gap-2 justify-end pt-2 border-t border-gray-100'>
          <Button onClick={onClose}>{t('稍后再说')}</Button>
          <Button
            theme='solid'
            type='primary'
            icon={<Plus size={14} />}
            loading={creating}
            onClick={quickCreate}
          >
            {t('快速创建')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default TokenGuard;

// Hook：返回 [active, openGuard, GuardComponent]
export function useTokenGuard() {
  const [active, setActive] = useState(loadActiveToken);
  const [visible, setVisible] = useState(false);

  const openGuard = () => setVisible(true);
  const ensureToken = () => {
    if (!active?.key) {
      openGuard();
      return false;
    }
    return true;
  };

  const Guard = (
    <TokenGuard
      visible={visible}
      onClose={() => setVisible(false)}
      onResolved={(tok) => {
        setActive(tok);
        setVisible(false);
      }}
    />
  );

  return { active, openGuard, ensureToken, Guard };
}
