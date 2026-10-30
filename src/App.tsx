import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { ScannerPage } from '@/pages/ScannerPage';
import { TransactionHistoryPage } from '@/pages/TransactionHistoryPage';
import { TransactionDetailPage } from '@/pages/TransactionDetailPage';
import { DeveloperPanelPage } from '@/pages/DeveloperPanelPage';
import { ApiConsolePage } from '@/pages/ApiConsolePage';
import { ApiLogsPage } from '@/pages/ApiLogsPage';
import { ValidationLogsPage } from '@/pages/ValidationLogsPage';
import { MerchantConfigPage } from '@/pages/settings/MerchantConfigPage';
import { ApiConfigPage } from '@/pages/settings/ApiConfigPage';
import { ValidationConfigPage } from '@/pages/settings/ValidationConfigPage';
import { EndpointConfigPage } from '@/pages/settings/EndpointConfigPage';
import { MappingConfigPage } from '@/pages/settings/MappingConfigPage';
import { AppSettingsPage } from '@/pages/settings/AppSettingsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="scanner" element={<ScannerPage />} />
        <Route path="transactions" element={<TransactionHistoryPage />} />
        <Route path="transactions/:id" element={<TransactionDetailPage />} />
        <Route path="transaction-details" element={<TransactionDetailPage />} />
        <Route path="developer" element={<DeveloperPanelPage />} />
        <Route path="api-console" element={<ApiConsolePage />} />
        <Route path="api-logs" element={<ApiLogsPage />} />
        <Route path="validation-logs" element={<ValidationLogsPage />} />
        <Route path="settings/merchant" element={<MerchantConfigPage />} />
        <Route path="settings/api" element={<ApiConfigPage />} />
        <Route path="settings/validation" element={<ValidationConfigPage />} />
        <Route path="settings/endpoints" element={<EndpointConfigPage />} />
        <Route path="settings/mapping" element={<MappingConfigPage />} />
        <Route path="settings/app" element={<AppSettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
