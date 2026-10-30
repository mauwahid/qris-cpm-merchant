import type { ReactNode } from 'react';
import type { CheckStatus, TransactionStatus } from '@/core/types';

type Tone = 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'navy' | 'purple';
const tones: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  navy: 'bg-navy-900 text-white ring-navy-900',
  purple: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

export function Badge({ tone = 'slate', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]} ${className}`}>{children}</span>;
}

export const txTone = (s: TransactionStatus | string): Tone =>
  s === 'APPROVED' ? 'green' : s === 'PROCESSING' ? 'blue' : s === 'REJECTED' ? 'purple' : s === 'TIMEOUT' ? 'amber' : 'red';

export function TxStatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <Badge tone={txTone(status)}>
      {status === 'PROCESSING' && <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />}
      {status.replace('_', ' ')}
    </Badge>
  );
}

export function CheckBadge({ status }: { status: CheckStatus }) {
  const tone: Tone = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : status === 'WARNING' ? 'amber' : 'slate';
  return <Badge tone={tone}>{status}</Badge>;
}

export function HttpStatusBadge({ status, error }: { status?: number; error?: boolean }) {
  if (status === undefined) return <Badge tone="red">{error ? 'ERROR' : '—'}</Badge>;
  const tone: Tone = status < 300 ? 'green' : status < 400 ? 'blue' : status < 500 ? 'amber' : 'red';
  return <Badge tone={tone}>{status}</Badge>;
}
