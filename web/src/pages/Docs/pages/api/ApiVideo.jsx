import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/CodeBlock';
import EndpointList from '../../components/EndpointList';
import {
  videoEndpoints,
  seedanceEndpoints,
  seedanceT2vExample,
  seedanceI2vExample,
  seedanceKeyframesExample,
  seedanceV2vExample,
  seedanceResponseRunning,
  seedanceResponseSucceeded,
  seedanceResponseFailed,
  seedanceModerationResponse,
} from '../../meta/apiEndpoints';
import { useServerAddress } from '../../hooks';

const ApiVideo = () => {
  const { t } = useTranslation();
  const { serverAddress } = useServerAddress();
  useEffect(() => { document.title = `${t('视频 Video')} | API`; }, [t]);

  // Build curl bodies that inline serverAddress so the user can copy-paste.
  const curl = (path, bodyJson) =>
    `curl -X POST ${serverAddress}${path} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '${bodyJson}'`;

  return (
    <article>
      <h1>{t('视频 Video')}</h1>
      <p>{t('通用文生视频 / 图生视频接口，并提供火山方舟 Doubao Seedance Video 接入。')}</p>

      <h2 id='general'>{t('通用视频接口')}</h2>
      <EndpointList endpoints={videoEndpoints.map((e) => ({ ...e, desc: t(e.desc) }))} />

      {/* ---------- Seedance Video ---------- */}
      <h2 id='seedance'>Seedance Video</h2>
      <p>{t('Seedance Video 使用官方兼容的视频任务接口。先创建任务，再通过任务查询接口轮询状态和最终视频地址。')}</p>

      <h3 id='seedance-endpoints'>{t('接口地址')}</h3>
      <table>
        <thead>
          <tr><th>{t('能力')}</th><th>{t('方法')}</th><th>{t('路径')}</th></tr>
        </thead>
        <tbody>
          <tr><td>{t('创建视频任务')}</td><td><code>POST</code></td><td><code>/api/v3/contents/generations/tasks</code></td></tr>
          <tr><td>{t('查询视频任务')}</td><td><code>GET</code></td><td><code>/api/v3/contents/generations/tasks/{'{task_id}'}</code></td></tr>
          <tr><td>{t('审核图片')}</td><td><code>POST</code></td><td><code>/v1/images/moderations</code></td></tr>
        </tbody>
      </table>

      <h3 id='seedance-models'>{t('支持模型')}</h3>
      <table>
        <thead>
          <tr><th>{t('模型')}</th><th>{t('说明')}</th></tr>
        </thead>
        <tbody>
          <tr><td><code>doubao-seedance-2.0</code></td><td>{t('Seedance 2.0 标准模型')}</td></tr>
        </tbody>
      </table>
      <p>{t('实际可用模型以账户权限和平台配置为准。')}</p>

      <h3 id='seedance-create'>{t('创建任务')}</h3>
      <CodeBlock lang='http' code={`POST /api/v3/contents/generations/tasks
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json`}>{`POST /api/v3/contents/generations/tasks
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json`}</CodeBlock>

      <h4 id='seedance-create-params'>{t('参数')}</h4>
      <table>
        <thead>
          <tr><th>{t('参数')}</th><th>{t('必填')}</th><th>{t('说明')}</th></tr>
        </thead>
        <tbody>
          <tr><td><code>model</code></td><td>{t('是')}</td><td>{t('Seedance 模型名称')}</td></tr>
          <tr><td><code>content</code></td><td>{t('是')}</td><td>{t('多模态内容数组，通常包含一段文本和可选图片、视频、音频素材')}</td></tr>
          <tr><td><code>content[].type</code></td><td>{t('是')}</td><td>{t('内容类型，如 text、image_url、video_url、audio_url')}</td></tr>
          <tr><td><code>content[].text</code></td><td>{t('否')}</td><td>{t('文本提示词，type 为 text 时使用')}</td></tr>
          <tr><td><code>content[].image_url.url</code></td><td>{t('否')}</td><td>{t('图片 URL，可使用公网图片或审核通过后的 asset://<asset ID>')}</td></tr>
          <tr><td><code>content[].video_url.url</code></td><td>{t('否')}</td><td>{t('视频 URL，可使用公网视频或审核通过后的 asset://<asset ID>')}</td></tr>
          <tr><td><code>content[].role</code></td><td>{t('否')}</td><td>{t('素材角色，如 reference_image、first_frame、last_frame')}</td></tr>
          <tr><td><code>duration</code></td><td>{t('否')}</td><td>{t('视频时长，单位秒')}</td></tr>
          <tr><td><code>ratio</code></td><td>{t('否')}</td><td>{t('画面比例，如 16:9、9:16、1:1')}</td></tr>
          <tr><td><code>seed</code></td><td>{t('否')}</td><td>{t('随机种子')}</td></tr>
          <tr><td><code>camera_fixed</code></td><td>{t('否')}</td><td>{t('是否固定镜头')}</td></tr>
          <tr><td><code>watermark</code></td><td>{t('否')}</td><td>{t('是否添加水印')}</td></tr>
          <tr><td><code>generate_audio</code></td><td>{t('否')}</td><td>{t('是否生成音频')}</td></tr>
        </tbody>
      </table>

      <h4 id='seedance-create-example'>{t('请求示例')}</h4>
      <CodeBlock lang='bash' code={curl('/api/v3/contents/generations/tasks', seedanceEndpoints[0].body)}>
        {curl('/api/v3/contents/generations/tasks', seedanceEndpoints[0].body)}
      </CodeBlock>
      <p>
        {t('创建成功会返回官方兼容任务对象，id 是任务 ID。返回中可能保留任务服务返回的其他字段，例如 service_tier、execution_expires_after 等：')}
      </p>
      <CodeBlock lang='json' code={`{
  "id": "task_xxx",
  "model": "doubao-seedance-2.0",
  "status": "running",
  "created_at": 1770000000,
  "updated_at": 1770000000,
  "service_tier": "default",
  "execution_expires_after": 172800
}`}>{`{
  "id": "task_xxx",
  "model": "doubao-seedance-2.0",
  "status": "running",
  "created_at": 1770000000,
  "updated_at": 1770000000,
  "service_tier": "default",
  "execution_expires_after": 172800
}`}</CodeBlock>

      <h3 id='seedance-moderation'>{t('审核图片')}</h3>
      <p>
        {t('Seedance 使用真人或需要入库的图片素材时，先使用审核图片接口提交公开图片 URL。审核通过并入库后，将返回的 items[].asset_url 用作 content[].image_url.url。')}
      </p>
      <CodeBlock lang='http' code={`POST /v1/images/moderations
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json`}>{`POST /v1/images/moderations
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json`}</CodeBlock>
      <p><code>/v1/assets/moderations</code> {t('也会走同一个审核处理逻辑。')}</p>

      <h4 id='seedance-moderation-params'>{t('请求参数')}</h4>
      <table>
        <thead>
          <tr><th>{t('参数')}</th><th>{t('必填')}</th><th>{t('说明')}</th></tr>
        </thead>
        <tbody>
          <tr><td><code>model</code></td><td>{t('是')}</td><td>{t('用于选择 Seedance 渠道，建议传 doubao-seedance-2.0')}</td></tr>
          <tr><td><code>images</code></td><td>{t('否')}</td><td>{t('图片 URL 数组')}</td></tr>
          <tr><td><code>image_urls</code></td><td>{t('否')}</td><td>{t('图片 URL 数组，等价于 images')}</td></tr>
          <tr><td><code>image_url</code></td><td>{t('否')}</td><td>{t('单张图片 URL')}</td></tr>
          <tr><td><code>asset_type</code></td><td>{t('否')}</td><td>{t('资源类型，默认 Image；图片审核场景保持默认即可')}</td></tr>
        </tbody>
      </table>
      <p>
        <code>images</code>、<code>image_urls</code>、<code>image_url</code> {t('至少传一个。图片必须是公网可访问的 http 或 https URL，不支持 base64 或内联二进制内容。')}
      </p>

      <h4 id='seedance-moderation-limits'>{t('审核限制')}</h4>
      <ul>
        <li>{t('单次请求最多提交 50 个 URL；建议每次只提交 1 张图片，多张图片处理耗时更长。')}</li>
        <li>{t('同一批次只提交同一种素材类型；图片审核使用 asset_type: "Image"。')}</li>
        <li>{t('图片 URL 需要带有受支持的文件扩展名：.jpeg、.jpg、.png、.webp、.bmp、.tiff、.tif、.gif、.heic、.heif。')}</li>
        <li>{t('单张图片宽高比需在 0.4 到 2.5 之间，宽高建议在 300 到 6000 px 之间，文件大小小于 30 MB。')}</li>
        <li>{t('本接口是同步封装：系统会等待审核完成并返回统一结果；如处理超时，接口会继续轮询一段时间后再返回超时错误。')}</li>
      </ul>

      <h4 id='seedance-moderation-example'>{t('请求示例')}</h4>
      <CodeBlock lang='bash' code={curl('/v1/images/moderations', seedanceEndpoints[2].body)}>
        {curl('/v1/images/moderations', seedanceEndpoints[2].body)}
      </CodeBlock>

      <h4 id='seedance-moderation-response'>{t('返回示例')}</h4>
      <CodeBlock lang='json' code={seedanceModerationResponse}>{seedanceModerationResponse}</CodeBlock>
      <p>
        {t('当 passed 为 true 且 submit_review_status 为 1 时，表示该图片审核通过。asset_url 通常是 asset://<asset ID> 形式；图生视频时将它放入 content，并设置 role，例如 reference_image、first_frame 或 last_frame。')}
      </p>
      <p>
        {t('提示词中引用素材时使用「图片 1」「图片 2」这种「素材类型 + 序号」格式，序号按 content 数组中同类素材出现顺序从 1 开始；不要在提示词里直接写 Asset ID。')}
      </p>
      <p>
        {t('旧素材系统的 asset 码不能直接用于 Seedance 2.0。请使用当前审核接口返回的 asset_url，或使用审核结果中的新素材 ID 拼接为 asset://<asset ID>。')}
      </p>

      <h3 id='seedance-t2v'>{t('文生视频示例')}</h3>
      <CodeBlock lang='bash' code={curl('/api/v3/contents/generations/tasks', seedanceT2vExample)}>
        {curl('/api/v3/contents/generations/tasks', seedanceT2vExample)}
      </CodeBlock>

      <h3 id='seedance-i2v'>{t('审核素材图生视频示例')}</h3>
      <CodeBlock lang='bash' code={curl('/api/v3/contents/generations/tasks', seedanceI2vExample)}>
        {curl('/api/v3/contents/generations/tasks', seedanceI2vExample)}
      </CodeBlock>

      <h3 id='seedance-keyframes'>{t('首尾帧示例')}</h3>
      <p>
        {t('首尾帧分别使用 first_frame 和 last_frame 角色。素材可以是公网 URL，也可以是审核通过后的 asset://<asset ID>。')}
      </p>
      <CodeBlock lang='json' code={seedanceKeyframesExample}>{seedanceKeyframesExample}</CodeBlock>

      <h3 id='seedance-v2v'>{t('视频参考输入')}</h3>
      <p>
        {t('Seedance 2.0 支持使用视频作为参考输入时，可以在 content 中传入 video_url。真人素材或授权素材也可以使用 asset://<asset ID>。')}
      </p>
      <CodeBlock lang='json' code={seedanceV2vExample}>{seedanceV2vExample}</CodeBlock>

      <h3 id='seedance-query'>{t('返回与查询')}</h3>
      <p>{t('创建成功后保存 id，用于查询任务。')}</p>
      <CodeBlock lang='http' code={`GET /api/v3/contents/generations/tasks/{task_id}
Authorization: Bearer YOUR_API_KEY`}>{`GET /api/v3/contents/generations/tasks/{task_id}
Authorization: Bearer YOUR_API_KEY`}</CodeBlock>

      <p>{t('生成中通常返回：')}</p>
      <CodeBlock lang='json' code={seedanceResponseRunning}>{seedanceResponseRunning}</CodeBlock>

      <p>
        {t('任务完成后，查询响应会返回 status: "succeeded"，最终视频地址在 content.video_url：')}
      </p>
      <CodeBlock lang='json' code={seedanceResponseSucceeded}>{seedanceResponseSucceeded}</CodeBlock>

      <p>{t('任务失败时，查询响应会返回 status: "failed"，失败原因在 error.message：')}</p>
      <CodeBlock lang='json' code={seedanceResponseFailed}>{seedanceResponseFailed}</CodeBlock>

      <h4 id='seedance-log-policy'>{t('控制台日志口径')}</h4>
      <p>
        {t('Seedance 视频任务是异步任务。控制台使用日志中，退款类记录会区分为两种：')}
      </p>
      <table>
        <thead>
          <tr><th>{t('日志类型')}</th><th>{t('说明')}</th></tr>
        </thead>
        <tbody>
          <tr><td>{t('失败退款')}</td><td>{t('任务最终失败时，退回该任务已占用的额度')}</td></tr>
          <tr><td>{t('预扣返还')}</td><td>{t('任务成功后，系统按最终任务结果完成差额结算，返还多占用的部分')}</td></tr>
        </tbody>
      </table>
      <p>
        <code>{t('预扣返还')}</code> {t('不代表视频任务失败。判断生成结果请以任务查询接口的 status、error.message 和 content.video_url 为准。')}
      </p>

      <h4 id='seedance-status'>{t('状态值')}</h4>
      <table>
        <thead>
          <tr><th>{t('状态')}</th><th>{t('说明')}</th></tr>
        </thead>
        <tbody>
          <tr><td><code>queued</code></td><td>{t('排队中')}</td></tr>
          <tr><td><code>running</code></td><td>{t('生成中')}</td></tr>
          <tr><td><code>succeeded</code></td><td>{t('已完成')}</td></tr>
          <tr><td><code>failed</code></td><td>{t('失败，查看 error.message')}</td></tr>
        </tbody>
      </table>

      <h3 id='seedance-notes'>{t('注意事项')}</h3>
      <ul>
        <li>{t('当前不支持 base64 图片或内联二进制素材；参考图、审核图都需要先上传到可公网访问的存储，再传 URL。')}</li>
        <li>{t('审核入库素材请使用 content 的 image_url / video_url / audio_url，URL 可传 asset://<asset ID>。')}</li>
        <li>{t('提示词引用素材请使用「图片 1 / 视频 1 / 音频 1」，不要直接使用 Asset ID。')}</li>
        <li>{t('当前文档展示 doubao-seedance-2.0；实际可用范围以账户权限和平台配置为准。')}</li>
        <li>{t('resolution 仅部分模型支持；不确定时不要传入。')}</li>
      </ul>
    </article>
  );
};

export default ApiVideo;
