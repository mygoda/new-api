import React from 'react';
import { useTranslation } from 'react-i18next';

const features = [
  { icon: '🚀', title: 'OpenAI 兼容', desc: '完全兼容 OpenAI API 格式，现有 SDK 与业务调用迁移成本极低。' },
  { icon: '🤖', title: '多模型支持', desc: '支持 GPT、Claude、Gemini、DeepSeek、通义千问等主流大模型与图像/视频/音频能力。' },
  { icon: '🔒', title: '安全可靠', desc: '支持 API Key 管理、调用统计、频率限制与企业接入治理。' },
  { icon: '💰', title: '统一计费', desc: '所有模型按 Token 计费，余额实时扣减，多维度账单与导出。' },
  { icon: '📊', title: '实时监控', desc: '通过日志与统计接口快速定位调用情况、用量趋势与账户余额。' },
];

const FeatureGrid = () => {
  const { t } = useTranslation();
  return (
    <section className='docs-features'>
      {features.map((f) => (
        <div className='docs-feature' key={f.title}>
          <div className='docs-feature-icon'>{f.icon}</div>
          <h3 className='docs-feature-title'>{t(f.title)}</h3>
          <p className='docs-feature-desc'>{t(f.desc)}</p>
        </div>
      ))}
    </section>
  );
};

export default FeatureGrid;
