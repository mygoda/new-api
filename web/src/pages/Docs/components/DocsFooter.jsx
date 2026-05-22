import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../../context/Status';
import { getSystemName, getFooterHTML } from '../../../helpers/utils';

const DocsFooter = () => {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const systemName = statusState?.status?.system_name || getSystemName() || 'New API';
  const footerHtml = getFooterHTML();

  if (footerHtml && footerHtml.trim()) {
    return (
      <footer
        className='docs-footer'
        dangerouslySetInnerHTML={{ __html: footerHtml }}
      />
    );
  }

  return (
    <footer className='docs-footer'>
      {t('Copyright © ')}
      {new Date().getFullYear()}
      {' · '}
      {systemName}
      {' · '}
      {t('Powered by ')}
      <a
        href='https://github.com/QuantumNous/new-api'
        target='_blank'
        rel='noreferrer noopener'
        style={{ color: 'inherit', textDecoration: 'underline' }}
      >
        new-api
      </a>
    </footer>
  );
};

export default DocsFooter;
