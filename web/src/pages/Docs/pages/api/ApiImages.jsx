import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import EndpointList from '../../components/EndpointList';
import { imageEndpoints } from '../../meta/apiEndpoints';

const ApiImages = () => {
  const { t } = useTranslation();
  useEffect(() => { document.title = `${t('图像 Images')} | API`; }, [t]);

  return (
    <article>
      <h1>{t('图像 Images')}</h1>
      <p>{t('覆盖文生图、图像编辑、图像变体三类 OpenAI 兼容接口，以及 Midjourney Proxy 的异步任务接口。')}</p>

      <h2 id='openai-images'>{t('OpenAI 兼容图像')}</h2>
      <EndpointList endpoints={imageEndpoints.slice(0, 3).map((e) => ({ ...e, desc: t(e.desc) }))} />

      <h2 id='midjourney'>Midjourney Proxy</h2>
      <p>{t('异步任务模式：提交任务 → 轮询查询。')}</p>
      <EndpointList endpoints={imageEndpoints.slice(3).map((e) => ({ ...e, desc: t(e.desc) }))} />
    </article>
  );
};

export default ApiImages;
