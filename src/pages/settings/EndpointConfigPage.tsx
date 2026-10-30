import { useState } from 'react';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, KeyValueEditor, NumberInput, Select } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { IconPlus } from '@/components/ui/Icons';
import { toast } from '@/components/ui/Toast';
import { useConfigStore, selectActiveEnvironment } from '@/store/configStore';
import type { EndpointConfig, HttpMethod } from '@/core/config/types';
import { joinUrl } from '@/core/api/urlValidation';
import { useDraft } from '@/hooks';

const ROLES: EndpointConfig['role'][] = ['VALIDATION', 'PAYMENT', 'INQUIRY', 'STATUS', 'REVERSAL', 'HEALTH', 'CUSTOM'];
const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function EndpointEditor({ ep, onClose }: { ep: EndpointConfig; onClose: () => void }) {
  const upsert = useConfigStore((s) => s.upsertEndpoint);
  const { draft, patch, dirty } = useDraft(ep);
  const pathError = !draft.path.startsWith('/') ? 'Path must start with /' : undefined;
  return (
    <Modal open onClose={onClose} title={`Edit endpoint — ${ep.name}`} wide footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!dirty || !!pathError || !draft.name.trim()} onClick={() => { upsert(draft); toast.success('Endpoint saved'); onClose(); }}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="API Name" className="md:col-span-2"><Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
          <Field label="Role" hint="Used by the engine to find the endpoint"><Select value={draft.role} onChange={(e) => patch({ role: e.target.value as EndpointConfig['role'] })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Method"><Select value={draft.method} onChange={(e) => patch({ method: e.target.value as HttpMethod })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="Path" error={pathError} hint="Supports {transactionId} / {{placeholder}}" className="md:col-span-3"><Input className="mono" value={draft.path} onChange={(e) => patch({ path: e.target.value.trim() })} /></Field>
          <Field label="Timeout (ms)" hint="0 = environment default"><NumberInput min={0} value={draft.timeoutMs ?? 0} onChange={(n) => patch({ timeoutMs: n || undefined })} /></Field>
        </div>
        <Field label="Request Headers" hint="Merged over environment headers. Values support {{placeholders}}.">
          <KeyValueEditor items={draft.headers} onChange={(headers) => patch({ headers })} />
        </Field>
        <p className="text-xs text-slate-500">Body template and response mapping are edited in <b>Request/Response Mapping</b>.</p>
      </div>
    </Modal>
  );
}

export function EndpointConfigPage() {
  const cfg = useConfigStore();
  const env = selectActiveEnvironment(cfg);
  const [editing, setEditing] = useState<EndpointConfig | null>(null);
  const roleCounts = cfg.endpoints.reduce<Record<string, number>>((m, e) => ((m[e.role] = (m[e.role] ?? 0) + 1), m), {});
  return (
    <div className="space-y-5">
      <PageHeader
        title="Endpoint Configuration"
        description="Endpoint registry — no endpoint is hard-coded. The engine resolves endpoints by role (first match)."
        actions={
          <>
            <Button variant="outline" onClick={() => { cfg.resetEndpoints(); toast.info('Endpoints reset to defaults'); }}>Reset to Default</Button>
            <Button icon={<IconPlus />} onClick={() => { const id = cfg.addEndpoint(); setEditing(useConfigStore.getState().endpoints.find((e) => e.id === id) ?? null); }}>Add Custom Endpoint</Button>
          </>
        }
      />
      <Card>
        <CardHeader title="Endpoints" subtitle={`Resolved against active environment: ${env.name} (${env.baseUrl})`} />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>API Name</th><th>Role</th><th>Method</th><th>Path</th><th>Resolved URL</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {cfg.endpoints.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium text-navy-900">{e.name} {!e.builtIn && <Badge tone="purple">CUSTOM</Badge>}</td>
                  <td><Badge>{e.role}</Badge> {roleCounts[e.role] > 1 && e.role !== 'CUSTOM' && <Badge tone="amber">DUPLICATE ROLE</Badge>}</td>
                  <td><Badge tone="navy">{e.method}</Badge></td>
                  <td className="mono">{e.path}</td>
                  <td className="mono text-xs text-slate-500">{joinUrl(env.baseUrl, e.path.replace(/\{\{\s*apiVersion\s*\}\}/g, env.apiVersion))}</td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { cfg.deleteEndpoint(e.id); toast.success(`${e.name} removed`); }}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && <EndpointEditor ep={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
