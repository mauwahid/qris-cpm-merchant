import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { LogViewer } from '@/features/developer/LogViewer';
import { ValidationResultPanel } from '@/features/transaction/ValidationResultPanel';
import { useSessionStore } from '@/store/sessionStore';

export function ValidationLogsPage() {
  const { validation, validating, validationError } = useSessionStore();
  return (
    <div className="space-y-5">
      <PageHeader title="Validation Logs" description="Validation decisions and the parser findings that led to them." />
      <Card>
        <CardHeader title="Validation & Parsing Log" />
        <div className="p-5"><LogViewer categories={['VALIDATION', 'PARSING']} height={520} /></div>
      </Card>
      <ValidationResultPanel result={validation} validating={validating} error={validationError} />
    </div>
  );
}
