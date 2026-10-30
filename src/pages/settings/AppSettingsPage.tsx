import { useRef, useState } from 'react';
import { Alert, Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, NumberInput, Select, TagListEditor, Toggle } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { IconDownload, IconUpload } from '@/components/ui/Icons';
import { toast } from '@/components/ui/Toast';
import { useConfigStore } from '@/store/configStore';
import { useLogStore } from '@/store/logStore';
import { useTransactionStore } from '@/store/transactionStore';
import { useSessionStore } from '@/store/sessionStore';
import { downloadText } from '@/core/util/csv';
import { CredentialWarning } from './ApiConfigPage';

export function AppSettingsPage() {
  const cfg = useConfigStore();
  const app = cfg.app;
  const [confirm, setConfirm] = useState<'config' | 'all' | null>(null);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const secure = window.isSecureContext;

  const onImport = async (file?: File) => {
    if (!file) return;
    const r = cfg.importConfig(await file.text());
    (r.ok ? toast.success : toast.error)(r.ok ? 'Configuration imported' : `Import failed: ${r.error}`);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Application Settings" description="Global behaviour, persistence and data management. All settings persist in this browser." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Modes" />
          <div className="space-y-5 p-5">
            <Toggle checked={app.apiIntegrationEnabled} onChange={(v) => cfg.updateApp({ apiIntegrationEnabled: v })} label="API Integration" description="Disabled → standalone: local validation + mock processor, zero HTTP requests." />
            <Field label="Execution Mode">
              <Select value={app.executionMode} disabled={!app.apiIntegrationEnabled} onChange={(e) => cfg.updateApp({ executionMode: e.target.value as 'MOCK' | 'REAL_API' })}>
                <option value="MOCK">Mock Mode</option><option value="REAL_API">Real API Mode</option>
              </Select>
            </Field>
            <Toggle checked={app.fallbackToLocalValidation} onChange={(v) => cfg.updateApp({ fallbackToLocalValidation: v })} label="Fallback to local validation when backend is unavailable" />
            <Toggle checked={app.autoValidateOnScan} onChange={(v) => cfg.updateApp({ autoValidateOnScan: v })} label="Validate automatically after scan" />
            <Field label="Duplicate scan cooldown (ms)" hint="The same QR detected again within this window is ignored by the camera scanner"><NumberInput min={0} value={app.scanCooldownMs} onChange={(n) => cfg.updateApp({ scanCooldownMs: Math.max(0, n) })} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Privacy & Storage" />
          <div className="space-y-5 p-5">
            <Toggle checked={app.maskSensitiveInLogs} onChange={(v) => cfg.updateApp({ maskSensitiveInLogs: v })} label="Mask sensitive values in API logs" description="Authorization, API keys, tokens, passwords, PAN fields" />
            <Toggle checked={app.storeFullPayloadInHistory} onChange={(v) => cfg.updateApp({ storeFullPayloadInHistory: v })} label="Store full QR payload in history" description="CPM payloads contain the customer's account number; disable to store a truncated payload only." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Max history entries"><NumberInput min={10} value={app.maxHistoryEntries} onChange={(n) => cfg.updateApp({ maxHistoryEntries: Math.max(10, n) })} /></Field>
              <Field label="Max API log entries"><NumberInput min={10} value={app.maxApiLogEntries} onChange={(n) => cfg.updateApp({ maxApiLogEntries: Math.max(10, n) })} /></Field>
            </div>
            <Field label="Sensitive header names (masked)">
              <TagListEditor values={app.sensitiveHeaderNames} onChange={(sensitiveHeaderNames) => cfg.updateApp({ sensitiveHeaderNames })} transform={(s) => s.trim().toLowerCase()} placeholder="e.g. x-signature" />
            </Field>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Configuration" />
        <div className="flex flex-wrap items-center gap-2 p-5">
          <Button variant="outline" icon={<IconUpload />} onClick={() => fileRef.current?.click()}>Import Configuration JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onImport(e.target.files?.[0])} />
          <Button variant="outline" icon={<IconDownload />} onClick={() => downloadText('cpm-simulator-config.json', cfg.exportConfig(includeSecrets), 'application/json')}>Export Configuration JSON</Button>
          <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={includeSecrets} onChange={(e) => setIncludeSecrets(e.target.checked)} />Include credentials</label>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setConfirm('config')}>Reset to Default Configuration</Button>
            <Button variant="danger" onClick={() => setConfirm('all')}>Clear All Local Data</Button>
          </div>
        </div>
      </Card>

      <CredentialWarning />
      <Card>
        <CardHeader title="Runtime Environment" />
        <dl className="grid gap-3 p-5 text-sm sm:grid-cols-3">
          <div><dt className="label">Secure context</dt><dd>{secure ? '✅ Yes — camera allowed' : '❌ No — camera requires HTTPS or localhost'}</dd></div>
          <div><dt className="label">Camera API</dt><dd>{typeof navigator.mediaDevices?.getUserMedia === 'function' ? '✅ Available' : '❌ Not available'}</dd></div>
          <div><dt className="label">Origin</dt><dd className="mono">{window.location.origin}</dd></div>
          <div className="sm:col-span-3"><dt className="label">User agent</dt><dd className="mono break-all text-xs text-slate-500">{navigator.userAgent}</dd></div>
        </dl>
      </Card>
      {!secure && <Alert tone="error" title="Camera blocked">Serve the app over HTTPS (e.g. `npm run dev -- --host` behind a TLS proxy) or open it via http://localhost.</Alert>}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === 'all' ? 'Clear all local data?' : 'Reset configuration?'}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                cfg.resetAll();
                if (confirm === 'all') {
                  useTransactionStore.getState().clear();
                  useLogStore.getState().clearApiLogs();
                  useLogStore.getState().clearAppLogs();
                  useSessionStore.getState().clearCurrent();
                }
                toast.success(confirm === 'all' ? 'All local data cleared' : 'Configuration reset to defaults');
                setConfirm(null);
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {confirm === 'all'
            ? 'Resets configuration and deletes transaction history and all logs from this browser.'
            : 'Merchant, environments, endpoints, mappings, validation rules, mock and application settings return to defaults. History and logs are kept.'}
        </p>
      </Modal>
    </div>
  );
}
