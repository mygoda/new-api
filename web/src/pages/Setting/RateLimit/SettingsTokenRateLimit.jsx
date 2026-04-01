import React, { useEffect, useState, useRef } from 'react';
import { Button, Col, Form, Row, Spin } from '@douyinfe/semi-ui';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

export default function TokenRateLimit(props) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    TokenRateLimitEnabled: false,
    TokenRateLimitDefaultRPM: 0,
    TokenRateLimitDefaultTPM: 0,
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    const requestQueue = updateArray.map((item) => {
      let value = '';
      if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else {
        value = inputs[item.key];
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

        for (let i = 0; i < res.length; i++) {
          if (!res[i].data.success) {
            return showError(res[i].data.message);
          }
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

  useEffect(() => {
    const currentInputs = {};
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        currentInputs[key] = props.options[key];
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
          <Form.Section text={t('令牌速率限制')}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'TokenRateLimitEnabled'}
                  label={t('启用令牌级别速率限制')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      TokenRateLimitEnabled: value,
                    });
                  }}
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('默认每分钟最大请求数 (RPM)')}
                  step={1}
                  min={0}
                  max={100000000}
                  suffix={t('次/分钟')}
                  extraText={t('全局默认值，0 表示不限制。令牌可单独覆盖此值')}
                  field={'TokenRateLimitDefaultRPM'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      TokenRateLimitDefaultRPM: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('默认每分钟最大 Token 数 (TPM)')}
                  step={1000}
                  min={0}
                  max={100000000}
                  suffix={t('Token/分钟')}
                  extraText={t('全局默认值，0 表示不限制。令牌可单独覆盖此值')}
                  field={'TokenRateLimitDefaultTPM'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      TokenRateLimitDefaultTPM: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row style={{ marginTop: 8 }}>
              <Col xs={24} sm={16}>
                <div style={{ color: 'var(--semi-color-text-2)', fontSize: 13 }}>
                  <p>{t('说明：')}</p>
                  <ul>
                    <li>{t('令牌速率限制按每个 API Key 独立计算，限制周期固定为 1 分钟。')}</li>
                    <li>{t('RPM：请求发起前检查并计数。TPM：请求完成后记录实际消耗的 Token 数。')}</li>
                    <li>{t('每个令牌可在编辑页面单独设置 RPM/TPM，设置后覆盖此处的全局默认值。')}</li>
                    <li>{t('启用 Redis 后限流数据跨节点共享，未启用 Redis 时仅在单进程内生效。')}</li>
                  </ul>
                </div>
              </Col>
            </Row>
            <Row>
              <Button size='default' onClick={onSubmit}>
                {t('保存令牌速率限制')}
              </Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>
    </>
  );
}
