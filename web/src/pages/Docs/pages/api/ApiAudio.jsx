import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import EndpointList from '../../components/EndpointList';
import { audioEndpoints } from '../../meta/apiEndpoints';

const ApiAudio = () => {
  const { t } = useTranslation();
  useEffect(() => { document.title = `${t('音频 Audio')} | API`; }, [t]);

  return (
    <article>
      <h1>{t('音频 Audio')}</h1>
      <p>{t('文本转语音 (TTS)、语音转文字、跨语种语音翻译，全部兼容 OpenAI 接口规范。')}</p>

      <h2 id='endpoints'>{t('端点')}</h2>
      <EndpointList endpoints={audioEndpoints.map((e) => ({ ...e, desc: t(e.desc) }))} />

      <h2 id='formats'>{t('支持的格式')}</h2>
      <ul>
        <li>{t('音频输出：mp3 / opus / aac / flac / wav / pcm')}</li>
        <li>{t('语音输入：mp3 / mp4 / m4a / wav / webm / mpeg / mpga')}</li>
        <li>{t('单文件大小：≤ 25MB；如更大请提前切片。')}</li>
      </ul>
    </article>
  );
};

export default ApiAudio;
