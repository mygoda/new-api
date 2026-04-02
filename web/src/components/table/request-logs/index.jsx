import React from 'react';
import CardPro from '../../common/ui/CardPro';
import RequestLogsTableView from './RequestLogsTable';
import RequestLogsFilters from './RequestLogsFilters';
import { useRequestLogsData } from '../../../hooks/request-logs/useRequestLogsData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';
import { Modal } from '@douyinfe/semi-ui';

const RequestLogsPage = () => {
  const logsData = useRequestLogsData();
  const isMobile = useIsMobile();

  return (
    <>
      <Modal
        title={logsData.detailModalTitle}
        visible={logsData.detailModalVisible}
        onCancel={() => logsData.setDetailModalVisible(false)}
        footer={null}
        width={800}
        style={{ maxHeight: '80vh' }}
        bodyStyle={{ maxHeight: '60vh', overflow: 'auto' }}
      >
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13, fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace', lineHeight: 1.6, margin: 0, padding: 12, backgroundColor: 'var(--semi-color-fill-0)', borderRadius: 8 }}>
          {logsData.detailModalContent}
        </pre>
      </Modal>

      <CardPro
        type='type2'
        searchArea={<RequestLogsFilters {...logsData} />}
        paginationArea={createCardProPagination({
          currentPage: logsData.activePage,
          pageSize: logsData.pageSize,
          total: logsData.logCount,
          onPageChange: logsData.handlePageChange,
          onPageSizeChange: logsData.handlePageSizeChange,
          isMobile: isMobile,
          t: logsData.t,
        })}
        t={logsData.t}
      >
        <RequestLogsTableView {...logsData} />
      </CardPro>
    </>
  );
};

export default RequestLogsPage;
