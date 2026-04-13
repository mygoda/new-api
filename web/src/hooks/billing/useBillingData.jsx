import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  getTodayStartTimestamp,
  isAdmin,
  showError,
  timestamp2string,
} from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';

export const useBillingData = () => {
  const { t } = useTranslation();
  const isAdminUser = isAdmin();

  // Active tab: 'day' | 'token' | 'model' | 'detail'
  const [activeTab, setActiveTab] = useState('day');

  // Detail data
  const [details, setDetails] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailPageSize, setDetailPageSize] = useState(ITEMS_PER_PAGE);

  // Summary data
  const [summaryData, setSummaryData] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryPageSize, setSummaryPageSize] = useState(ITEMS_PER_PAGE);

  // Form state
  const [formApi, setFormApi] = useState(null);
  const now = new Date();
  const formInitValues = {
    token_name: '',
    model_name: '',
    token_id: '',
    channel: '',
    user_id: '',
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
      token_name: formValues.token_name || '',
      model_name: formValues.model_name || '',
      token_id: formValues.token_id || '',
      channel: formValues.channel || '',
      user_id: formValues.user_id || '',
      start_timestamp,
      end_timestamp,
    };
  };

  const buildParams = (page, size) => {
    const {
      token_name,
      model_name,
      token_id,
      channel,
      user_id,
      start_timestamp,
      end_timestamp,
    } = getFormValues();

    const localStartTimestamp = Date.parse(start_timestamp) / 1000;
    const localEndTimestamp = Date.parse(end_timestamp) / 1000;

    const params = new URLSearchParams();
    params.set('p', page);
    params.set('page_size', size);
    if (token_name) params.set('token_name', token_name);
    if (model_name) params.set('model_name', model_name);
    if (token_id) params.set('token_id', token_id);
    if (channel) params.set('channel', channel);
    if (user_id) params.set('user_id', user_id);
    if (localStartTimestamp)
      params.set('start_timestamp', Math.floor(localStartTimestamp));
    if (localEndTimestamp)
      params.set('end_timestamp', Math.floor(localEndTimestamp));
    return params;
  };

  const loadDetails = async (page, size) => {
    setDetailLoading(true);
    const params = buildParams(page, size);
    const endpoint = isAdminUser ? '/api/billing/' : '/api/billing/self';
    try {
      const res = await API.get(`${endpoint}?${params.toString()}`);
      const { success, message, data } = res.data;
      if (success) {
        const items = (data.items || []).map((item, idx) => ({
          ...item,
          key: `${item.request_id}-${idx}`,
        }));
        setDetailPage(data.page);
        setDetailPageSize(data.page_size);
        setDetailTotal(data.total);
        setDetails(items);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    }
    setDetailLoading(false);
  };

  const loadSummary = async (groupBy, page, size) => {
    setSummaryLoading(true);
    const params = buildParams(page, size);
    params.set('group_by', groupBy);
    const endpoint = isAdminUser
      ? '/api/billing/summary'
      : '/api/billing/self/summary';
    try {
      const res = await API.get(`${endpoint}?${params.toString()}`);
      const { success, message, data } = res.data;
      if (success) {
        const items = (data.items || []).map((item, idx) => ({
          ...item,
          key: `${groupBy}-${idx}`,
        }));
        setSummaryPage(data.page);
        setSummaryPageSize(data.page_size);
        setSummaryTotal(data.total);
        setSummaryData(items);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    }
    setSummaryLoading(false);
  };

  const loadCurrentTab = (tab, page, size) => {
    if (tab === 'detail') {
      loadDetails(page || 1, size || detailPageSize);
    } else {
      loadSummary(tab, page || 1, size || summaryPageSize);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSummaryPage(1);
    setDetailPage(1);
    loadCurrentTab(tab, 1);
  };

  const handleDetailPageChange = (page) => {
    setDetailPage(page);
    loadDetails(page, detailPageSize);
  };

  const handleDetailPageSizeChange = (size) => {
    localStorage.setItem('billing-page-size', size + '');
    setDetailPageSize(size);
    setDetailPage(1);
    loadDetails(1, size);
  };

  const handleSummaryPageChange = (page) => {
    setSummaryPage(page);
    loadSummary(activeTab, page, summaryPageSize);
  };

  const handleSummaryPageSizeChange = (size) => {
    localStorage.setItem('billing-summary-page-size', size + '');
    setSummaryPageSize(size);
    setSummaryPage(1);
    loadSummary(activeTab, 1, size);
  };

  const refresh = () => {
    if (activeTab === 'detail') {
      setDetailPage(1);
      loadDetails(1, detailPageSize);
    } else {
      setSummaryPage(1);
      loadSummary(activeTab, 1, summaryPageSize);
    }
  };

  useEffect(() => {
    const localPageSize =
      parseInt(localStorage.getItem('billing-page-size')) || ITEMS_PER_PAGE;
    setDetailPageSize(localPageSize);
    setSummaryPageSize(localPageSize);
    loadSummary('day', 1, localPageSize);
  }, []);

  return {
    activeTab,
    setActiveTab: handleTabChange,
    // Detail
    details,
    detailLoading,
    detailPage,
    detailTotal,
    detailPageSize,
    handleDetailPageChange,
    handleDetailPageSizeChange,
    // Summary
    summaryData,
    summaryLoading,
    summaryPage,
    summaryTotal,
    summaryPageSize,
    handleSummaryPageChange,
    handleSummaryPageSizeChange,
    // Common
    isAdminUser,
    formApi,
    setFormApi,
    formInitValues,
    refresh,
    loading: activeTab === 'detail' ? detailLoading : summaryLoading,
    t,
  };
};
