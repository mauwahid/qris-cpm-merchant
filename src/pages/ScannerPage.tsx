import { PageHeader } from '@/components/ui/Card';
import { ScannerWorkstation } from '@/features/scanner/ScannerWorkstation';

export function ScannerPage() {
  return (
    <div>
      <PageHeader
        title="QR Scanner"
        description="Scan the CPM QR displayed on the customer's smartphone. Detection is continuous; the same QR is not processed twice."
      />
      <ScannerWorkstation />
    </div>
  );
}
