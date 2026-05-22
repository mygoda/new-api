import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import EndpointList from '../../components/EndpointList';
import { realtimeEndpoints } from '../../meta/apiEndpoints';
import { useServerAddress } from '../../hooks';

const ApiRealtime = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  useEffect(() => { document.title = `${t('实时 Realtime')} | API`; }, [t]);

  return (
    <article>
      <h1>{t('实时 Realtime')}</h1>
      <p>{t('OpenAI Realtime WebSocket：低延迟语音对话场景，建立长连接后通过 JSON 消息双向交互。')}</p>

      <h2 id='endpoint'>{t('端点')}</h2>
      <EndpointList endpoints={realtimeEndpoints(serverAddress).map((e) => ({ ...e, desc: t(e.desc) }))} />

      <h2 id='note'>{t('注意')}</h2>
      <ul>
        <li>{t('需要使用 wss 协议；HTTP 部署也会被自动升级。')}</li>
        <li>{t('Header 必须包含 OpenAI-Beta: realtime=v1。')}</li>
        <li>{t('当前仅 gpt-4o-realtime-preview 等少量模型支持。')}</li>
      </ul>
    </article>
  );
};

export default ApiRealtime;
