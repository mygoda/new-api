import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import EndpointList from '../../components/EndpointList';
import { chatEndpoints } from '../../meta/apiEndpoints';
import { useServerAddress } from '../../hooks';

const ApiChat = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  useEffect(() => { document.title = `${t('聊天 Chat')} | API`; }, [t]);

  return (
    <article>
      <h1>{t('聊天 Chat')}</h1>
      <p>{t('本节列出本平台支持的所有聊天 API。')}</p>
      <p>
        {t('鉴权方式：在请求头中添加')} <code>Authorization: Bearer YOUR_API_KEY</code>
        {t('，YOUR_API_KEY 为')}
        <Link to='/console/token'>{t('令牌管理')}</Link>
        {t('中创建的以 sk- 开头的令牌。基础地址：')}<code>{serverAddress}</code>。
      </p>

      <h2 id='endpoints'>{t('端点列表')}</h2>
      <EndpointList endpoints={chatEndpoints.map((e) => ({ ...e, desc: t(e.desc) }))} />

      <h2 id='notes'>{t('注意事项')}</h2>
      <ul>
        <li>{t('流式响应请在请求中设置 stream=true，并按 SSE 协议处理 data 事件。')}</li>
        <li>{t('Claude / Gemini 等模型可以通过相同的 /v1/chat/completions 调用，也可以使用各自的原生格式。')}</li>
        <li>{t('工具调用（function calling）通过 tools 与 tool_choice 字段控制，详见 OpenAI 官方文档。')}</li>
      </ul>
    </article>
  );
};

export default ApiChat;
