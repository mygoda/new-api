import React from 'react';

const StepCard = ({ step, title, children }) => (
  <div className='docs-step'>
    <div className='docs-step-num'>{step}</div>
    <div className='docs-step-body'>
      {title && <div className='docs-step-title'>{title}</div>}
      <div>{children}</div>
    </div>
  </div>
);

export default StepCard;
