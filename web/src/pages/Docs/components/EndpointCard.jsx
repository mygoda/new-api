import React, { useState } from 'react';
import CodeBlock from './CodeBlock';
import { useTranslation } from 'react-i18next';

const TabSwitch = ({ tabs, active, onChange }) => (
  <div className='docs-code-group-tabs' style={{ borderRadius: '8px 8px 0 0' }}>
    {tabs.map((tab, i) => (
      <button
        key={tab}
        type='button'
        className={`docs-code-group-tab ${i === active ? 'active' : ''}`}
        onClick={() => onChange(i)}
      >
        {tab}
      </button>
    ))}
  </div>
);

/**
 * Renders a single API endpoint:
 *   { id?, title?, method, path, urlPath?, desc?, body?, formData?, customExample?, curlExtra? }
 * serverAddress is required so we can build accurate cURL.
 */
const EndpointCard = ({ endpoint: ep, serverAddress }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);

  const fullUrl = `${serverAddress}${ep.urlPath || ep.path}`;
  let curl;
  if (ep.customExample) {
    curl = ep.customExample;
  } else if (ep.formData && ep.formData.length > 0) {
    curl = `curl -X ${ep.method} "${fullUrl}" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n${ep.formData.map((f) => `  -F "${f}"`).join(' \\\n')}`;
  } else if (ep.body) {
    curl = `curl -X ${ep.method} "${fullUrl}" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${ep.body}'${ep.curlExtra ? ` \\\n  ${ep.curlExtra}` : ''}`;
  } else {
    curl = `curl -X ${ep.method} "${fullUrl}" \\\n  -H "Authorization: Bearer YOUR_API_KEY"`;
  }

  const tabs = [];
  if (ep.body) tabs.push({ key: 'body', label: t('请求体'), lang: 'json', code: ep.body });
  if (ep.formData && ep.formData.length > 0) {
    tabs.push({
      key: 'form',
      label: 'form-data',
      lang: 'text',
      code: ep.formData.map((f) => f).join('\n'),
    });
  }
  tabs.push({ key: 'curl', label: 'cURL', lang: 'bash', code: curl });

  return (
    <div className='docs-endpoint'>
      <div className='docs-endpoint-head'>
        <span className={`docs-endpoint-method ${ep.method}`}>{ep.method}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {ep.title && <div className='docs-endpoint-title'>{ep.title}</div>}
          <div className='docs-endpoint-path'>{ep.path}</div>
          {ep.desc && <div className='docs-endpoint-desc'>{ep.desc}</div>}
        </div>
      </div>
      <div className='docs-endpoint-body'>
        {tabs.length > 1 && (
          <TabSwitch
            tabs={tabs.map((t) => t.label)}
            active={tab}
            onChange={setTab}
          />
        )}
        <CodeBlock lang={tabs[tab].lang} code={tabs[tab].code}>
          {tabs[tab].code}
        </CodeBlock>
      </div>
    </div>
  );
};

export default EndpointCard;
