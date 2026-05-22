import React, { useState } from 'react';
import CodeBlock from './CodeBlock';

/**
 * blocks: [{ label, lang, code }]
 */
const CodeGroup = ({ blocks }) => {
  const [active, setActive] = useState(0);
  if (!blocks?.length) return null;

  return (
    <div className='docs-code-group'>
      <div className='docs-code-group-tabs'>
        {blocks.map((b, i) => (
          <button
            key={b.label}
            type='button'
            className={`docs-code-group-tab ${i === active ? 'active' : ''}`}
            onClick={() => setActive(i)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className='docs-code-group-content'>
        <CodeBlock lang={blocks[active].lang} code={blocks[active].code}>
          {blocks[active].code}
        </CodeBlock>
      </div>
    </div>
  );
};

export default CodeGroup;
