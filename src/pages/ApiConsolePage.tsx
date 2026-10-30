import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, HttpStatusBadge } from '@/components/ui/Badge';
import { Field, Input, KeyValueEditor, Select, Textarea } from '@/components/ui/Form';
import { JsonViewer } from '@/components/ui/JsonViewer';
import { CopyButton } from '@/components/ui/CopyButton';
import { Tabs } from '@/components/ui/Tabs';
import { IconSend, IconRefresh } from '@/components/ui/Icons';
import { useConfigStore } from '@/store/configStore';
import { useSessionStore } from '@/store/sessionStore';
import { apiLogSink } from '@/store/logStore';
import { DynamicApiClient } from '@/core/api/DynamicApiClient';
import type { ApiCallResult } from '@/core/api/types';
import type { HttpMethod, KeyValue } from '@/core/config/types';
import { buildTemplateVars } from '@/core/transaction/templateVars';
import { generateTransactionId } from '@/core/util/id';
import { generateSamplePayload } from '@/core/cpm/sampleGenerator';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function toCurl(method: string, url: string, headers: Record<string, string>, body?: string): string {
  const parts = [`curl -X ${method} '${url}'`];
  for (const [k, v] of Object.entries(headers)) parts.push(`  -H '${k}: ${v.replace(/'/g, "'\\''")}'`);
  if (body && method !== 'GET') parts.push(`  --data-raw '${body.replace(/'/g, "'\\''")}'`);
  return parts.join(' \\\n');
}

export function ApiConsolePage() {
  const cfg = useConfigStore();
  const parsed = useSessionStore((s) => s.parsed);
  const amount = useSessionStore((s) => s.amount);
  const [envId, setEnvId] = useState(cfg.activeEnvironmentId);
  const [endpointId, setEndpointId] = useState(cfg.endpoints[0]?.id ?? '');
  const [method, setMethod] = useState<string>('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<KeyValue[]>([]);
  const [body, setBody] = useState('');
  const [result, setResult] = useState<ApiCallResult>();
  const [sending, setSending] = useState(false);
  const [resTab, setResTab] = useState<'body' | 'headers' | 'request'>('body');

  const env = cfg.environments.find((e) => e.id === envId) ?? cfg.environments[0];
  const client = useMemo(() => new DynamicApiClient({ environment: env, endpoints: cfg.endpoints, app: cfg.app }, apiLogSink), [env, cfg.endpoints, cfg.app]);

  const load = (epId = endpointId) => {
    const ep = cfg.endpoints.find((e) => e.id === epId);
    if (!ep) return;
    const vars = buildTemplateVars({
      transactionId: generateTransactionId(),
      merchant: cfg.merchant,
      amount: amount || cfg.merchant.defaultAmount,
      parsed,
      qrPayload: parsed?.raw ?? generateSamplePayload(),
      timestamp: new Date().toISOString(),
    });
    const { request } = client.buildRequest(ep, vars);
    setMethod(request.method);
    setUrl(request.url);
    setHeaders(Object.entries(request.headers).map(([key, value]) => ({ key, value, enabled: true })));
    setBody(request.body ?? '');
    setResult(undefined);
  };

  const headerRecord = () => Object.fromEntries(headers.filter((h) => h.enabled && h.key.trim()).map((h) => [h.key.trim(), h.value]));

  const send = async () => {
    setSending(true);
    try {
      const ep = cfg.endpoints.find((e) => e.id === endpointId);
      const r = await client.send({ method, url, headers: headerRecord(), body: method === 'GET' ? undefined : body, timeoutMs: ep?.timeoutMs || env.timeoutMs }, { endpoint: ep });
      setResult(r);
    } finally {
      setSending(false);
    }
  };

  const responseText = result?.response ? result.response.bodyText : result?.error?.message ?? '';

  return (
    <div className="space-y-5">
      <PageHeader title="API Testing Console" description="Compose and send requests to the configured backend. Requests use the selected environment's authentication and custom headers, and are recorded in API Logs." />
      {!cfg.app.apiIntegrationEnabled && (
        <Alert tone="warning" title="API integration is disabled">
          The simulator is in standalone mode, so no HTTP request will be sent. Turn on <b>API Integration</b> in the header to use the console.
        </Alert>
      )}
      <Card>
        <CardHeader title="Request" actions={<Button size="sm" variant="outline" icon={<IconRefresh />} onClick={() => load()}>Load from endpoint</Button>} />
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Environment">
              <Select value={envId} onChange={(e) => setEnvId(e.target.value)}>
                {cfg.environments.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.baseUrl}</option>)}
              </Select>
            </Field>
            <Field label="Endpoint">
              <Select value={endpointId} onChange={(e) => { setEndpointId(e.target.value); load(e.target.value); }}>
                {cfg.endpoints.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.method} {e.path})</option>)}
              </Select>
            </Field>
            <Field label="Auth">
              <div className="flex h-[38px] items-center gap-2 text-sm"><Badge tone="navy">{env.authType}</Badge>{env.useDevProxy && <Badge tone="amber">DEV PROXY</Badge>}<Link to="/settings/api" className="text-xs text-blue-600 hover:underline">Configure</Link></div>
            </Field>
          </div>
          <div className="flex gap-2">
            <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-32" aria-label="HTTP method">
              {METHODS.map((m) => <option key={m}>{m}</option>)}
            </Select>
            <Input className="mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (click Load from endpoint)" aria-label="URL" />
            <Button icon={<IconSend />} loading={sending} disabled={!url} onClick={() => void send()}>Send</Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Headers"><KeyValueEditor items={headers} onChange={setHeaders} secretKeys={/authorization|api-?key|token|secret/i} /></Field>
            <Field label="Request body"><Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} disabled={method === 'GET'} /></Field>
          </div>
          <div className="flex gap-2">
            <CopyButton text={toCurl(method, url, headerRecord(), body)} label="Copy Request (cURL)" />
            <CopyButton text={JSON.stringify({ method, url, headers: headerRecord(), body: body ? (() => { try { return JSON.parse(body); } catch { return body; } })() : undefined }, null, 2)} label="Copy Request (JSON)" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Response"
          actions={
            result && (
              <>
                <HttpStatusBadge status={result.response?.status} error={!!result.error} />
                {result.response && <span className="text-xs text-slate-500">{result.response.statusText}</span>}
                <Badge tone="slate">{result.durationMs} ms</Badge>
                {result.error && <Badge tone="red">{result.error.type}</Badge>}
                <CopyButton text={responseText} label="Copy Response" />
              </>
            )
          }
        />
        <div className="p-5">
          {!result ? (
            <p className="text-sm text-slate-400">Send a request to see the response.</p>
          ) : (
            <>
              {result.error && <div className="mb-3"><Alert tone="error" title={result.error.type}>{result.error.message}</Alert></div>}
              <Tabs tabs={[{ id: 'body', label: 'Body' }, { id: 'headers', label: 'Headers' }, { id: 'request', label: 'Sent Request' }]} value={resTab} onChange={setResTab} />
              <div className="mt-3">
                {resTab === 'body' && <JsonViewer value={responseText} maxHeight={480} />}
                {resTab === 'headers' && <JsonViewer value={result.response?.headers ?? {}} />}
                {resTab === 'request' && <JsonViewer value={{ ...result.request, url: result.displayUrl }} />}
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
