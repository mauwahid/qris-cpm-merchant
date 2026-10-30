import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, PageHeader, StatCard } from '@/components/ui/Card';
import { Badge, TxStatusBadge } from '@/components/ui/Badge';
import { IconActivity, IconBan, IconCheck, IconList, IconStore, IconWallet, IconX } from '@/components/ui/Icons';
import { useTransactionStore } from '@/store/transactionStore';
import { useConfigStore, effectiveExecutionMode, effectiveValidationMode, selectActiveEnvironment } from '@/store/configStore';
import { ScannerWorkstation } from '@/features/scanner/ScannerWorkstation';
import { FINAL_FAILURE_STATUSES } from '@/core/types';
import { formatAmount, formatDateTime } from '@/core/util/format';

export function useTransactionStats() {
  const txs = useTransactionStore((s) => s.transactions);
  return useMemo(() => {
    const approved = txs.filter((t) => t.status === 'APPROVED');
    return {
      total: txs.length,
      success: approved.length,
      failed: txs.filter((t) => FINAL_FAILURE_STATUSES.includes(t.status)).length,
      rejected: txs.filter((t) => t.status === 'REJECTED').length,
      amount: approved.reduce((sum, t) => sum + t.amount, 0),
      recent: txs.slice(0, 6),
    };
  }, [txs]);
}

function MerchantInfoCard() {
  const cfg = useConfigStore();
  const env = selectActiveEnvironment(cfg);
  const rows: [string, React.ReactNode][] = [
    ['Merchant Name', cfg.merchant.merchantName],
    ['Merchant ID', <span className="mono">{cfg.merchant.merchantId}</span>],
    ['Terminal ID', <span className="mono">{cfg.merchant.terminalId}</span>],
    ['Merchant Category Code', <span className="mono">{cfg.merchant.merchantCategoryCode}</span>],
    ['Merchant Status', <Badge tone={cfg.merchant.status === 'ACTIVE' ? 'green' : 'red'}>{cfg.merchant.status}</Badge>],
    ['Current Environment', <span>{env.name} {!cfg.app.apiIntegrationEnabled && <span className="text-xs text-slate-400">(not used)</span>}</span>],
    ['Execution Mode', <Badge tone={effectiveExecutionMode(cfg) === 'MOCK' ? 'amber' : 'green'}>{effectiveExecutionMode(cfg)}</Badge>],
    ['Validation Mode', <Badge tone={effectiveValidationMode(cfg) === 'LOCAL' ? 'slate' : 'blue'}>{effectiveValidationMode(cfg)}</Badge>],
  ];
  return (
    <Card>
      <CardHeader icon={<IconStore className="h-5 w-5" />} title="Merchant Information" actions={<Link to="/settings/merchant" className="text-xs font-medium text-blue-600 hover:underline">Edit</Link>} />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 sm:grid-cols-4">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
            <dd className="mt-0.5 text-sm font-medium text-navy-900">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function DashboardPage() {
  const stats = useTransactionStats();
  const currency = useConfigStore((s) => s.merchant.currency);
  return (
    <div className="space-y-5">
      <PageHeader title="Merchant Dashboard" description="Consumer Presented Mode (CPM) merchant simulator — scan the customer's QR, validate, and simulate the payment." />
      <MerchantInfoCard />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Transactions" value={stats.total} icon={<IconActivity className="h-5 w-5" />} tone="navy" />
        <StatCard label="Successful" value={stats.success} icon={<IconCheck className="h-5 w-5" />} tone="green" />
        <StatCard label="Failed" value={stats.failed} icon={<IconX className="h-5 w-5" />} tone="red" hint="Declined, timeout, errors" />
        <StatCard label="Rejected" value={stats.rejected} icon={<IconBan className="h-5 w-5" />} tone="amber" hint="By merchant" />
        <StatCard label="Total Amount" value={formatAmount(stats.amount, currency)} icon={<IconWallet className="h-5 w-5" />} tone="blue" hint="Approved only" />
      </div>
      <ScannerWorkstation />
      <Card>
        <CardHeader icon={<IconList className="h-5 w-5" />} title="Recent Transactions" actions={<Link to="/transactions" className="text-xs font-medium text-blue-600 hover:underline">View all</Link>} />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>Transaction ID</th><th>Time</th><th>Amount</th><th>Status</th><th>Mode</th><th>Response</th></tr>
            </thead>
            <tbody>
              {stats.recent.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-400">No transactions yet</td></tr>
              )}
              {stats.recent.map((t) => (
                <tr key={t.transactionId} className="hover:bg-slate-50">
                  <td className="mono"><Link className="text-blue-700 hover:underline" to={`/transactions/${t.transactionId}`}>{t.transactionId}</Link></td>
                  <td className="whitespace-nowrap text-xs">{formatDateTime(t.timestamp)}</td>
                  <td className="whitespace-nowrap font-medium">{formatAmount(t.amount, t.currency)}</td>
                  <td><TxStatusBadge status={t.status} /></td>
                  <td className="text-xs">{t.validationMode} / {t.executionMode}</td>
                  <td className="text-xs text-slate-600">{t.responseCode && `[${t.responseCode}] `}{t.responseMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
