import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EndpointList from '../../components/EndpointList';
import CodeBlock from '../../components/CodeBlock';
import { useServerAddress } from '../../hooks';

const userLogEndpoints = [
  {
    id: 'log-self',
    method: 'GET',
    path: '/api/log/self',
    urlPath: '/api/log/self?p=1&page_size=20&start_timestamp=1735689600&end_timestamp=1738367999&type=2',
    desc: '查询当前用户的调用日志，支持时间区间、模型名、令牌名、分组、请求 ID 过滤与分页。需用户登录态（Cookie / Session）。',
    customExample: `curl "%SERVER%/api/log/self?p=1&page_size=20&start_timestamp=1735689600&end_timestamp=1738367999&type=2&model_name=gpt-4o" \\
  -H "Cookie: session=YOUR_SESSION_COOKIE"`,
  },
  {
    id: 'log-self-stat',
    method: 'GET',
    path: '/api/log/self/stat',
    urlPath: '/api/log/self/stat?start_timestamp=1735689600&end_timestamp=1738367999',
    desc: '查询当前用户在指定区间的用量统计（quota / rpm / tpm 汇总）。',
    customExample: `curl "%SERVER%/api/log/self/stat?start_timestamp=1735689600&end_timestamp=1738367999" \\
  -H "Cookie: session=YOUR_SESSION_COOKIE"`,
  },
  {
    id: 'log-token',
    method: 'GET',
    path: '/api/log/token',
    desc: '使用令牌（Bearer sk-）直接查询该令牌的历史调用记录，便于第三方系统对账。返回最近若干条详情，无需用户会话。',
    customExample: `curl "%SERVER%/api/log/token" \\
  -H "Authorization: Bearer sk-xxxxxxxxxxxxxxxx"`,
  },
];

const billingEndpoints = [
  {
    id: 'billing-overview',
    method: 'GET',
    path: '/api/billing/v2/overview',
    urlPath: '/api/billing/v2/overview?start_timestamp=1735689600&end_timestamp=1738367999',
    desc: '账单总览：当期总消费、总请求数、平均 RPM / TPM、Top 模型与令牌。需要用户登录态。',
    customExample: `curl "%SERVER%/api/billing/v2/overview?start_timestamp=1735689600&end_timestamp=1738367999" \\
  -H "Cookie: session=YOUR_SESSION_COOKIE"`,
  },
  {
    id: 'billing-breakdown',
    method: 'GET',
    path: '/api/billing/v2/breakdown',
    urlPath: '/api/billing/v2/breakdown?start_timestamp=1735689600&end_timestamp=1738367999&group_by=model',
    desc: '按维度（model / token / group / channel）拆分账单。group_by 决定聚合维度。',
    customExample: `curl "%SERVER%/api/billing/v2/breakdown?start_timestamp=1735689600&end_timestamp=1738367999&group_by=model" \\
  -H "Cookie: session=YOUR_SESSION_COOKIE"`,
  },
  {
    id: 'billing-timeseries',
    method: 'GET',
    path: '/api/billing/v2/timeseries',
    urlPath: '/api/billing/v2/timeseries?start_timestamp=1735689600&end_timestamp=1738367999&interval=day',
    desc: '按时间序列返回消费曲线，interval 支持 hour / day。用于绘制日 / 时趋势图。',
    customExample: `curl "%SERVER%/api/billing/v2/timeseries?start_timestamp=1735689600&end_timestamp=1738367999&interval=day" \\
  -H "Cookie: session=YOUR_SESSION_COOKIE"`,
  },
  {
    id: 'billing-details',
    method: 'GET',
    path: '/api/billing/v2/details',
    urlPath: '/api/billing/v2/details?p=1&page_size=50&start_timestamp=1735689600&end_timestamp=1738367999',
    desc: '账单明细：按条返回每次扣费记录（含模型、令牌、原始 / 折算 quota、上下游耗时）。可分页与过滤。',
    customExample: `curl "%SERVER%/api/billing/v2/details?p=1&page_size=50&start_timestamp=1735689600&end_timestamp=1738367999" \\
  -H "Cookie: session=YOUR_SESSION_COOKIE"`,
  },
  {
    id: 'billing-anomalies',
    method: 'GET',
    path: '/api/billing/v2/anomalies',
    urlPath: '/api/billing/v2/anomalies?start_timestamp=1735689600&end_timestamp=1738367999',
    desc: '异常调用清单：返回失败 / 限流 / 高耗时 / 大额扣费等异常记录，方便排查问题。',
    customExample: `curl "%SERVER%/api/billing/v2/anomalies?start_timestamp=1735689600&end_timestamp=1738367999" \\
  -H "Cookie: session=YOUR_SESSION_COOKIE"`,
  },
];

const fieldRows = [
  ['p', 'int', '页码，从 1 开始。'],
  ['page_size', 'int', '每页条数，默认 20，最大通常为 200。'],
  ['start_timestamp', 'int', '起始时间（Unix 秒）。'],
  ['end_timestamp', 'int', '结束时间（Unix 秒）。'],
  ['type', 'int', '日志类型：0=全部，1=充值，2=消费，3=管理操作，4=系统。'],
  ['token_name', 'string', '按令牌名称过滤（精确匹配）。'],
  ['model_name', 'string', '按模型名过滤（精确匹配）。'],
  ['group', 'string', '按分组过滤。'],
  ['request_id', 'string', '按上游 request_id 精确定位单次调用。'],
  ['channel', 'int', '（仅管理员）按渠道 ID 过滤。'],
];

const DataExport = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  useEffect(() => { document.title = `${t('日志查询与导出')} | API`; }, [t]);

  const fillServer = (eps) =>
    eps.map((e) => ({
      ...e,
      desc: t(e.desc),
      customExample: e.customExample?.replaceAll('%SERVER%', serverAddress),
    }));

  return (
    <article>
      <h1>{t('日志查询与导出')}</h1>
      <p>
        {t('本节介绍如何通过 API 拉取调用日志与账单明细，适用于：')}
      </p>
      <ul>
        <li>{t('企业内部对账系统拉取日活 / 月活模型消费明细。')}</li>
        <li>{t('客户端按令牌粒度查询自己的近期调用情况。')}</li>
        <li>{t('运营 / 监控大屏对接趋势数据与异常告警。')}</li>
      </ul>

      <div className='docs-banner info'>
        <div className='docs-banner-title'>{t('两种鉴权方式')}</div>
        <ul style={{ margin: 0 }}>
          <li><b>{t('用户会话')}</b>：{t('通过浏览器登录后的 Cookie / Session 调用，用于本人在控制台内查询；CLI 调用可先用 /api/user/login 拿到 Session。')}</li>
          <li><b>{t('令牌鉴权')}</b>：<code>Authorization: Bearer sk-xxx</code>{t('，目前仅 /api/log/token 支持，用于第三方系统对账。')}</li>
        </ul>
      </div>

      <h2 id='log-endpoints'>{t('日志查询接口')}</h2>
      <EndpointList endpoints={fillServer(userLogEndpoints)} />

      <h2 id='billing-endpoints'>{t('账单与统计接口')}</h2>
      <p>{t('账单 V2 系列接口提供完整的账单分析能力，是控制台「账单」页的数据源。')}</p>
      <EndpointList endpoints={fillServer(billingEndpoints)} />

      <h2 id='common-params'>{t('通用查询参数')}</h2>
      <table>
        <thead>
          <tr><th>{t('参数')}</th><th>{t('类型')}</th><th>{t('说明')}</th></tr>
        </thead>
        <tbody>
          {fieldRows.map(([k, type, desc]) => (
            <tr key={k}><td><code>{k}</code></td><td>{type}</td><td>{t(desc)}</td></tr>
          ))}
        </tbody>
      </table>

      <h2 id='response-schema'>{t('响应结构（节选）')}</h2>
      <p>{t('日志查询返回一个分页结构，items 数组中是单条调用记录：')}</p>
      <CodeBlock lang='json' code={`{
  "success": true,
  "message": "",
  "data": {
    "page": 1,
    "page_size": 20,
    "total": 327,
    "items": [
      {
        "id": 12345678,
        "user_id": 42,
        "created_at": 1738367800,
        "type": 2,
        "content": "模型: gpt-4o, 用量: 1024 prompt + 512 completion tokens",
        "model_name": "gpt-4o",
        "token_name": "prod-key",
        "group": "default",
        "channel": 17,
        "prompt_tokens": 1024,
        "completion_tokens": 512,
        "quota": 12800,
        "request_id": "req_abc123",
        "use_time": 1820,
        "is_stream": true
      }
    ]
  }
}`}>{`{
  "success": true,
  "message": "",
  "data": {
    "page": 1,
    "page_size": 20,
    "total": 327,
    "items": [
      {
        "id": 12345678,
        "user_id": 42,
        "created_at": 1738367800,
        "type": 2,
        "content": "模型: gpt-4o, 用量: 1024 prompt + 512 completion tokens",
        "model_name": "gpt-4o",
        "token_name": "prod-key",
        "group": "default",
        "channel": 17,
        "prompt_tokens": 1024,
        "completion_tokens": 512,
        "quota": 12800,
        "request_id": "req_abc123",
        "use_time": 1820,
        "is_stream": true
      }
    ]
  }
}`}</CodeBlock>

      <h2 id='quota-conversion'>{t('quota 字段如何换算成金额')}</h2>
      <p>
        {t('quota 字段是平台内部的「点数」，1 美元 ≈ 500000 quota（具体倍率由')}{' '}
        <code>quota_per_unit</code>{' '}
        {t('系统设置控制）。换算公式：金额 = quota / quota_per_unit。前端可在用户登录态的 /api/status 接口读取该倍率。')}
      </p>

      <h2 id='export-tips'>{t('导出建议')}</h2>
      <ul>
        <li>{t('需要导出 CSV/Excel 时，可在控制台「日志」页面直接点击「导出」按钮，会按当前筛选条件导出。')}</li>
        <li>{t('大批量拉取建议设置较大的 page_size（≤200）并并发分页，避免逐条调用。')}</li>
        <li>{t('生产环境建议使用 Doris 后端（/api/log/doris/*）查询，能在亿级日志规模下保持秒级响应。')}</li>
        <li>{t('对账场景建议在请求侧带上自定义 request_id（X-Request-Id 头），便于关联业务侧 trace。')}</li>
      </ul>

      <h2 id='related'>{t('相关链接')}</h2>
      <ul>
        <li><Link to='/console/log'>{t('控制台 → 日志')}</Link>{t('（可视化查询、导出）')}</li>
        <li><Link to='/console/billing'>{t('控制台 → 账单')}</Link>{t('（账单 V2 数据源）')}</li>
        <li><Link to='/docs/guide/reference'>{t('API 参考索引')}</Link></li>
      </ul>
    </article>
  );
};

export default DataExport;
