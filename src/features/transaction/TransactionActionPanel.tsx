import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TxStatusBadge, Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Form';
import { IconBan, IconCheck, IconWallet } from '@/components/ui/Icons';
import { toast } from '@/components/ui/Toast';
import { useSessionStore } from '@/store/sessionStore';
import { useConfigStore, effectiveExecutionMode } from '@/store/configStore';
import { acceptPayment, rejectPayment, setAmount, validateCurrent } from '@/services/simulator';
import { formatAmount, formatDateTime } from '@/core/util/format';

export function TransactionActionPanel() {
  const { parsed, validation, amount, processing, currentTransaction, lastTransaction, validating } = useSessionStore();
  const cfg = useConfigStore();
  const execMode = effectiveExecutionMode(cfg);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('Rejected by merchant');

  const isValid = validation?.overallStatus === 'VALID' && validation.payloadHash === parsed?.payloadHash;
  const consumed = currentTransaction && currentTransaction.payloadHash === parsed?.payloadHash && currentTransaction.status !== 'PROCESSING';
  const canAccept = !!parsed && isValid && !processing && !consumed;
  const canReject = !!parsed && !processing && !consumed;
  const shown = currentTransaction ?? lastTransaction;

  const disabledReason = !parsed ? 'Scan a QR first' : processing ? 'Processing…' : consumed ? 'This QR already has a result — scan the next QR' : validating ? 'Validating…' : !validation ? 'Validate the QR first' : !isValid ? 'QR failed validation' : '';

  return (
    <Card>
      <CardHeader
        icon={<IconWallet className="h-5 w-5" />}
        title="Transaction"
        subtitle={`Payment authorization · ${execMode === 'MOCK' ? 'Mock processor (simulated result)' : `Real API (${cfg.environments.find((e) => e.id === cfg.activeEnvironmentId)?.name})`}`}
      />
      <div className="space-y-4 p-5">
        <Field label={`Amount (${cfg.merchant.currency})`} hint={`Allowed ${formatAmount(cfg.validation.minAmount, cfg.merchant.currency)} – ${formatAmount(cfg.validation.maxAmount, cfg.merchant.currency)}. Changing the amount requires re-validation.`}>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount || ''}
              disabled={processing}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="text-lg font-semibold"
              aria-label="Amount"
            />
            {parsed && !validation && !validating && (
              <Button variant="outline" onClick={() => void validateCurrent()}>Re-validate</Button>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="success"
            size="lg"
            icon={<IconCheck className="h-5 w-5" />}
            disabled={!canAccept}
            loading={processing}
            onClick={async () => {
              const tx = await acceptPayment();
              if (tx) (tx.status === 'APPROVED' ? toast.success : toast.error)(`Payment ${tx.status}: ${tx.responseMessage ?? ''}`);
            }}
          >
            Accept Payment
          </Button>
          <Button variant="danger" size="lg" icon={<IconBan className="h-5 w-5" />} disabled={!canReject} onClick={() => setRejectOpen(true)}>
            Reject Payment
          </Button>
        </div>
        {disabledReason && <p className="-mt-1 text-center text-xs text-slate-400">{disabledReason}</p>}

        <div className={`rounded-xl border-2 p-4 ${!shown ? 'border-dashed border-slate-200' : shown.status === 'APPROVED' ? 'border-emerald-200 bg-emerald-50/50' : shown.status === 'PROCESSING' ? 'border-blue-200 bg-blue-50/50' : shown.status === 'REJECTED' ? 'border-violet-200 bg-violet-50/50' : 'border-red-200 bg-red-50/50'}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{currentTransaction ? 'Current Transaction' : 'Latest Transaction Status'}</p>
            {shown && <TxStatusBadge status={shown.status} />}
          </div>
          {shown ? (
            <div className="mt-2 space-y-1 text-sm">
              {shown.status === 'PROCESSING' && (
                <div className="mb-2 h-1.5 animate-pulse rounded-full bg-blue-400" />
              )}
              <p className="text-2xl font-bold text-navy-900">{formatAmount(shown.amount, shown.currency)}</p>
              <p className="mono text-slate-600">
                <Link to={`/transactions/${shown.transactionId}`} className="text-blue-700 hover:underline">{shown.transactionId}</Link>
              </p>
              <p className="text-xs text-slate-500">{formatDateTime(shown.timestamp)} · {shown.executionMode} · {shown.environment}</p>
              {shown.responseCode && (
                <p className="text-sm"><Badge tone="slate">RC {shown.responseCode}</Badge> <span className="text-slate-700">{shown.responseMessage}</span></p>
              )}
              {shown.referenceNumber && <p className="text-xs text-slate-500">Reference: <span className="mono">{shown.referenceNumber}</span></p>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">No transaction yet.</p>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          A valid QR does not mean the payment succeeds: validation and payment authorization are separate. Mock mode only simulates the authorization result.
        </p>
      </div>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject Payment"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                const tx = rejectPayment(reason);
                setRejectOpen(false);
                if (tx) toast.info(`Transaction ${tx.transactionId} REJECTED`);
              }}
            >
              Confirm Reject
            </Button>
          </>
        }
      >
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        <p className="mt-2 text-xs text-slate-500">The transaction will be stored with status REJECTED.</p>
      </Modal>
    </Card>
  );
}
