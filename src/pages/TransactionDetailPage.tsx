import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/Card';
import { TxStatusBadge, HttpStatusBadge, Badge } from '@/components/ui/Badge';
import { JsonViewer } from '@/components/ui/JsonViewer';
import { CopyButton } from '@/components/ui/CopyButton';
import { Select } from '@/components/ui/Form';
import { IconReceipt } from '@/components/ui/Icons';
import { useTransactionStore } from '@/store/transactionStore';
import { useLogStore } from '@/store/logStore';
import { formatAmount, formatDateTime, na } from '@/core/util/format';

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-xs font-medium text-slate-500">{k}</dt>
      <dd className="col-span-2 break-all text-sm text-navy-900">{v}</dd>
    </div>
  );
}

export function TransactionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const transactions = useTransactionStore((s) => s.transactions);
  const apiLogs = useLogStore((s) => s.apiLogs);
  const appLogs = useLogStore((s) => s.appLogs);
  const tx = id ? transactions.find((t) => t.transactionId === id) : transactions[0];

  const picker = (
    <Select className="w-80" value={tx?.transactionId ?? ''} onChange={(e) => navigate(`/transactions/${e.target.value}`)} aria-label="Select transaction">
      {!tx && <option value="">Select a transaction</option>}
      {transactions.slice(0, 200).map((t) => (
        <option key={t.transactionId} value={t.transactionId}>{t.transactionId} · {t.status}</option>
      ))}
    </Select>
  );

  if (!tx) {
    return (
      <div>
        <PageHeader title="Transaction Details" actions={transactions.length ? picker : undefined} />
        <Card><EmptyState icon={<IconReceipt className="h-10 w-10" />} title={id ? `Transaction ${id} not found` : 'No transactions yet'} description="Accept or reject a payment from the QR Scanner to create one." /></Card>
      </div>
    );
  }
  const logs = apiLogs.filter((l) => l.transactionId === tx.transactionId || tx.apiLogIds?.includes(l.id));
  const events = appLogs.filter((l) => l.correlationId === tx.transactionId).reverse();

  return (
    <div className="space-y-5">
      <PageHeader title="Transaction Details" description={<span className="mono">{tx.transactionId}</span>} actions={picker} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Summary" actions={<TxStatusBadge status={tx.status} />} />
          <dl className="px-5 py-2">
            <Row k="Transaction ID" v={<span className="mono">{tx.transactionId}</span>} />
            <Row k="Timestamp" v={formatDateTime(tx.timestamp)} />
            <Row k="Completed" v={formatDateTime(tx.completedAt)} />
            <Row k="Duration" v={tx.durationMs !== undefined ? `${tx.durationMs} ms` : 'N/A'} />
            <Row k="Amount" v={<b>{formatAmount(tx.amount, tx.currency)}</b>} />
            <Row k="Currency" v={tx.currency} />
            <Row k="Merchant" v={`${tx.merchantName} (${tx.merchantId})`} />
            <Row k="Terminal ID" v={tx.terminalId} />
            <Row k="Response" v={tx.responseCode ? <><Badge>RC {tx.responseCode}</Badge> {tx.responseMessage}</> : 'N/A'} />
            <Row k="Reference Number" v={<span className="mono">{na(tx.referenceNumber)}</span>} />
            {tx.rejectReason && <Row k="Reject Reason" v={tx.rejectReason} />}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Processing Context" />
          <dl className="px-5 py-2">
            <Row k="Validation Mode" v={tx.validationMode} />
            <Row k="Validation Status" v={na(tx.validationStatus)} />
            <Row k="Execution Mode" v={tx.executionMode} />
            <Row k="Environment" v={tx.environment} />
            <Row k="Application ID" v={<span className="mono">{na(tx.applicationIdentifier)}</span>} />
            <Row k="Account" v={<span className="mono">{na(tx.panMasked)}</span>} />
            <Row k="Transaction Reference" v={na(tx.transactionReference)} />
            <Row k="Payload Hash" v={<span className="mono">{tx.payloadHash}</span>} />
            {tx.scenario && <Row k="Scenario" v={tx.scenario} />}
          </dl>
        </Card>
      </div>
      <Card>
        <CardHeader title="QR Payload" actions={<CopyButton text={tx.qrPayload} />} />
        <div className="p-5"><JsonViewer value={tx.qrPayload} copy={false} maxHeight={160} /></div>
      </Card>
      <Card>
        <CardHeader title="Backend Response" subtitle={tx.executionMode === 'MOCK' ? 'Mock mode — no backend call was made' : undefined} />
        <div className="p-5"><JsonViewer value={tx.backendResponse ?? (tx.executionMode === 'MOCK' ? { mock: true, status: tx.status, responseCode: tx.responseCode, responseMessage: tx.responseMessage } : undefined)} /></div>
      </Card>
      <Card>
        <CardHeader title="API Calls" subtitle={`${logs.length} call(s) linked to this transaction`} />
        <div className="space-y-4 p-5">
          {logs.length === 0 && <p className="text-sm text-slate-400">No API calls recorded.</p>}
          {logs.map((l) => (
            <div key={l.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="navy">{l.method}</Badge>
                <span className="mono break-all">{l.url}</span>
                <HttpStatusBadge status={l.status} error={!l.success} />
                <span className="text-xs text-slate-400">{l.durationMs} ms</span>
                <Link to={`/api-logs?id=${l.id}`} className="ml-auto text-xs text-blue-600 hover:underline">Open in API Logs</Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <JsonViewer title="Request" value={l.requestBody ?? ''} maxHeight={220} />
                <JsonViewer title="Response" value={l.responseBody ?? l.errorMessage ?? ''} maxHeight={220} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Processing Log" />
        <div className="p-5">
          {events.length === 0 ? <p className="text-sm text-slate-400">No events.</p> : (
            <ol className="space-y-1.5 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3"><span className="mono shrink-0 text-slate-400">{new Date(e.timestamp).toLocaleTimeString()}</span><Badge tone={e.level === 'ERROR' ? 'red' : e.level === 'WARN' ? 'amber' : 'slate'}>{e.level}</Badge><span>{e.message}</span></li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}
