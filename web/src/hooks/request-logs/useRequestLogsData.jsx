import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  getTodayStartTimestamp,
  isAdmin,
  showError,
  timestamp2string,
  copy,
  showSuccess,
} from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { Modal } from '@douyinfe/semi-ui';

export const useRequestLogsData = () => {
  const { t } = useTranslation();
  const isAdminUser = isAdmin();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [logCount, setLogCount] = useState(0);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);

  // Detail modal
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailModalTitle, setDetailModalTitle] = useState('');
  const [detailModalContent, setDetailModalContent] = useState('');

  // Form state
  const [formApi, setFormApi] = useState(null);
  const now = new Date();
  const formInitValues = {
    request_id: '',
    token_name: '',
    model_name: '',
    channel: '',
    group: '',
    client_ip: '',
    is_success: '',
    dateRange: [
      timestamp2string(getTodayStartTimestamp()),
      timestamp2string(now.getTime() / 1000 + 3600),
    ],
  };

  const getFormValues = () => {
    const formValues = formApi ? formApi.getValues() : {};

    let start_timestamp = timestamp2string(getTodayStartTimestamp());
    let end_timestamp = timestamp2string(now.getTime() / 1000 + 3600);

    if (
      formValues.dateRange &&
      Array.isArray(formValues.dateRange) &&
      formValues.dateRange.length === 2
    ) {
      start_timestamp = formValues.dateRange[0];
      end_timestamp = formValues.dateRange[1];
    }

    return {
      request_id: formValues.request_id || '',
      token_name: formValues.token_name || '',
      model_name: formValues.model_name || '',
      channel: formValues.channel || '',
      group: formValues.group || '',
      client_ip: formValues.client_ip || '',
      is_success: formValues.is_success ?? '',
      start_timestamp,
      end_timestamp,
    };
  };

  const loadLogs = async (page, size) => {
    setLoading(true);
    const {
      request_id,
      token_name,
      model_name,
      channel,
      group,
      client_ip,
      is_success,
      start_timestamp,
      end_timestamp,
    } = getFormValues();

    const localStartTimestamp = Date.parse(start_timestamp) / 1000;
    const localEndTimestamp = Date.parse(end_timestamp) / 1000;

    const params = new URLSearchParams();
    params.set('p', page);
    params.set('page_size', size);
    if (request_id) params.set('request_id', request_id);
    if (token_name) params.set('token_name', token_name);
    if (model_name) params.set('model_name', model_name);
    if (channel) params.set('channel', channel);
    if (group) params.set('group', group);
    if (client_ip) params.set('client_ip', client_ip);
    if (is_success !== '') params.set('is_success', is_success);
    if (localStartTimestamp) params.set('start_timestamp', Math.floor(localStartTimestamp));
    if (localEndTimestamp) params.set('end_timestamp', Math.floor(localEndTimestamp));

    const endpoint = isAdminUser ? '/api/log/doris' : '/api/log/doris/self';
    const url = `${endpoint}?${params.toString()}`;

    try {
      const res = await API.get(url);
      const { success, message, data } = res.data;
      if (success) {
        const items = (data.items || []).map((item, idx) => ({
          ...item,
          key: `${item.request_id}-${idx}`,
        }));
        setActivePage(data.page);
        setPageSize(data.page_size);
        setLogCount(data.total);
        setLogs(items);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    }
    setLoading(false);
  };

  const handlePageChange = (page) => {
    setActivePage(page);
    loadLogs(page, pageSize);
  };

  const handlePageSizeChange = (size) => {
    localStorage.setItem('page-size', size + '');
    setPageSize(size);
    setActivePage(1);
    loadLogs(1, size);
  };

  const refresh = () => {
    setActivePage(1);
    loadLogs(1, pageSize);
  };

  const copyText = async (e, text) => {
    e.stopPropagation();
    if (await copy(text)) {
      showSuccess(t('已复制'));
    } else {
      Modal.error({ title: t('无法复制到剪贴板，请手动复制'), content: text });
    }
  };

  const showDetail = (title, content) => {
    setDetailModalTitle(title);
    let formatted = content;
    if (typeof content === 'string' && content.trim()) {
      try {
        formatted = JSON.stringify(JSON.parse(content), null, 2);
      } catch {
        // not valid JSON, show as-is
      }
    }
    setDetailModalContent(formatted);
    setDetailModalVisible(true);
  };

  useEffect(() => {
    const localPageSize =
      parseInt(localStorage.getItem('page-size')) || ITEMS_PER_PAGE;
    setPageSize(localPageSize);
    loadLogs(1, localPageSize);
  }, []);

  return {
    logs,
    loading,
    activePage,
    logCount,
    pageSize,
    isAdminUser,
    formApi,
    setFormApi,
    formInitValues,
    loadLogs,
    handlePageChange,
    handlePageSizeChange,
    refresh,
    copyText,
    showDetail,
    detailModalVisible,
    setDetailModalVisible,
    detailModalTitle,
    detailModalContent,
    t,
  };
};
