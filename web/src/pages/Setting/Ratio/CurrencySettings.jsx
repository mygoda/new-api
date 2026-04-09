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
import {
  Button,
  Col,
  Form,
  Row,
  Space,
  Spin,
  Typography,
} from '@douyinfe/semi-ui';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
  verifyJSON,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export default function CurrencySettings(props) {
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    CurrencyRates: '',
    ModelCurrency: '',
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);
  const { t } = useTranslation();

  async function onSubmit() {
    try {
      await refForm.current
        .validate()
        .then(() => {
          const updateArray = compareObjects(inputs, inputsRow);
          if (!updateArray.length)
            return showWarning(t('你似乎并没有修改什么'));

          const requestQueue = updateArray.map((item) => {
            const value =
              typeof inputs[item.key] === 'boolean'
                ? String(inputs[item.key])
                : inputs[item.key];
            return API.put('/api/option/', { key: item.key, value });
          });

          setLoading(true);
          Promise.all(requestQueue)
            .then((res) => {
              if (res.includes(undefined)) {
                return showError(
                  requestQueue.length > 1
                    ? t('部分保存失败，请重试')
                    : t('保存失败'),
                );
              }

              for (let i = 0; i < res.length; i++) {
                if (!res[i].data.success) {
                  return showError(res[i].data.message);
                }
              }

              showSuccess(t('保存成功'));
              props.refresh();
            })
            .catch((error) => {
              console.error('Unexpected error:', error);
              showError(t('保存失败，请重试'));
            })
            .finally(() => {
              setLoading(false);
            });
        })
        .catch(() => {
          showError(t('请检查输入'));
        });
    } catch (error) {
      showError(t('请检查输入'));
      console.error(error);
    }
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
    <Spin spinning={loading}>
      <Form
        values={inputs}
        getFormApi={(formAPI) => (refForm.current = formAPI)}
        style={{ marginBottom: 15 }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('汇率配置')}
              extraText={
                <Text>
                  {t('配置汇率表，格式为 JSON 对象。键为货币代码（ISO 4217），值为 1 美元兑换该货币的汇率。')}
                  <br />
                  {t('示例：{"CNY": 7.3} 表示 1 USD = 7.3 CNY')}
                </Text>
              }
              placeholder={'{"CNY": 7.3}'}
              field={'CurrencyRates'}
              autosize={{ minRows: 4, maxRows: 8 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: t('不是合法的 JSON 字符串'),
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, CurrencyRates: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('模型币种配置')}
              extraText={
                <Text>
                  {t('为模型指定计费币种，格式为 JSON 对象。键为模型名称，值为货币代码。')}
                  <br />
                  {t('未配置的模型默认使用 USD。配置后，该模型的倍率会自动按汇率转换为美元等值。')}
                  <br />
                  {t('示例：{"ERNIE-4.0-8K": "CNY", "qwen-plus": "CNY"}')}
                </Text>
              }
              placeholder={'{"ERNIE-4.0-8K": "CNY", "qwen-plus": "CNY"}'}
              field={'ModelCurrency'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: t('不是合法的 JSON 字符串'),
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, ModelCurrency: value })
              }
            />
          </Col>
        </Row>
        <Row>
          <Col>
            <Space>
              <Button
                theme='solid'
                type={'primary'}
                htmlType={'submit'}
                onClick={onSubmit}
              >
                {t('保存')}
              </Button>
            </Space>
          </Col>
        </Row>
      </Form>
    </Spin>
  );
}

