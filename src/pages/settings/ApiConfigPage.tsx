import { useRef, useState } from 'react';
import { Alert, Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, HttpStatusBadge } from '@/components/ui/Badge';
import { Field, Input, KeyValueEditor, NumberInput, Select, Toggle } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { IconDownload, IconPlus, IconUpload } from '@/components/ui/Icons';
import { toast } from '@/components/ui/Toast';
import { useConfigStore } from '@/store/configStore';
import { apiLogSink } from '@/store/logStore';
import { DynamicApiClient } from '@/core/api/DynamicApiClient';
import { validateBaseUrl } from '@/core/api/urlValidation';
import type { ApiEnvironment, AuthType } from '@/core/config/types';
import { downloadText } from '@/core/util/csv';
import { useDraft } from '@/hooks';

export function CredentialWarning() {
  return (
    <Alert tone="warning" title="Development & integration testing only">
      Credentials entered here are stored in this browser's localStorage in plain text. Never store production secrets in a browser. For production, keep credentials in a backend or a secure secret manager.
    </Alert>
  );
}

function EnvironmentEditor({ env, onClose }: { env: ApiEnvironment; onClose: () => void }) {
  const upsert = useConfigStore((s) => s.upsertEnvironment);
  const { draft, patch, dirty } = useDraft(env);
  const url = validateBaseUrl(draft.baseUrl);
  const isDev = import.meta.env.DEV;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit environment — ${env.name}`}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!dirty || !url.valid || !draft.name.trim()} onClick={() => { upsert(draft); toast.success('Environment saved'); onClose(); }}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Environment Name"><Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
          <Field label="Base URL" error={url.error} hint={url.warnings.join(' ')} className="md:col-span-2"><Input className="mono" value={draft.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value.trim() })} placeholder="https://sit-api.example.com" /></Field>
          <Field label="API Version" hint="Available as {{apiVersion}} in endpoint paths"><Input className="mono" value={draft.apiVersion} onChange={(e) => patch({ apiVersion: e.target.value })} /></Field>
          <Field label="Request Timeout (ms)"><NumberInput min={500} value={draft.timeoutMs} onChange={(n) => patch({ timeoutMs: Math.max(500, n) })} /></Field>
          <Field label="Authentication Type">
            <Select value={draft.authType} onChange={(e) => patch({ authType: e.target.value as AuthType })}>
              <option value="NONE">No Authentication</option>
              <option value="BEARER">Bearer Token</option>
              <option value="BASIC">Basic Authentication</option>
              <option value="API_KEY">API Key</option>
              <option value="CUSTOM_HEADER">Custom Header</option>
            </Select>
          </Field>
        </div>
        {draft.authType !== 'NONE' && (
          <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            {draft.authType === 'BEARER' && <Field label="Bearer Token" className="md:col-span-2"><Input type="password" autoComplete="off" className="mono" value={draft.bearerToken} onChange={(e) => patch({ bearerToken: e.target.value })} /></Field>}
            {draft.authType === 'BASIC' && (
              <>
                <Field label="Username"><Input autoComplete="off" value={draft.basicUsername} onChange={(e) => patch({ basicUsername: e.target.value })} /></Field>
                <Field label="Password"><Input type="password" autoComplete="new-password" value={draft.basicPassword} onChange={(e) => patch({ basicPassword: e.target.value })} /></Field>
              </>
            )}
            {draft.authType === 'API_KEY' && (
              <>
                <Field label="API Key Header Name"><Input className="mono" value={draft.apiKeyHeaderName} onChange={(e) => patch({ apiKeyHeaderName: e.target.value })} /></Field>
                <Field label="API Key"><Input type="password" autoComplete="off" className="mono" value={draft.apiKey} onChange={(e) => patch({ apiKey: e.target.value })} /></Field>
              </>
            )}
            {draft.authType === 'CUSTOM_HEADER' && (
              <>
                <Field label="Header Name"><Input className="mono" value={draft.customAuthHeaderName} onChange={(e) => patch({ customAuthHeaderName: e.target.value })} /></Field>
                <Field label="Header Value"><Input type="password" autoComplete="off" className="mono" value={draft.customAuthHeaderValue} onChange={(e) => patch({ customAuthHeaderValue: e.target.value })} /></Field>
              </>
            )}
            <div className="md:col-span-2"><CredentialWarning /></div>
          </div>
        )}
        <Field label="Custom Headers" hint="Sent with every request in this environment">
          <KeyValueEditor items={draft.customHeaders} onChange={(customHeaders) => patch({ customHeaders })} />
        </Field>
        <Toggle
          checked={draft.useDevProxy}
          onChange={(useDevProxy) => patch({ useDevProxy })}
          label="Route through development proxy (CORS workaround)"
          description={isDev ? 'Requests go to the Vite dev server (/__devproxy) which forwards them server-side. Only works with `npm run dev`; TLS verification stays enabled.' : 'Not available in this build — the proxy only exists in the Vite dev server.'}
        />
        <p className="text-xs text-slate-400">SSL certificate verification cannot be bypassed from a browser and is intentionally not offered.</p>
      </div>
    </Modal>
  );
}

export function ApiConfigPage() {
  const cfg = useConfigStore();
  const [editing, setEditing] = useState<ApiEnvironment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiEnvironment | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; status?: number; message: string; ms: number }>>({});
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const testConnection = async (env: ApiEnvironment) => {
    setTesting(env.id);
    try {
      const client = new DynamicApiClient({ environment: env, endpoints: cfg.endpoints, app: cfg.app }, apiLogSink);
      const r = await client.callEndpoint('HEALTH', {});
      const ok = r.ok;
      setTestResult((p) => ({ ...p, [env.id]: { ok, status: r.response?.status, message: r.error?.message ?? `${r.response?.status} ${r.response?.statusText ?? ''}`, ms: r.durationMs } }));
      (ok ? toast.success : toast.error)(ok ? `${env.name}: connection OK (${r.durationMs} ms)` : `${env.name}: ${r.error?.message ?? `HTTP ${r.response?.status}`}`);
    } finally {
      setTesting(null);
    }
  };

  const onImport = async (file?: File) => {
    if (!file) return;
    const res = cfg.importConfig(await file.text());
    (res.ok ? toast.success : toast.error)(res.ok ? 'Configuration imported' : `Import failed: ${res.error}`);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="API Configuration"
        description="Backend environments. Changes apply to the next request — no rebuild needed."
        actions={
          <>
            <Button variant="outline" icon={<IconUpload />} onClick={() => fileRef.current?.click()}>Import JSON</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onImport(e.target.files?.[0])} />
            <Button variant="outline" icon={<IconDownload />} onClick={() => downloadText('cpm-simulator-config.json', cfg.exportConfig(includeSecrets), 'application/json')}>Export JSON</Button>
            <Button icon={<IconPlus />} onClick={() => { const id = cfg.addEnvironment(); setEditing(useConfigStore.getState().environments.find((e) => e.id === id) ?? null); }}>Add Configuration</Button>
          </>
        }
      />
      <Card>
        <CardHeader title="Integration" />
        <div className="grid gap-5 p-5 md:grid-cols-3">
          <Toggle checked={cfg.app.apiIntegrationEnabled} onChange={(v) => cfg.updateApp({ apiIntegrationEnabled: v })} label="Enable API Integration" description="Off = standalone local mode: no HTTP requests at all." />
          <Field label="Execution Mode">
            <Select value={cfg.app.executionMode} disabled={!cfg.app.apiIntegrationEnabled} onChange={(e) => cfg.updateApp({ executionMode: e.target.value as 'MOCK' | 'REAL_API' })}>
              <option value="MOCK">Mock Mode</option><option value="REAL_API">Real API Mode</option>
            </Select>
          </Field>
          <Toggle checked={cfg.app.fallbackToLocalValidation} onChange={(v) => cfg.updateApp({ fallbackToLocalValidation: v })} label="Fallback to local validation" description="When the backend is unavailable, validate locally instead of failing." />
        </div>
      </Card>
      <Card>
        <CardHeader title="Environments" subtitle={`${cfg.environments.length} saved`} actions={<label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={includeSecrets} onChange={(e) => setIncludeSecrets(e.target.checked)} />Include credentials in export</label>} />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Environment</th><th>Base URL</th><th>Auth</th><th>Timeout</th><th>Connection</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {cfg.environments.map((e) => {
                const t = testResult[e.id];
                return (
                  <tr key={e.id} className={e.id === cfg.activeEnvironmentId ? 'bg-blue-50/50' : ''}>
                    <td className="font-medium text-navy-900">{e.name} {e.id === cfg.activeEnvironmentId && <Badge tone="blue">ACTIVE</Badge>} {e.useDevProxy && <Badge tone="amber">PROXY</Badge>}</td>
                    <td className="mono">{e.baseUrl}</td>
                    <td><Badge>{e.authType}</Badge></td>
                    <td className="text-xs">{e.timeoutMs} ms</td>
                    <td className="text-xs">{t ? <span className="flex items-center gap-1.5"><HttpStatusBadge status={t.status} error={!t.ok} /><span className="max-w-[14rem] truncate" title={t.message}>{t.ok ? `${t.ms} ms` : t.message}</span></span> : <span className="text-slate-300">not tested</span>}</td>
                    <td className="whitespace-nowrap text-right">
                      {e.id !== cfg.activeEnvironmentId && <Button size="sm" variant="ghost" onClick={() => { cfg.setActiveEnvironment(e.id); toast.info(`${e.name} is now active`); }}>Set Active</Button>}
                      <Button size="sm" variant="ghost" loading={testing === e.id} onClick={() => void testConnection(e)}>Test Connection</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => { cfg.duplicateEnvironment(e.id); toast.success('Environment duplicated'); }}>Duplicate</Button>
                      <Button size="sm" variant="ghost" className="text-red-600" disabled={cfg.environments.length <= 1} onClick={() => setConfirmDelete(e)}>Delete</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <CredentialWarning />
      {!cfg.app.apiIntegrationEnabled && <Alert tone="info">Test Connection is blocked while API integration is disabled (standalone mode sends no HTTP requests).</Alert>}
      <Alert tone="info" title="CORS">
        The backend must allow this origin ({typeof window !== 'undefined' ? window.location.origin : ''}) via CORS headers, or enable the development proxy on the environment while running <code>npm run dev</code>.
      </Alert>

      {editing && <EnvironmentEditor env={editing} onClose={() => setEditing(null)} />}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete environment?"
        footer={<><Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => { cfg.deleteEnvironment(confirmDelete!.id); setConfirmDelete(null); toast.success('Environment deleted'); }}>Delete</Button></>}
      >
        <p className="text-sm text-slate-600">Delete <b>{confirmDelete?.name}</b> ({confirmDelete?.baseUrl})?</p>
      </Modal>
    </div>
  );
}
