import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import EndpointList from '../../components/EndpointList';
import { rerankEndpoints } from '../../meta/apiEndpoints';

const ApiRerank = () => {
  const { t } = useTranslation();
  useEffect(() => { document.title = `${t('重排 Rerank')} | API`; }, [t]);

  return (
    <article>
      <h1>{t('重排 Rerank')}</h1>
      <p>{t('对一批候选文档按相关性重新排序，常用于 RAG / 搜索结果二次精排。兼容 Jina / Cohere / Xinference 等服务商格式。')}</p>

      <h2 id='endpoint'>{t('端点')}</h2>
      <EndpointList endpoints={rerankEndpoints.map((e) => ({ ...e, desc: t(e.desc) }))} />

      <h2 id='use-cases'>{t('典型用法')}</h2>
      <ul>
        <li>{t('先用向量检索召回 50~200 条，再用 rerank 取 top-N，可显著提升答疑准确率。')}</li>
        <li>{t('top_n + return_documents 联合使用，方便直接拼接到大模型上下文。')}</li>
      </ul>
    </article>
  );
};

export default ApiRerank;
