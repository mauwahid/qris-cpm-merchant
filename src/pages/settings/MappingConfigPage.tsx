import { useMemo, useState } from 'react';
import { Alert, Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, TxStatusBadge } from '@/components/ui/Badge';
import { Field, Input, KeyValueEditor, NumberInput, Select, TagListEditor, Textarea } from '@/components/ui/Form';
import { JsonViewer } from '@/components/ui/JsonViewer';
import { toast } from '@/components/ui/Toast';
import { useConfigStore } from '@/store/configStore';
import { useDraft } from '@/hooks';
import type { EndpointConfig, HttpMethod, ResponseMapping } from '@/core/config/types';
import type { TransactionStatus } from '@/core/types';
import { SUPPORTED_PLACEHOLDERS, renderTemplate } from '@/core/api/template';
import { isValidPath } from '@/core/api/jsonPath';
import { mapApiResponse } from '@/core/api/ResponseMapper';
import { defaultMapping } from '@/core/config/defaults';

const INTERNAL: TransactionStatus[] = ['APPROVED', 'DECLINED', 'TIMEOUT', 'SYSTEM_ERROR', 'CONNECTION_ERROR', 'MAPPING_ERROR'];
const SAMPLE_VARS = {
  transactionId: 'TRX20260101120000ABCDEF', merchantId: '123456789012345', merchantName: 'DEMO MERCHANT', terminalId: 'TERM001',
  amount: 50000, amountMinor: 5000000, currency: 'IDR', currencyNumeric: '360', qrPayload: 'hQVDUFYwMWFa…', timestamp: new Date().toISOString(),
  applicationIdentifier: 'A0000006022020', environment: 'SIT', apiVersion: 'v1',
};
const SAMPLE_RESPONSE = `{
  "responseCode": "00",
  "responseMessage": "Approved",
  "data": { "transactionStatus": "SUCCESS", "referenceNumber": "000123456789" }
}`;

function PathInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} error={value && !isValidPath(value) ? 'Invalid JSONPath (use $.a.b[0])' : undefined}>
      <Input className="mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder="$.path.to.field" />
    </Field>
  );
}

function MappingEditor({ endpoint }: { endpoint: EndpointConfig }) {
  const upsert = useConfigStore((s) => s.upsertEndpoint);
  const { draft, setDraft, patch, dirty, reset } = useDraft(endpoint);
  const m = draft.mapping;
  const patchMap = (p: Partial<ResponseMapping>) => setDraft((d) => ({ ...d, mapping: { ...d.mapping, ...p } }));
  const [sample, setSample] = useState(SAMPLE_RESPONSE);
  const [sampleStatus, setSampleStatus] = useState(200);

  const rendered = useMemo(() => renderTemplate(draft.bodyTemplate, SAMPLE_VARS, 'json'), [draft.bodyTemplate]);
  const bodyJsonError = useMemo(() => {
    if (!draft.bodyTemplate.trim()) return undefined;
    try {
      JSON.parse(rendered.output);
      return undefined;
    } catch (e) {
      return `Rendered body is not valid JSON: ${(e as Error).message}`;
    }
  }, [rendered.output, draft.bodyTemplate]);

  const testResult = useMemo(() => {
    let json: unknown;
    let jsonError: string | undefined;
    try {
      json = JSON.parse(sample);
    } catch (e) {
      jsonError = (e as Error).message;
    }
    return mapApiResponse(m, {
      ok: sampleStatus < 300,
      request: { method: 'POST', url: '', headers: {}, timeoutMs: 0 },
      displayUrl: '',
      response: { status: sampleStatus, statusText: '', headers: {}, bodyText: sample },
      json,
      jsonError: jsonError ? `Response body is not valid JSON: ${jsonError}` : undefined,
      durationMs: 0,
      templateWarnings: [],
    });
  }, [m, sample, sampleStatus]);

  const statusEntries = Object.entries(m.statusMapping);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Request" subtitle={`${draft.method} ${draft.path}`} />
        <div className="grid gap-5 p-5 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="HTTP Method"><Select value={draft.method} onChange={(e) => patch({ method: e.target.value as HttpMethod })}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Endpoint Path" className="col-span-2"><Input className="mono" value={draft.path} onChange={(e) => patch({ path: e.target.value })} /></Field>
            </div>
            <Field label="Timeout (ms)" hint="0 = environment default"><NumberInput min={0} value={draft.timeoutMs ?? 0} onChange={(n) => patch({ timeoutMs: n || undefined })} /></Field>
            <Field label="Request Headers"><KeyValueEditor items={draft.headers} onChange={(headers) => patch({ headers })} /></Field>
            <Field label="Request Body Template" error={bodyJsonError}>
              <Textarea rows={11} value={draft.bodyTemplate} onChange={(e) => patch({ bodyTemplate: e.target.value })} disabled={draft.method === 'GET'} />
            </Field>
            <div className="flex flex-wrap gap-1">
              {SUPPORTED_PLACEHOLDERS.map((p) => (
                <button key={p} type="button" className="mono rounded bg-slate-100 px-1.5 py-0.5 text-blue-700 hover:bg-blue-100" onClick={() => patch({ bodyTemplate: `${draft.bodyTemplate}{{${p}}}` })} title="Append placeholder">{`{{${p}}}`}</button>
              ))}
            </div>
          </div>
          <div>
            <JsonViewer title="Rendered preview (sample values)" value={rendered.output} maxHeight={520} />
            {rendered.missing.length > 0 && <p className="mt-2 text-xs text-amber-700">Unknown placeholders: {rendered.missing.join(', ')}</p>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Response Mapping" subtitle="JSONPath → internal fields" actions={<Button size="sm" variant="ghost" onClick={() => patchMap(defaultMapping())}>Default mapping</Button>} />
        <div className="grid gap-5 p-5 xl:grid-cols-2">
          <div className="space-y-4">
            <p className="label">Success mapping</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <PathInput label="Response Code" value={m.responseCodePath} onChange={(responseCodePath) => patchMap({ responseCodePath })} />
              <PathInput label="Response Message" value={m.responseMessagePath} onChange={(responseMessagePath) => patchMap({ responseMessagePath })} />
              <PathInput label="Transaction Status" value={m.transactionStatusPath} onChange={(transactionStatusPath) => patchMap({ transactionStatusPath })} />
              <PathInput label="Reference Number" value={m.referenceNumberPath} onChange={(referenceNumberPath) => patchMap({ referenceNumberPath })} />
            </div>
            <Field label="Success Response Codes"><TagListEditor values={m.successCodes} onChange={(successCodes) => patchMap({ successCodes })} placeholder="e.g. 00" /></Field>
            <p className="label pt-2">Error mapping</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <PathInput label="Error Code" value={m.errorCodePath} onChange={(errorCodePath) => patchMap({ errorCodePath })} />
              <PathInput label="Error Message" value={m.errorMessagePath} onChange={(errorMessagePath) => patchMap({ errorMessagePath })} />
            </div>
            <PathInput label="Validation Checks Array (validation endpoint)" value={m.validationChecksPath} onChange={(validationChecksPath) => patchMap({ validationChecksPath })} />
          </div>
          <div className="space-y-4">
            <Field label="Transaction Status Mapping" hint="Backend status value → internal status">
              <div className="space-y-2">
                {statusEntries.map(([k, val], i) => (
                  <div key={i} className="flex gap-2">
                    <Input className="mono" value={k} onChange={(e) => {
                      const next = [...statusEntries];
                      next[i] = [e.target.value, val];
                      patchMap({ statusMapping: Object.fromEntries(next) });
                    }} />
                    <Select value={val} onChange={(e) => patchMap({ statusMapping: { ...m.statusMapping, [k]: e.target.value as TransactionStatus } })}>{INTERNAL.map((s) => <option key={s}>{s}</option>)}</Select>
                    <Button variant="ghost" size="sm" onClick={() => patchMap({ statusMapping: Object.fromEntries(statusEntries.filter((_, j) => j !== i)) })}>✕</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => patchMap({ statusMapping: { ...m.statusMapping, [`STATUS_${statusEntries.length + 1}`]: 'DECLINED' } })}>Add status</Button>
              </div>
            </Field>
            <Field label="Error Code Mapping" hint="Response/error code → message shown to the merchant">
              <KeyValueEditor
                keyPlaceholder="Code"
                valuePlaceholder="Message"
                items={Object.entries(m.errorCodeMapping).map(([key, value]) => ({ key, value, enabled: true }))}
                onChange={(items) => patchMap({ errorCodeMapping: Object.fromEntries(items.filter((i) => i.enabled).map((i) => [i.key, i.value])) })}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Test Mapping" subtitle="Paste a backend response to preview the internal result" />
        <div className="grid gap-5 p-5 xl:grid-cols-2">
          <div className="space-y-3">
            <Field label="HTTP status"><NumberInput value={sampleStatus} onChange={setSampleStatus} /></Field>
            <Field label="Response body"><Textarea rows={10} value={sample} onChange={(e) => setSample(e.target.value)} /></Field>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2"><span className="text-sm text-slate-600">Mapped status:</span><TxStatusBadge status={testResult.status} />{testResult.success && <Badge tone="green">SUCCESS</Badge>}</div>
            {testResult.mappingErrors.length > 0 && <Alert tone="warning" title="Mapping issues">{testResult.mappingErrors.join('; ')}</Alert>}
            <JsonViewer value={{ ...testResult, raw: undefined }} />
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 flex justify-end gap-2 rounded-xl border border-slate-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
        {dirty && <span className="mr-auto self-center text-xs text-amber-700">Unsaved changes</span>}
        <Button variant="outline" disabled={!dirty} onClick={reset}>Discard</Button>
        <Button disabled={!dirty} onClick={() => { upsert(draft); toast.success(`Mapping for ${draft.name} saved`); }}>Save Mapping</Button>
      </div>
    </div>
  );
}

export function MappingConfigPage() {
  const endpoints = useConfigStore((s) => s.endpoints);
  const [id, setId] = useState(endpoints.find((e) => e.role === 'PAYMENT')?.id ?? endpoints[0]?.id);
  const ep = endpoints.find((e) => e.id === id);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Request/Response Mapping"
        description="API adapter layer: the Transaction Engine only sees internal results, so any backend format can be integrated by editing templates and JSONPath mappings."
        actions={<Select className="w-72" value={id} onChange={(e) => setId(e.target.value)} aria-label="Endpoint">{endpoints.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}</Select>}
      />
      {ep ? <MappingEditor key={ep.id} endpoint={ep} /> : <Alert tone="warning">No endpoints configured.</Alert>}
    </div>
  );
}
