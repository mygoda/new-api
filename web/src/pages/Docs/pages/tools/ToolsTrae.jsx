import React, { useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import StepCard from '../../components/StepCard';
import { useServerAddress } from '../../hooks';
import { StatusContext } from '../../../../context/Status';
import { getSystemName } from '../../../../helpers/utils';

const ToolsTrae = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  const [statusState] = useContext(StatusContext);
  const systemName = statusState?.status?.system_name || getSystemName() || 'New API';
  useEffect(() => { document.title = `TRAE | ${t('工具集成')}`; }, [t]);

  return (
    <article>
      <h1>TRAE <span className='docs-tag'>IDE</span></h1>
      <p>{t('字节跳动出品的 AI 原生 IDE。除内置模型外，TRAE 支持通过 API Key 接入自定义 OpenAI 兼容服务商。')}</p>

      <h2 id='setup'>{t('配置步骤')}</h2>

      <StepCard step={1} title={t('安装 TRAE')}>
        <p>
          {t('访问')}{' '}
          <a href='https://www.trae.cn/' target='_blank' rel='noreferrer'>TRAE 官网</a>{' '}
          {t('下载并完成初始设置与登录。')}
        </p>
      </StepCard>

      <StepCard step={2} title={t('打开模型设置')}>
        <p>{t('在 AI 对话框右上角点击 "设置" 图标，进入 "模型" 页签。')}</p>
      </StepCard>

      <StepCard step={3} title={t('添加自定义模型')}>
        <p>{t('点击 "+ 添加模型"，服务商类型选择 "OpenAI"（或 "OpenAI 兼容"），按下表填写：')}</p>
        <div className='docs-kv'>
          <div><b>{t('服务商名称')}：</b>{systemName}</div>
          <div><b>API Endpoint / Base URL:</b> <code>{`${serverAddress}/v1`}</code></div>
          <div><b>API Key:</b> <code>sk-xxxxxxxxxxxxxxxx</code></div>
          <div><b>{t('模型名')}：</b> <code>claude-sonnet-4-20250514</code> / <code>gpt-4o</code></div>
        </div>
        <p style={{ color: 'var(--docs-text-3)', marginTop: 8 }}>
          {t('TRAE 在添加时会调用接口校验密钥有效性，若失败将显示错误信息，可据此排查。')}
        </p>
      </StepCard>
    </article>
  );
};

export default ToolsTrae;
