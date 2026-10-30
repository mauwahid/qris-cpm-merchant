import { useConfigStore, effectiveExecutionMode, effectiveValidationMode } from '@/store/configStore';
import { useSessionStore } from '@/store/sessionStore';
import { Badge, TxStatusBadge } from '../ui/Badge';
import { IconMenu } from '../ui/Icons';
import { toast } from '../ui/Toast';

export function Header({ onMenu }: { onMenu: () => void }) {
  const cfg = useConfigStore();
  const lastTx = useSessionStore((s) => s.lastTransaction);
  const processing = useSessionStore((s) => s.processing);
  const execMode = effectiveExecutionMode(cfg);
  const valMode = effectiveValidationMode(cfg);
  const secure = typeof window !== 'undefined' && window.isSecureContext;

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:px-6">
      <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <IconMenu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2">
        <label htmlFor="env-select" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Environment</label>
        <select
          id="env-select"
          className="input w-44 py-1.5"
          value={cfg.activeEnvironmentId}
          onChange={(e) => {
            cfg.setActiveEnvironment(e.target.value);
            const env = cfg.environments.find((x) => x.id === e.target.value);
            toast.info(`Active environment: ${env?.name}`);
          }}
        >
          {cfg.environments.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">API Integration</span>
        <button
          role="switch"
          aria-checked={cfg.app.apiIntegrationEnabled}
          aria-label="API Integration"
          onClick={() => {
            const next = !cfg.app.apiIntegrationEnabled;
            cfg.updateApp({ apiIntegrationEnabled: next });
            toast.info(next ? 'API integration enabled — backend validation active' : 'API integration disabled — standalone local mode (no HTTP requests)');
          }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${cfg.app.apiIntegrationEnabled ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${cfg.app.apiIntegrationEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="exec-select" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Execution</label>
        <select
          id="exec-select"
          className="input w-36 py-1.5"
          value={execMode}
          disabled={!cfg.app.apiIntegrationEnabled}
          title={cfg.app.apiIntegrationEnabled ? '' : 'Mock mode is forced while API integration is disabled'}
          onChange={(e) => cfg.updateApp({ executionMode: e.target.value as 'MOCK' | 'REAL_API' })}
        >
          <option value="MOCK">Mock Mode</option>
          <option value="REAL_API">Real API Mode</option>
        </select>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Badge tone={valMode === 'LOCAL' ? 'slate' : 'blue'}>Validation: {valMode}</Badge>
        <Badge tone={execMode === 'MOCK' ? 'amber' : 'green'}>{execMode === 'MOCK' ? 'MOCK' : 'REAL API'}</Badge>
        {!cfg.app.apiIntegrationEnabled && <Badge tone="navy">STANDALONE</Badge>}
        {!secure && <Badge tone="red">Insecure context — camera blocked</Badge>}
        <span className="hidden h-5 w-px bg-slate-200 md:block" />
        <span className="hidden text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:inline">Last Tx</span>
        {processing ? <TxStatusBadge status="PROCESSING" /> : lastTx ? <TxStatusBadge status={lastTx.status} /> : <Badge>NONE</Badge>}
      </div>
    </header>
  );
}
