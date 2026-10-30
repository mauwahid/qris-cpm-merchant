import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, HttpStatusBadge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { JsonViewer } from '@/components/ui/JsonViewer';
import { IconDownload, IconTrash } from '@/components/ui/Icons';
import { useLogStore } from '@/store/logStore';
import { formatDateTime } from '@/core/util/format';
import { downloadText } from '@/core/util/csv';
import type { ApiLogEntry } from '@/core/types';

export function ApiLogsPage() {
  const { apiLogs, clearApiLogs } = useLogStore();
  const [params, setParams] = useSearchParams();
  const [env, setEnv] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [status, setStatus] = useState('');
  const [outcome, setOutcome] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const selectedId = params.get('id');
  const selected = apiLogs.find((l) => l.id === selectedId);

  const envs = useMemo(() => Array.from(new Set(apiLogs.map((l) => l.environment))), [apiLogs]);
  const endpoints = useMemo(() => Array.from(new Set(apiLogs.map((l) => l.endpointName ?? 'Manual request'))), [apiLogs]);
  const filtered = useMemo(() => {
    const fromT = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toT = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    return apiLogs.filter((l) => {
      const t = new Date(l.timestamp).getTime();
      if (env && l.environment !== env) return false;
      if (endpoint && (l.endpointName ?? 'Manual request') !== endpoint) return false;
      if (outcome === 'success' && !l.success) return false;
      if (outcome === 'failure' && l.success) return false;
      if (status === 'none' && l.status !== undefined) return false;
      if (status && status !== 'none' && String(l.status ?? '').charAt(0) !== status) return false;
      return t >= fromT && t <= toT;
    });
  }, [apiLogs, env, endpoint, status, outcome, from, to]);

  const open = (l: ApiLogEntry) => setParams({ id: l.id });

  return (
    <div>
      <PageHeader
        title="API Logs"
        description="Every backend call (real and simulated). Sensitive headers and body fields are masked when masking is enabled in Application Settings."
        actions={
          <>
            <Button variant="outline" icon={<IconDownload />} disabled={!filtered.length} onClick={() => downloadText('cpm-api-logs.json', JSON.stringify(filtered, null, 2), 'application/json')}>Export JSON</Button>
            <Button variant="danger" icon={<IconTrash />} disabled={!apiLogs.length} onClick={clearApiLogs}>Clear Logs</Button>
          </>
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-6">
          <Select value={env} onChange={(e) => setEnv(e.target.value)} aria-label="Environment filter"><option value="">All environments</option>{envs.map((e) => <option key={e}>{e}</option>)}</Select>
          <Select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} aria-label="Endpoint filter"><option value="">All endpoints</option>{endpoints.map((e) => <option key={e}>{e}</option>)}</Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="HTTP status filter">
            <option value="">All HTTP status</option><option value="2">2xx</option><option value="3">3xx</option><option value="4">4xx</option><option value="5">5xx</option><option value="none">No response</option>
          </Select>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Outcome filter"><option value="">Success &amp; failure</option><option value="success">Success</option><option value="failure">Failure</option></Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Timestamp</th><th>Environment</th><th>Endpoint</th><th>Method</th><th>URL</th><th>Status</th><th className="text-right">Duration</th><th>Result</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-400">No API calls logged</td></tr>}
              {filtered.map((l) => (
                <tr key={l.id} className="cursor-pointer hover:bg-slate-50" onClick={() => open(l)}>
                  <td className="whitespace-nowrap text-xs">{formatDateTime(l.timestamp)}</td>
                  <td className="text-xs">{l.environment} {l.simulated && <Badge tone="purple">SIM</Badge>}</td>
                  <td className="text-xs">{l.endpointName ?? 'Manual request'}</td>
                  <td><Badge tone="navy">{l.method}</Badge></td>
                  <td className="mono max-w-xs truncate" title={l.url}>{l.url}</td>
                  <td><HttpStatusBadge status={l.status} error={!l.success} /></td>
                  <td className="text-right text-xs">{l.durationMs} ms</td>
                  <td>{l.success ? <Badge tone="green">SUCCESS</Badge> : <Badge tone="red" className="max-w-[16rem] truncate">{l.errorMessage ?? 'FAILURE'}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-slate-400">{filtered.length} of {apiLogs.length} call(s)</p>
      </Card>

      <Modal open={!!selected} onClose={() => setParams({})} title="API Call Detail" wide>
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="navy">{selected.method}</Badge>
              <span className="mono break-all">{selected.url}</span>
              <HttpStatusBadge status={selected.status} error={!selected.success} />
              <Badge>{selected.durationMs} ms</Badge>
              {selected.transactionId && <Badge tone="blue">TX {selected.transactionId}</Badge>}
            </div>
            {selected.errorMessage && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{selected.errorMessage}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              <JsonViewer title="Request headers (masked)" value={selected.requestHeaders} maxHeight={240} />
              <JsonViewer title="Response headers" value={selected.responseHeaders ?? {}} maxHeight={240} />
              <JsonViewer title="Request body" value={selected.requestBody ?? ''} />
              <JsonViewer title="Response body" value={selected.responseBody ?? ''} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
