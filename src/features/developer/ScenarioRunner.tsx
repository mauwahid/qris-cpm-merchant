import { Fragment, useState } from 'react';
import { SCENARIOS, runScenario, type ScenarioResult } from '@/core/scenarios/scenarios';
import { useConfigStore, pickConfig } from '@/store/configStore';
import { apiLogSink, AppLog } from '@/store/logStore';
import { Button } from '@/components/ui/Button';
import { Badge, TxStatusBadge } from '@/components/ui/Badge';
import { IconPlay } from '@/components/ui/Icons';
import { ValidationResultView } from '@/features/transaction/ValidationResultPanel';
import { Modal } from '@/components/ui/Modal';
import { ingestPayload } from '@/services/simulator';
import { toast } from '@/components/ui/Toast';

export function ScenarioRunner() {
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScenarioResult | null>(null);

  const run = async (id: string) => {
    const def = SCENARIOS.find((s) => s.id === id)!;
    setRunning(id);
    try {
      const r = await runScenario(def, pickConfig(useConfigStore.getState()), apiLogSink);
      AppLog.transaction(r.passed ? 'INFO' : 'WARN', `Scenario #${def.number} ${def.name}: ${r.passed ? 'PASSED' : 'FAILED'} — ${r.outcome}`, { steps: r.steps });
      setResults((prev) => ({ ...prev, [id]: r }));
      return r;
    } finally {
      setRunning(null);
    }
  };

  const runAll = async () => {
    let passed = 0;
    for (const s of SCENARIOS) if ((await run(s.id)).passed) passed++;
    (passed === SCENARIOS.length ? toast.success : toast.warning)(`${passed}/${SCENARIOS.length} scenarios matched expectations`);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-xs text-slate-500">
          Scenarios run in an isolated sandbox (cloned configuration, in-memory history). Backend scenarios use an in-browser <b>simulated backend</b> — no real HTTP request is sent. Their calls appear in API Logs marked "simulated".
        </p>
        <Button icon={<IconPlay />} onClick={() => void runAll()} loading={running !== null}>Run All Scenarios</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="table-base">
          <thead>
            <tr><th>#</th><th>Scenario</th><th>Expected</th><th>Outcome</th><th>Result</th><th /></tr>
          </thead>
          <tbody>
            {SCENARIOS.map((s) => {
              const r = results[s.id];
              return (
                <Fragment key={s.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="text-slate-400">{s.number}</td>
                    <td>
                      <p className="font-medium text-navy-900">{s.name} {s.backend && <Badge tone="blue">BACKEND (SIM)</Badge>}</p>
                      <p className="text-xs text-slate-500">{s.description}</p>
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {s.expectation.kind === 'TRANSACTION' ? <TxStatusBadge status={s.expectation.status} /> : <span>INVALID · <span className="mono">{s.expectation.failingCheck}</span></span>}
                    </td>
                    <td className="max-w-sm text-xs text-slate-600">{r ? r.outcome : <span className="text-slate-300">—</span>}</td>
                    <td>{r ? <Badge tone={r.passed ? 'green' : 'red'}>{r.passed ? 'PASS' : 'FAIL'}</Badge> : <Badge>NOT RUN</Badge>}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="outline" loading={running === s.id} disabled={running !== null && running !== s.id} onClick={() => void run(s.id)}>Run</Button>
                      {r && <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>Details</Button>}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Scenario #${detail.scenario.number}: ${detail.scenario.name}` : ''} wide>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={detail.passed ? 'green' : 'red'}>{detail.passed ? 'EXPECTATION MET' : 'EXPECTATION NOT MET'}</Badge>
              <span className="text-sm text-slate-600">{detail.outcome}</span>
              <span className="text-xs text-slate-400">{detail.durationMs} ms</span>
              {detail.parsed && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => { ingestPayload(detail.parsed!.raw, 'SCENARIO'); toast.info('Scenario payload loaded into the scanner session'); }}>
                  Load payload into scanner
                </Button>
              )}
            </div>
            <div>
              <p className="label">Steps</p>
              <ol className="space-y-1 text-xs">
                {detail.steps.map((st, i) => <li key={i} className="flex gap-2"><span className="mono text-slate-400">{new Date(st.at).toLocaleTimeString()}</span>{st.message}</li>)}
              </ol>
            </div>
            {detail.validation && <div><p className="label">Validation</p><ValidationResultView result={detail.validation} /></div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
