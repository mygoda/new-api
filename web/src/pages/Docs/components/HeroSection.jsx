import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../../context/Status';
import { getSystemName, getLogo } from '../../../helpers/utils';

const HeroSection = () => {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const systemName =
    statusState?.status?.system_name || getSystemName() || 'New API';
  const logo = statusState?.status?.logo || getLogo();

  return (
    <section className='docs-hero'>
      <div className='docs-hero-text'>
        <h1 className='docs-hero-title'>
          <span className='docs-hero-title-accent'>{systemName} API</span>
          <span style={{ display: 'block', fontSize: '0.55em', fontWeight: 600, marginTop: 8, color: 'var(--docs-text-1)' }}>
            {t('AI 模型聚合平台')}
          </span>
        </h1>
        <p className='docs-hero-tagline'>
          {t('兼容 OpenAI API 格式，一站式接入主流 AI 模型。统一接口、统一计费、统一监控。')}
        </p>
        <div className='docs-hero-actions'>
          <Link className='docs-btn docs-btn-primary' to='/docs/guide/getting-started'>
            {t('快速开始')}
          </Link>
          <Link className='docs-btn docs-btn-secondary' to='/docs/guide/reference'>
            {t('API 参考')}
          </Link>
        </div>
      </div>
      <div className='docs-hero-image'>
        <div className='docs-hero-image-bg' />
        {logo && <img src={logo} alt={systemName} />}
      </div>
    </section>
  );
};

export default HeroSection;
