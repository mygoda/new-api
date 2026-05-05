/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useState, useRef } from 'react';
import { Button, Col, Form, Row, Spin, Toast } from '@douyinfe/semi-ui';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
  parseHttpStatusCodeRules,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';
import HttpStatusCodeRulesInput from '../../../components/settings/HttpStatusCodeRulesInput';

export default function SettingsMonitoring(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    ChannelDisableThreshold: '',
    QuotaRemindThreshold: '',
    AutomaticDisableChannelEnabled: false,
    AutomaticEnableChannelEnabled: false,
    AutomaticDisableChannelModelEnabled: true,
    ChannelModelHeartbeatSuccessThreshold: '',
    ChannelModelHeartbeatIntervalSeconds: '',
    FeishuAlertEnabled: false,
    FeishuAlertWebhookUrl: '',
    FeishuAlertSignSecret: '',
    FeishuAlertAppId: '',
    FeishuAlertAppSecret: '',
    FeishuAlertReceiveId: '',
    FeishuAlertReceiveIdType: 'chat_id',
    FeishuAlertDedupSeconds: 120,
    FeishuAlertEventMask: '',
    FeishuAlertRelay5xxWindowSeconds: 60,
    FeishuAlertRelay5xxThreshold: 10,
    FeishuAlertHeartbeatFailureLimit: 30,
    AutomaticDisableKeywords: '',
    AutomaticDisableStatusCodes: '401',
    AutomaticRetryStatusCodes:
      '100-199,300-399,401-407,409-499,500-503,505-523,525-599',
    'monitor_setting.auto_test_channel_enabled': false,
    'monitor_setting.auto_test_channel_minutes': 10,
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);
  const parsedAutoDisableStatusCodes = parseHttpStatusCodeRules(
    inputs.AutomaticDisableStatusCodes || '',
  );
  const parsedAutoRetryStatusCodes = parseHttpStatusCodeRules(
    inputs.AutomaticRetryStatusCodes || '',
  );

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    if (!parsedAutoDisableStatusCodes.ok) {
      const details =
        parsedAutoDisableStatusCodes.invalidTokens &&
        parsedAutoDisableStatusCodes.invalidTokens.length > 0
          ? `: ${parsedAutoDisableStatusCodes.invalidTokens.join(', ')}`
          : '';
      return showError(`${t('自动禁用状态码格式不正确')}${details}`);
    }
    if (!parsedAutoRetryStatusCodes.ok) {
      const details =
        parsedAutoRetryStatusCodes.invalidTokens &&
        parsedAutoRetryStatusCodes.invalidTokens.length > 0
          ? `: ${parsedAutoRetryStatusCodes.invalidTokens.join(', ')}`
          : '';
      return showError(`${t('自动重试状态码格式不正确')}${details}`);
    }
    const requestQueue = updateArray.map((item) => {
      let value = '';
      if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else {
        const normalizedMap = {
          AutomaticDisableStatusCodes: parsedAutoDisableStatusCodes.normalized,
          AutomaticRetryStatusCodes: parsedAutoRetryStatusCodes.normalized,
        };
        value = normalizedMap[item.key] ?? inputs[item.key];
      }
      return API.put('/api/option/', {
        key: item.key,
        value,
      });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined))
            return showError(t('部分保存失败，请重试'));
        }
        showSuccess(t('保存成功'));
        props.refresh();
      })
      .catch(() => {
        showError(t('保存失败，请重试'));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  async function onTestFeishu() {
    if (!inputs.FeishuAlertWebhookUrl) {
      return showError(t('请先填写并保存 飞书 Webhook URL 后再测试'));
    }
    setLoading(true);
    try {
      const res = await API.post('/api/option/test/feishu');
      const { success, message } = res.data;
      if (success) {
        Toast.success(message || t('已发送测试消息'));
      } else {
        Toast.error(message || t('测试失败'));
      }
    } catch (e) {
      Toast.error(t('测试失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const currentInputs = {};
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        let v = props.options[key];
        // 服务端 Option 一律以字符串形式下发，但 Semi UI Form.Switch / InputNumber
        // 严格按 boolean / number 判定渲染状态。根据初始 state 类型把字符串
        // 归一化回原始类型，否则会出现 Switch 视觉与实际值脱节、保存时 compareObjects
        // 因为类型不一致而误判为「未修改」。
        const defaultType = typeof inputs[key];
        if (defaultType === 'boolean') {
          v = v === true || v === 'true';
        } else if (defaultType === 'number' && typeof v === 'string' && v !== '') {
          const n = Number(v);
          if (!Number.isNaN(n)) v = n;
        }
        currentInputs[key] = v;
      }
    }
    setInputs(currentInputs);
    setInputsRow(structuredClone(currentInputs));
    refForm.current.setValues(currentInputs);
  }, [props.options]);

  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={t('监控设置')}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'monitor_setting.auto_test_channel_enabled'}
                  label={t('定时测试所有通道')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'monitor_setting.auto_test_channel_enabled': value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('自动测试所有通道间隔时间')}
                  step={1}
                  min={1}
                  suffix={t('分钟')}
                  extraText={t('每隔多少分钟测试一次所有通道')}
                  placeholder={''}
                  field={'monitor_setting.auto_test_channel_minutes'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'monitor_setting.auto_test_channel_minutes':
                        parseInt(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('测试所有渠道的最长响应时间')}
                  step={1}
                  min={0}
                  suffix={t('秒')}
                  extraText={t(
                    '当运行通道全部测试时，超过此时间将自动禁用通道',
                  )}
                  placeholder={''}
                  field={'ChannelDisableThreshold'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      ChannelDisableThreshold: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('额度提醒阈值')}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={t('低于此额度时将发送邮件提醒用户')}
                  placeholder={''}
                  field={'QuotaRemindThreshold'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaRemindThreshold: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'AutomaticDisableChannelEnabled'}
                  label={t('失败时自动禁用通道')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      AutomaticDisableChannelEnabled: value,
                    });
                  }}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'AutomaticEnableChannelEnabled'}
                  label={t('成功时自动启用通道')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AutomaticEnableChannelEnabled: value,
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'AutomaticDisableChannelModelEnabled'}
                  label={t('失败时按渠道+模型自动禁用')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AutomaticDisableChannelModelEnabled: value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  field={'ChannelModelHeartbeatSuccessThreshold'}
                  label={t('心跳恢复成功阈值')}
                  min={1}
                  step={1}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      ChannelModelHeartbeatSuccessThreshold: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  field={'ChannelModelHeartbeatIntervalSeconds'}
                  label={t('心跳检测间隔(秒)')}
                  min={1}
                  step={1}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      ChannelModelHeartbeatIntervalSeconds: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={16}>
                <HttpStatusCodeRulesInput
                  label={t('自动禁用状态码')}
                  placeholder={t('例如：401, 403, 429, 500-599')}
                  extraText={t(
                    '支持填写单个状态码或范围（含首尾），使用逗号分隔',
                  )}
                  field={'AutomaticDisableStatusCodes'}
                  onChange={(value) =>
                    setInputs({ ...inputs, AutomaticDisableStatusCodes: value })
                  }
                  parsed={parsedAutoDisableStatusCodes}
                  invalidText={t('自动禁用状态码格式不正确')}
                />
                <HttpStatusCodeRulesInput
                  label={t('自动重试状态码')}
                  placeholder={t('例如：401, 403, 429, 500-599')}
                  extraText={t(
                    '支持填写单个状态码或范围（含首尾），使用逗号分隔；504 和 524 始终不重试，不受此处配置影响',
                  )}
                  field={'AutomaticRetryStatusCodes'}
                  onChange={(value) =>
                    setInputs({ ...inputs, AutomaticRetryStatusCodes: value })
                  }
                  parsed={parsedAutoRetryStatusCodes}
                  invalidText={t('自动重试状态码格式不正确')}
                />
                <Form.TextArea
                  label={t('自动禁用关键词')}
                  placeholder={t('一行一个，不区分大小写')}
                  extraText={t(
                    '当上游通道返回错误中包含这些关键词时（不区分大小写），自动禁用通道',
                  )}
                  field={'AutomaticDisableKeywords'}
                  autosize={{ minRows: 6, maxRows: 12 }}
                  onChange={(value) =>
                    setInputs({ ...inputs, AutomaticDisableKeywords: value })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={24}>
                <div className='text-base font-medium mt-4 mb-2'>
                  {t('飞书告警机器人')}
                </div>
                <div className='text-xs text-gray-500 mb-2'>
                  {t('Webhook 与 App 模式可同时配置，配置任意一个即生效；两个都填则同一告警同时发到两边。')}
                </div>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.Switch
                  field={'FeishuAlertEnabled'}
                  label={t('启用飞书告警')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) =>
                    setInputs({ ...inputs, FeishuAlertEnabled: value })
                  }
                />
              </Col>
            </Row>

            {/* —— Webhook 模式 —— */}
            <Row gutter={16}>
              <Col span={24}>
                <div className='text-sm font-medium mt-2 mb-1'>{t('① 自定义机器人 Webhook')}</div>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={24} md={18} lg={18} xl={18}>
                <Form.Input
                  field={'FeishuAlertWebhookUrl'}
                  label={t('Webhook URL')}
                  placeholder='https://open.feishu.cn/open-apis/bot/v2/hook/...'
                  onChange={(value) =>
                    setInputs({ ...inputs, FeishuAlertWebhookUrl: value })
                  }
                />
              </Col>
              <Col xs={24} sm={24} md={6} lg={6} xl={6}>
                <Form.Input
                  field={'FeishuAlertSignSecret'}
                  label={t('加签 Secret (可选)')}
                  placeholder={t('留空则不启用加签')}
                  mode='password'
                  onChange={(value) =>
                    setInputs({ ...inputs, FeishuAlertSignSecret: value })
                  }
                />
              </Col>
            </Row>

            {/* —— App (ak/sk) 模式 —— */}
            <Row gutter={16}>
              <Col span={24}>
                <div className='text-sm font-medium mt-3 mb-1'>{t('② 应用机器人 (App ID / App Secret)')}</div>
                <div className='text-xs text-gray-500 mb-2'>
                  {t('需要先在飞书开放平台创建自建应用，把它加进目标群，并开启 im:message:send_as_bot 权限。')}
                </div>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Input
                  field={'FeishuAlertAppId'}
                  label={t('App ID')}
                  placeholder='cli_xxxxxxxxxxxx'
                  onChange={(value) =>
                    setInputs({ ...inputs, FeishuAlertAppId: value })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Input
                  field={'FeishuAlertAppSecret'}
                  label={t('App Secret')}
                  mode='password'
                  placeholder={t('保存后不再回显')}
                  onChange={(value) =>
                    setInputs({ ...inputs, FeishuAlertAppSecret: value })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={4} lg={4} xl={4}>
                <Form.Select
                  field={'FeishuAlertReceiveIdType'}
                  label={t('接收者类型')}
                  optionList={[
                    { value: 'chat_id', label: 'chat_id' },
                    { value: 'open_id', label: 'open_id' },
                    { value: 'user_id', label: 'user_id' },
                    { value: 'union_id', label: 'union_id' },
                    { value: 'email', label: 'email' },
                  ]}
                  onChange={(value) =>
                    setInputs({ ...inputs, FeishuAlertReceiveIdType: value })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={4} lg={4} xl={4}>
                <Form.Input
                  field={'FeishuAlertReceiveId'}
                  label={t('Receive ID')}
                  placeholder='oc_xxxxxxxx'
                  onChange={(value) =>
                    setInputs({ ...inputs, FeishuAlertReceiveId: value })
                  }
                />
              </Col>
            </Row>

            {/* —— 通用参数 —— */}
            <Row gutter={16}>
              <Col span={24}>
                <div className='text-sm font-medium mt-3 mb-1'>{t('③ 通用参数')}</div>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.InputNumber
                  field={'FeishuAlertDedupSeconds'}
                  label={t('去重窗口(秒)')}
                  min={0}
                  step={10}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      FeishuAlertDedupSeconds: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.InputNumber
                  field={'FeishuAlertHeartbeatFailureLimit'}
                  label={t('心跳连续失败终止次数')}
                  min={1}
                  step={1}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      FeishuAlertHeartbeatFailureLimit: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.InputNumber
                  field={'FeishuAlertRelay5xxWindowSeconds'}
                  label={t('Relay 5xx 窗口(秒)')}
                  min={1}
                  step={10}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      FeishuAlertRelay5xxWindowSeconds: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.InputNumber
                  field={'FeishuAlertRelay5xxThreshold'}
                  label={t('Relay 5xx 阈值')}
                  min={1}
                  step={1}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      FeishuAlertRelay5xxThreshold: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24}>
                <Form.Input
                  field={'FeishuAlertEventMask'}
                  label={t('启用事件 (逗号分隔，留空表示全部)')}
                  placeholder='channel_disable,channel_model_disable,channel_recover,heartbeat_failed,relay_5xx,panic'
                  onChange={(value) =>
                    setInputs({ ...inputs, FeishuAlertEventMask: value })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Button
                size='default'
                type='secondary'
                onClick={onTestFeishu}
                style={{ marginRight: 8 }}
              >
                {t('发送测试卡片')}
              </Button>
            </Row>
            <Row>
              <Button size='default' onClick={onSubmit}>
                {t('保存监控设置')}
              </Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>
    </>
  );
}
