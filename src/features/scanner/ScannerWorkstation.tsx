import { ScannerPanel } from './ScannerPanel';
import { QrInfoPanel } from '@/features/transaction/QrInfoPanel';
import { ValidationResultPanel } from '@/features/transaction/ValidationResultPanel';
import { TransactionActionPanel } from '@/features/transaction/TransactionActionPanel';
import { useSessionStore } from '@/store/sessionStore';

/** Main merchant workflow: scan → parsed info → validation → accept/reject. */
export function ScannerWorkstation() {
  const { validation, validating, validationError, parsed } = useSessionStore();
  const v = validation && parsed && validation.payloadHash === parsed.payloadHash ? validation : undefined;
  return (
    <div className="grid gap-5 xl:grid-cols-5">
      <div className="space-y-5 xl:col-span-3">
        <ScannerPanel />
        <QrInfoPanel />
      </div>
      <div className="space-y-5 xl:col-span-2">
        <TransactionActionPanel />
        <ValidationResultPanel result={v} validating={validating} error={validationError} />
      </div>
    </div>
  );
}
