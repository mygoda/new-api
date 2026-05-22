import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import EndpointList from '../../components/EndpointList';
import { embeddingsEndpoints } from '../../meta/apiEndpoints';

const ApiEmbeddings = () => {
  const { t } = useTranslation();
  useEffect(() => { document.title = `${t('嵌入 Embeddings')} | API`; }, [t]);

  return (
    <article>
      <h1>{t('嵌入 Embeddings')}</h1>
      <p>{t('将文本编码为高维向量，是 RAG、语义检索、聚类、相似度计算等场景的基础能力。')}</p>

      <h2 id='endpoint'>{t('端点')}</h2>
      <EndpointList endpoints={embeddingsEndpoints.map((e) => ({ ...e, desc: t(e.desc) }))} />

      <h2 id='tips'>{t('使用提示')}</h2>
      <ul>
        <li>{t('input 字段支持单字符串或字符串数组，建议每次批量发送多个文本以降低开销。')}</li>
        <li>{t('text-embedding-3-small 维度 1536、3-large 维度 3072，可在 dimensions 参数中减少。')}</li>
        <li>{t('返回的向量已归一化，可直接用余弦相似度。')}</li>
      </ul>
    </article>
  );
};

export default ApiEmbeddings;
