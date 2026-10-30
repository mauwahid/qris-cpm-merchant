import { Fragment, useState } from 'react';
import { Card, CardHeader, EmptyState, Alert } from '@/components/ui/Card';
import { Badge, CheckBadge } from '@/components/ui/Badge';
import { IconShield } from '@/components/ui/Icons';
import type { ValidationResult } from '@/core/types';

export function ValidationResultView({ result }: { result: ValidationResult }) {
  const [open, setOpen] = useState<string | null>(null);
  const s = result.summary;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <div className={`col-span-2 rounded-lg px-3 py-2 ${result.overallStatus === 'VALID' ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Overall Status</p>
          <p className="text-lg font-bold">{result.overallStatus}</p>
        </div>
        {[
          ['Mode', result.mode, 'text-navy-900'],
          ['Checks', s.total, 'text-navy-900'],
          ['Passed', s.passed, 'text-emerald-600'],
          ['Failed', s.failed, 'text-red-600'],
        ].map(([l, v, c]) => (
          <div key={String(l)} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</p>
            <p className={`text-lg font-bold ${c}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
        <span>Warnings: <b className="text-amber-600">{s.warnings}</b></span>
        <span>· Skipped: <b>{s.skipped}</b></span>
        <span>· {result.durationMs} ms</span>
        <span>· {new Date(result.validatedAt).toLocaleTimeString()}</span>
        {result.fallbackUsed && <Badge tone="amber">LOCAL FALLBACK</Badge>}
        {result.backend?.responseCode && <span>· Backend code <b>{result.backend.responseCode}</b></span>}
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="table-base">
          <thead>
            <tr>
              <th>Validation</th>
              <th>Category</th>
              <th>Result</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {result.checks.map((c) => {
              const hasDetail = !!(c.detail || c.expected || c.actual);
              const bar = c.status === 'PASS' ? 'border-l-emerald-500' : c.status === 'FAIL' ? 'border-l-red-500' : c.status === 'WARNING' ? 'border-l-amber-400' : 'border-l-slate-200';
              return (
                <Fragment key={c.id}>
                  <tr className={`border-l-4 ${bar} ${hasDetail ? 'cursor-pointer hover:bg-slate-50' : ''}`} onClick={() => hasDetail && setOpen(open === c.id ? null : c.id)}>
                    <td className="whitespace-nowrap font-medium text-navy-900">{c.name} {hasDetail && <span className="text-xs text-blue-500">{open === c.id ? '▾' : '▸'}</span>}</td>
                    <td className="text-[11px] uppercase text-slate-400">{c.category}</td>
                    <td><CheckBadge status={c.status} /></td>
                    <td className="text-slate-600">{c.description}</td>
                  </tr>
                  {open === c.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={4} className="text-xs text-slate-600">
                        <div className="space-y-1 py-1">
                          <p><b>Check ID:</b> <span className="mono">{c.id}</span></p>
                          {c.expected !== undefined && <p><b>Expected:</b> <span className="mono">{c.expected}</span></p>}
                          {c.actual !== undefined && <p><b>Actual:</b> <span className="mono">{c.actual}</span></p>}
                          {c.detail && <pre className="mono whitespace-pre-wrap">{c.detail}</pre>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ValidationResultPanel({ result, validating, error }: { result?: ValidationResult; validating?: boolean; error?: string }) {
  return (
    <Card>
      <CardHeader icon={<IconShield className="h-5 w-5" />} title="Validation Result" subtitle="Click a row to see why a check passed or failed" actions={validating ? <Badge tone="blue">VALIDATING…</Badge> : null} />
      <div className="p-5">
        {error && <div className="mb-3"><Alert tone="error" title="Validation error">{error}</Alert></div>}
        {result ? <ValidationResultView result={result} /> : <EmptyState icon={<IconShield className="h-10 w-10" />} title={validating ? 'Validating…' : 'Not validated yet'} description="Validation runs automatically after a scan, or click Validate QR." />}
      </div>
    </Card>
  );
}
