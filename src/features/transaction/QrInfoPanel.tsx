import { useState, type ReactNode } from 'react';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/ui/CopyButton';
import { JsonViewer } from '@/components/ui/JsonViewer';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { IconCode, IconEye, IconQr, IconShield, IconTrash } from '@/components/ui/Icons';
import { useSessionStore } from '@/store/sessionStore';
import { useConfigStore } from '@/store/configStore';
import { clearTransaction, validateCurrent } from '@/services/simulator';
import { CURRENCIES, COUNTRIES } from '@/core/config/defaults';
import type { ParsedQr } from '@/core/types';
import { formatAmount, na } from '@/core/util/format';
import { TlvTree } from './TlvTree';

export function parsedToJson(p: ParsedQr) {
  return {
    format: p.format,
    encoding: p.encoding,
    byteLength: p.byteLength,
    structureValid: p.structureValid,
    payloadHash: p.payloadHash,
    parsedAt: p.parsedAt,
    fields: p.fields,
    issues: p.issues,
    tlv: p.nodes,
  };
}

const FORMAT_LABEL: Record<string, string> = { EMVCO_CPM: 'EMVCo CPM', EMVCO_MPM: 'EMVCo MPM (unsupported)', UNKNOWN: 'Unknown', EMPTY: 'Empty' };

function InfoRow({ label, value, source }: { label: string; value: ReactNode; source?: string }) {
  const isNa = value === 'N/A';
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="shrink-0 text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`text-right text-sm ${isNa ? 'text-slate-400' : 'font-medium text-navy-900'} break-all`}>
        {value}
        {source && !isNa && <span className="ml-1.5 text-[10px] font-normal uppercase text-slate-400">({source})</span>}
      </dd>
    </div>
  );
}

export function QrInfoPanel() {
  const parsed = useSessionStore((s) => s.parsed);
  const source = useSessionStore((s) => s.source);
  const validating = useSessionStore((s) => s.validating);
  const merchant = useConfigStore((s) => s.merchant);
  const [view, setView] = useState<'raw' | 'parsed' | null>(null);
  const [parsedTab, setParsedTab] = useState<'tree' | 'json'>('tree');

  if (!parsed) {
    return (
      <Card>
        <CardHeader icon={<IconQr className="h-5 w-5" />} title="Scanned QR Information" />
        <EmptyState icon={<IconQr className="h-10 w-10" />} title="No QR scanned yet" description="Scan a CPM QR with the camera, upload an image, or load a sample payload from the Developer Testing Panel." />
      </Card>
    );
  }
  const f = parsed.fields;
  const cur = f.currencyCode ?? merchant.currencyNumeric;
  const country = f.countryCode ? `${f.countryCode}${COUNTRIES[f.countryCode] ? ` (${COUNTRIES[f.countryCode]})` : ''}` : merchant.countryCode;
  const errors = parsed.issues.filter((i) => i.severity === 'ERROR').length;
  const additional = Object.entries(f.additionalData).filter(([k]) => !k.endsWith('Alpha'));

  return (
    <Card>
      <CardHeader
        icon={<IconQr className="h-5 w-5" />}
        title="Scanned QR Information"
        subtitle={`Source: ${source?.toLowerCase() ?? 'n/a'} · ${new Date(parsed.parsedAt).toLocaleTimeString()}`}
        actions={
          <>
            <Badge tone={parsed.format === 'EMVCO_CPM' ? 'blue' : 'red'}>{FORMAT_LABEL[parsed.format]}</Badge>
            {errors > 0 && <Badge tone="red">{errors} parse error(s)</Badge>}
          </>
        }
      />
      <div className="grid gap-x-8 px-5 py-2 md:grid-cols-2">
        <dl>
          <InfoRow label="QR Format" value={`${FORMAT_LABEL[parsed.format]} · ${parsed.encoding}`} />
          <InfoRow label="Payload Format Indicator" value={na(f.payloadFormatIndicator)} />
          <InfoRow label="Application Identifier" value={na(f.applicationIdentifier)} source="4F" />
          <InfoRow label="Application Label" value={na(f.applicationLabel)} />
          <InfoRow label="Account (PAN)" value={na(f.panMasked ?? f.track2Masked)} source={f.panMasked ? '5A' : f.track2Masked ? '57' : undefined} />
          <InfoRow label="Cardholder Name" value={na(f.cardholderName)} />
          <InfoRow label="Transaction Reference No." value={na(f.transactionReference)} />
          <InfoRow label="App. Transaction Counter" value={na(f.applicationTransactionCounter)} source="9F36" />
        </dl>
        <dl>
          <InfoRow label="Merchant ID" value={na(f.merchantId ?? merchant.merchantId)} source={f.merchantId ? 'QR' : 'terminal'} />
          <InfoRow label="Merchant Name" value={na(f.merchantName ?? merchant.merchantName)} source={f.merchantName ? 'QR' : 'terminal'} />
          <InfoRow label="Merchant Category Code" value={na(f.merchantCategoryCode ?? merchant.merchantCategoryCode)} source={f.merchantCategoryCode ? 'QR' : 'terminal'} />
          <InfoRow label="Terminal ID" value={na(f.terminalId ?? merchant.terminalId)} source={f.terminalId ? 'QR' : 'terminal'} />
          <InfoRow label="Transaction Amount" value={f.amount !== undefined ? formatAmount(f.amount, CURRENCIES[cur] ?? 'IDR') : 'N/A'} source={f.amount !== undefined ? '9F02' : undefined} />
          <InfoRow label="Currency" value={`${cur} (${CURRENCIES[cur] ?? '?'})`} source={f.currencyCode ? 'QR' : 'terminal'} />
          <InfoRow label="Country Code" value={na(country)} source={f.countryCode ? 'QR' : 'terminal'} />
          <InfoRow label="Application Cryptogram" value={na(f.applicationCryptogram)} source="9F26" />
        </dl>
      </div>
      <div className="px-5 pb-2">
        <p className="mb-1 text-xs font-medium text-slate-500">Additional Data</p>
        {additional.length ? (
          <div className="flex flex-wrap gap-1.5">
            {additional.map(([k, v]) => (
              <span key={k} className="mono rounded bg-slate-100 px-2 py-0.5 text-slate-700"><b className="text-blue-700">{k}</b>={v}</span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">N/A</p>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          In Consumer Presented Mode the QR carries the customer's credential; merchant, terminal and amount normally come from the terminal (labelled "terminal").
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
        <Button variant="outline" size="sm" icon={<IconEye />} onClick={() => setView('raw')}>View Raw Payload</Button>
        <Button variant="outline" size="sm" icon={<IconCode />} onClick={() => setView('parsed')}>View Parsed Data</Button>
        <CopyButton text={parsed.raw} label="Copy Payload" />
        <Button variant="outline" size="sm" icon={<IconTrash />} onClick={clearTransaction}>Clear Transaction</Button>
        <Button size="sm" className="ml-auto" icon={<IconShield />} loading={validating} onClick={() => void validateCurrent()}>Validate QR</Button>
      </div>

      <Modal open={view === 'raw'} onClose={() => setView(null)} title="Raw QR Payload" wide>
        <div className="space-y-3">
          <JsonViewer title={`Raw payload (${parsed.encoding}, ${parsed.raw.length} chars)`} value={parsed.raw} />
          {parsed.bytesHex && <JsonViewer title={`Decoded bytes (hex, ${parsed.byteLength} bytes)`} value={parsed.bytesHex.replace(/(.{2})/g, '$1 ').trim()} />}
          <JsonViewer title="Raw payload (JSON)" value={{ payload: parsed.raw, encoding: parsed.encoding, length: parsed.raw.length, payloadHash: parsed.payloadHash }} />
        </div>
      </Modal>
      <Modal open={view === 'parsed'} onClose={() => setView(null)} title="Parsed QR Data" wide>
        <Tabs tabs={[{ id: 'tree', label: 'TLV Tree' }, { id: 'json', label: 'JSON' }]} value={parsedTab} onChange={setParsedTab} />
        <div className="mt-3">{parsedTab === 'tree' ? <TlvTree nodes={parsed.nodes} /> : <JsonViewer value={parsedToJson(parsed)} maxHeight={560} />}</div>
      </Modal>
    </Card>
  );
}
