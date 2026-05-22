import React from 'react';
import { copy, showSuccess } from '../../../helpers';
import { useTranslation } from 'react-i18next';

const CodeBlock = ({ code, lang, children }) => {
  const { t } = useTranslation();
  const text = typeof code === 'string' ? code : children?.toString?.() || '';
  const handleCopy = async () => {
    const ok = await copy(text);
    if (ok) showSuccess(t('已复制到剪切板'));
  };

  return (
    <div className='docs-code-block'>
      {lang && <span className='docs-code-lang'>{lang}</span>}
      <button className='copy-btn' onClick={handleCopy} type='button'>
        {t('复制')}
      </button>
      <pre>
        <code>{children ?? code}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;
