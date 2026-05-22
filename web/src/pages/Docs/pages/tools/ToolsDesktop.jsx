import React, { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import { useServerAddress } from '../../hooks';
import { StatusContext } from '../../../../context/Status';
import { getSystemName } from '../../../../helpers/utils';

const tabs = [
  { key: 'cherry', label: 'Cherry Studio' },
  { key: 'chatbox', label: 'ChatBox' },
  { key: 'nextchat', label: 'NextChat' },
];

const ToolsDesktop = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  const [statusState] = useContext(StatusContext);
  const systemName = statusState?.status?.system_name || getSystemName() || 'New API';
  const [active, setActive] = useState('cherry');
  useEffect(() => { document.title = `${t('桌面客户端')} | ${t('工具集成')}`; }, [t]);

  return (
    <article>
      <h1>{t('桌面客户端')} <span className='docs-tag'>{t('多个客户端')}</span></h1>
      <p>{t('以下客户端均支持 OpenAI API 兼容格式，配置流程类似。')}</p>

      <div className='docs-code-group' style={{ marginTop: 24 }}>
        <div className='docs-code-group-tabs'>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type='button'
              className={`docs-code-group-tab ${active === tab.key ? 'active' : ''}`}
              onClick={() => setActive(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ padding: 20 }}>
          {active === 'cherry' && (
            <div>
              <StepCard step={1} title={t('打开设置')}>
                <p>{t('点击左下角设置 → 模型服务')}</p>
              </StepCard>
              <StepCard step={2} title={t('添加服务商')}>
                <p>{t('点击 "添加服务商" → 选择 "OpenAI API 兼容"')}</p>
              </StepCard>
              <StepCard step={3} title={t('填写配置')}>
                <div className='docs-kv'>
                  <div><b>{t('名称')}：</b>{systemName}</div>
                  <div><b>API URL:</b> <code>{`${serverAddress}/v1`}</code></div>
                  <div><b>API Key:</b> <code>sk-xxxxxxxxxxxxxxxx</code></div>
                </div>
              </StepCard>
              <StepCard step={4} title={t('获取模型列表')}>
                <p>{t('点击 "获取模型列表" 按钮，自动拉取可用模型。选择模型后即可开始对话。')}</p>
              </StepCard>
            </div>
          )}

          {active === 'chatbox' && (
            <div>
              <StepCard step={1} title={t('打开设置')}>
                <p>{t('点击左下角设置 → AI 模型提供商')}</p>
              </StepCard>
              <StepCard step={2} title={t('选择 OpenAI API')}>
                <p>{t('选择 "OpenAI API"，填写以下配置：')}</p>
                <div className='docs-kv'>
                  <div><b>API Host:</b> <code>{`${serverAddress}/v1`}</code></div>
                  <div><b>API Key:</b> <code>sk-xxxxxxxxxxxxxxxx</code></div>
                  <div><b>Model:</b> <code>gpt-4o</code></div>
                </div>
              </StepCard>
              <StepCard step={3} title={t('保存并使用')}>
                <p>{t('点击保存，返回对话页面即可使用。')}</p>
              </StepCard>
            </div>
          )}

          {active === 'nextchat' && (
            <div>
              <StepCard step={1} title={t('打开设置')}>
                <p>{t('点击左下角设置图标')}</p>
              </StepCard>
              <StepCard step={2} title={t('填写配置')}>
                <div className='docs-kv'>
                  <div><b>{t('接口地址')}：</b> <code>{serverAddress}</code></div>
                  <div><b>API Key:</b> <code>sk-xxxxxxxxxxxxxxxx</code></div>
                  <div><b>{t('自定义模型名')}：</b> <code>gpt-4o,claude-sonnet-4-20250514</code></div>
                </div>
              </StepCard>
              <StepCard step={3} title={t('使用')}>
                <p>{t('返回对话页面，在模型选择器中切换模型。')}</p>
              </StepCard>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export default ToolsDesktop;
