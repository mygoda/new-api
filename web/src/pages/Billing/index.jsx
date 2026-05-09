/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React from 'react';
import BillingV2Page from '../../components/billing-v2';

/**
 * /console/billing
 *
 * v2 主页面。原有 BillingTable(MySQL logs)的逻辑保留在
 * components/table/billing/ 目录,作为 admin 维度的兜底,
 * 后续会移到 /admin/billing 独立页面。这里只面向用户视角。
 */
const Billing = () => (
  <div className='mt-[60px]'>
    <BillingV2Page />
  </div>
);

export default Billing;
