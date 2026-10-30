import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TxStatusBadge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { IconDownload, IconTrash } from '@/components/ui/Icons';
import { toast } from '@/components/ui/Toast';
import { useTransactionStore } from '@/store/transactionStore';
import { formatAmount, formatDateTime } from '@/core/util/format';
import { downloadText, toCsv } from '@/core/util/csv';
import type { TransactionStatus } from '@/core/types';

const STATUSES: TransactionStatus[] = ['APPROVED', 'DECLINED', 'REJECTED', 'TIMEOUT', 'SYSTEM_ERROR', 'CONNECTION_ERROR', 'MAPPING_ERROR', 'PROCESSING'];

export function TransactionHistoryPage() {
  const { transactions, clear } = useTransactionStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [env, setEnv] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [confirm, setConfirm] = useState(false);

  const envs = useMemo(() => Array.from(new Set(transactions.map((t) => t.environment))), [transactions]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fromT = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toT = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    return transactions.filter((t) => {
      const ts = new Date(t.timestamp).getTime();
      if (status && t.status !== status) return false;
      if (env && t.environment !== env) return false;
      if (ts < fromT || ts > toT) return false;
      if (!needle) return true;
      return [t.transactionId, t.merchantId, t.terminalId, t.referenceNumber, t.responseCode, t.responseMessage, t.panMasked, t.applicationIdentifier, String(t.amount)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [transactions, q, status, env, from, to]);

  const exportCsv = () => {
    const csv = toCsv(filtered as unknown as Record<string, unknown>[], [
      { key: 'transactionId', header: 'Transaction ID' },
      { key: 'timestamp', header: 'Timestamp' },
      { key: 'merchantId', header: 'Merchant ID' },
      { key: 'terminalId', header: 'Terminal ID' },
      { key: 'amount', header: 'Amount' },
      { key: 'currency', header: 'Currency' },
      { key: 'status', header: 'Status' },
      { key: 'responseCode', header: 'Response Code' },
      { key: 'responseMessage', header: 'Response Message' },
      { key: 'referenceNumber', header: 'Reference Number' },
      { key: 'validationMode', header: 'Validation Mode' },
      { key: 'executionMode', header: 'Execution Mode' },
      { key: 'environment', header: 'Environment' },
      { key: 'applicationIdentifier', header: 'AID' },
      { key: 'panMasked', header: 'Account (masked)' },
      { key: 'qrPayload', header: 'QR Payload' },
      { key: 'backendResponse', header: 'Backend Response' },
    ]);
    downloadText(`cpm-transactions-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.csv`, csv, 'text/csv');
    toast.success(`Exported ${filtered.length} transaction(s)`);
  };

  return (
    <div>
      <PageHeader
        title="Transaction History"
        description="Stored locally in this browser (localStorage)."
        actions={
          <>
            <Button variant="outline" icon={<IconDownload />} onClick={exportCsv} disabled={!filtered.length}>Export CSV</Button>
            <Button variant="danger" icon={<IconTrash />} onClick={() => setConfirm(true)} disabled={!transactions.length}>Clear History</Button>
          </>
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-5">
          <Input placeholder="Search ID, merchant, RC, reference…" value={q} onChange={(e) => setQ(e.target.value)} className="md:col-span-2" aria-label="Search transactions" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={env} onChange={(e) => setEnv(e.target.value)} aria-label="Filter environment">
            <option value="">All environments</option>
            {envs.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
          <div className="flex gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Transaction ID</th><th>Timestamp</th><th>Merchant / Terminal</th><th className="text-right">Amount</th><th>Status</th><th>Validation</th><th>Execution</th><th>Environment</th><th>Response</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-slate-400">No transactions match the filters</td></tr>}
              {filtered.map((t) => (
                <tr key={t.transactionId} className="hover:bg-slate-50">
                  <td className="mono"><Link className="text-blue-700 hover:underline" to={`/transactions/${t.transactionId}`}>{t.transactionId}</Link></td>
                  <td className="whitespace-nowrap text-xs">{formatDateTime(t.timestamp)}</td>
                  <td className="mono text-xs">{t.merchantId}<br /><span className="text-slate-400">{t.terminalId}</span></td>
                  <td className="whitespace-nowrap text-right font-medium">{formatAmount(t.amount, t.currency)}</td>
                  <td><TxStatusBadge status={t.status} /></td>
                  <td className="text-xs">{t.validationMode}</td>
                  <td className="text-xs">{t.executionMode}</td>
                  <td className="text-xs">{t.environment}</td>
                  <td className="max-w-xs truncate text-xs text-slate-600" title={t.responseMessage}>{t.responseCode && `[${t.responseCode}] `}{t.responseMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-slate-400">{filtered.length} of {transactions.length} transaction(s)</p>
      </Card>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Clear transaction history?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { clear(); setConfirm(false); toast.success('Transaction history cleared'); }}>Clear {transactions.length} transaction(s)</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This permanently removes all locally stored transactions. Duplicate detection history is cleared as well. Export to CSV first if you need a copy.</p>
      </Modal>
    </div>
  );
}
