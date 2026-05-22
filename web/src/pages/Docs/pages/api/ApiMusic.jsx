import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import EndpointList from '../../components/EndpointList';
import { musicEndpoints } from '../../meta/apiEndpoints';

const ApiMusic = () => {
  const { t } = useTranslation();
  useEffect(() => { document.title = `${t('音乐 Music')} | API`; }, [t]);

  return (
    <article>
      <h1>{t('音乐 Music')}</h1>
      <p>{t('Suno API 异步任务：提交歌曲 / 歌词生成 → 轮询查询状态与结果。')}</p>

      <h2 id='endpoints'>{t('端点')}</h2>
      <EndpointList endpoints={musicEndpoints.map((e) => ({ ...e, desc: t(e.desc) }))} />

      <h2 id='modes'>{t('两种模式')}</h2>
      <ul>
        <li>
          <b>{t('描述模式')}</b>：{t('只填 gpt_description_prompt，由模型自动写词作曲。')}
        </li>
        <li>
          <b>{t('自定义模式')}</b>：{t('填写 prompt（即歌词）、title、tags，可精确控制风格与文本。')}
        </li>
      </ul>
    </article>
  );
};

export default ApiMusic;
