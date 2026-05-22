import React, { useContext, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useServerAddress } from '../../hooks';
import { StatusContext } from '../../../../context/Status';
import { getSystemName } from '../../../../helpers/utils';
import { copy, showSuccess } from '../../../../helpers';

const InfoTable = ({ rows }) => (
  <table>
    <thead>
      <tr>
        <th>{rows.headers[0]}</th>
        <th>{rows.headers[1]}</th>
      </tr>
    </thead>
    <tbody>
      {rows.items.map(([k, v]) => (
        <tr key={k}><td>{k}</td><td>{v}</td></tr>
      ))}
    </tbody>
  </table>
);

const LinkGroup = ({ id, title, items }) => (
  <>
    <h2 id={id}>{title}</h2>
    <ul>
      {items.map((item) => (
        <li key={item.to}>
          <Link to={item.to}>{item.label}</Link>
          {item.desc && <span style={{ color: 'var(--docs-text-3)' }}> — {item.desc}</span>}
        </li>
      ))}
    </ul>
  </>
);

const Reference = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  const [statusState] = useContext(StatusContext);
  const systemName = statusState?.status?.system_name || getSystemName() || 'New API';

  useEffect(() => { document.title = `${t('API 参考')} | ${systemName}`; }, [t, systemName]);

  const handleCopy = async (text) => {
    const ok = await copy(text);
    if (ok) showSuccess(t('已复制到剪切板'));
  };

  return (
    <article>
      <h1>{t('API 参考')}</h1>
      <p>
        {t('本页是')} {systemName} {t('文档入口索引，按能力维度分组列出所有可用 API。点击每个分类查看完整的端点、参数与示例。')}
      </p>

      <h2 id='basic-info'>{t('基础信息')}</h2>
      <InfoTable
        rows={{
          headers: [t('项目'), t('值')],
          items: [
            [
              'Base URL',
              <code
                key='base'
                style={{ cursor: 'pointer' }}
                onClick={() => handleCopy(`${serverAddress}/v1`)}
                title={t('点击复制')}
              >
                {serverAddress}/v1
              </code>,
            ],
            [t('鉴权方式'), <code key='auth'>Authorization: Bearer YOUR_API_KEY</code>],
            [t('响应格式'), <code key='ct'>application/json</code>],
            ['OpenAI ' + t('兼容'), t('是')],
            [t('流式协议'), <code key='sse'>text/event-stream (SSE)</code>],
            [t('计费方式'), t('按 Token / 任务结果计费，余额实时扣减')],
            [t('错误码'), t('与 OpenAI 兼容（401 / 403 / 429 / 5xx），响应体含 error.code 与 error.message')],
          ],
        }}
      />

      <div className='docs-banner info'>
        <div className='docs-banner-title'>{t('鉴权令牌从哪里获取？')}</div>
        <div>
          {t('登录后进入')}{' '}
          <Link to='/console/token'>{t('令牌管理')}</Link>{' '}
          {t('创建以 sk- 开头的密钥；强烈建议为不同业务创建独立令牌，便于分项统计与吊销。')}
        </div>
      </div>

      <LinkGroup
        id='chat-api'
        title={t('聊天 API')}
        items={[
          { to: '/docs/api/chat', label: t('OpenAI Chat / Responses / Claude Messages / Gemini'), desc: t('一站式聊天补全；支持流式、工具调用、视觉输入。') },
        ]}
      />

      <LinkGroup
        id='embeddings-api'
        title={t('嵌入 API')}
        items={[
          { to: '/docs/api/embeddings', label: t('文本向量嵌入'), desc: t('OpenAI 兼容；用于 RAG、语义检索、聚类。') },
        ]}
      />

      <LinkGroup
        id='image-api'
        title={t('图像 API')}
        items={[
          { to: '/docs/api/images', label: t('文生图 / 图像编辑 / 图像变体'), desc: t('GPT Image、DALL-E、Midjourney Proxy。') },
        ]}
      />

      <LinkGroup
        id='audio-api'
        title={t('音频 API')}
        items={[
          { to: '/docs/api/audio', label: t('语音合成 (TTS) / 语音识别 (Whisper) / 翻译'), desc: t('全部兼容 OpenAI 接口规范。') },
        ]}
      />

      <LinkGroup
        id='rerank-api'
        title={t('重排 API')}
        items={[
          { to: '/docs/api/rerank', label: t('文档相关性重排序'), desc: t('兼容 Jina / Cohere / Xinference。') },
        ]}
      />

      <LinkGroup
        id='realtime-api'
        title={t('实时 API')}
        items={[
          { to: '/docs/api/realtime', label: t('Realtime WebSocket 语音对话'), desc: t('低延迟双向音频流。') },
        ]}
      />

      <LinkGroup
        id='music-api'
        title={t('音乐 API')}
        items={[
          { to: '/docs/api/music', label: t('Suno 歌曲 / 歌词生成'), desc: t('异步任务模式，提交后轮询查询。') },
        ]}
      />

      <LinkGroup
        id='video-api'
        title={t('视频 API')}
        items={[
          { to: '/docs/api/video', label: t('文生视频 / 图生视频 / 首尾帧 / Seedance 2.0'), desc: t('OpenAI Video 协议；兼容 Kling / Sora / Doubao Seedance 等。') },
        ]}
      />

      <LinkGroup
        id='ops-api'
        title={t('日志与账单 API')}
        items={[
          { to: '/docs/guide/data-export', label: t('日志查询与数据导出'), desc: t('用户日志、统计、余额、账单明细等运营接口。') },
        ]}
      />

      <h2 id='conventions'>{t('通用约定')}</h2>
      <ul>
        <li><b>{t('请求方法')}</b>：{t('POST 用于创建 / 调用；GET 用于查询；DELETE 用于删除任务。')}</li>
        <li><b>{t('时间戳')}</b>：{t('所有返回时间为 Unix 秒级时间戳（UTC）。')}</li>
        <li><b>{t('流式响应')}</b>：{t('在请求中设置 stream=true 即开启 SSE；以 data: [DONE] 标记结束。')}</li>
        <li><b>{t('限流')}</b>：{t('未通过 429 提示频次限制；可在令牌上单独配置 RPM / TPM。')}</li>
        <li><b>{t('幂等')}</b>：{t('图像 / 视频 / 音乐等异步任务可用 request_id 透传业务 ID 便于查询。')}</li>
      </ul>

      <h2 id='sdk'>{t('SDK 与示例')}</h2>
      <p>
        {t('完整的 cURL / Python / Node.js 调用示例请参考')}{' '}
        <Link to='/docs/guide/examples'>{t('代码示例')}</Link>
        {t('；想要快速开始可查看')}{' '}
        <Link to='/docs/guide/getting-started'>{t('快速开始')}</Link>。
      </p>
    </article>
  );
};

export default Reference;
