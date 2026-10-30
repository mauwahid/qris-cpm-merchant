import { useState } from 'react';
import { Alert, Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select, Textarea, Toggle } from '@/components/ui/Form';
import { IconCode, IconFlask, IconPlay, IconQr, IconSettings, IconShield, IconActivity } from '@/components/ui/Icons';
import { toast } from '@/components/ui/Toast';
import { Tabs } from '@/components/ui/Tabs';
import { JsonViewer } from '@/components/ui/JsonViewer';
import { useConfigStore } from '@/store/configStore';
import { useSessionStore } from '@/store/sessionStore';
import { ingestPayload, validateCurrent } from '@/services/simulator';
import { STATIC_SAMPLES, generateSamplePayload, randomSimulatedPan } from '@/core/cpm/sampleGenerator';
import { MOCK_DEFAULTS } from '@/core/transaction/MockPaymentProcessor';
import type { MockConfig } from '@/core/config/types';
import { TlvTree } from '@/features/transaction/TlvTree';
import { parsedToJson } from '@/features/transaction/QrInfoPanel';
import { ValidationResultPanel } from '@/features/transaction/ValidationResultPanel';
import { TransactionActionPanel } from '@/features/transaction/TransactionActionPanel';
import { QrImage } from '@/features/developer/QrImage';
import { LogViewer } from '@/features/developer/LogViewer';
import { ScenarioRunner } from '@/features/developer/ScenarioRunner';

function SampleGenerator({ onGenerated }: { onGenerated: (p: string) => void }) {
  const supportedAids = useConfigStore((s) => s.validation.supportedAids);
  const [pan, setPan] = useState('');
  const [name, setName] = useState('SIMULATED CUSTOMER');
  const [aid, setAid] = useState(supportedAids[0] ?? '');
  const [track2, setTrack2] = useState(false);
  const [crc, setCrc] = useState(true);
  return (
    <div className="space-y-3">
      <Alert tone="warning" title="Simulation data only">
        Sample payloads follow the public EMVCo CPM data-object layout with random values. They are <b>not</b> official or ASPI-certified QRIS CPM payloads and cannot be authorised by a real issuer.
      </Alert>
      <Field label="Preset samples">
        <div className="grid gap-2 sm:grid-cols-3">
          {STATIC_SAMPLES.map((s) => (
            <button key={s.id} title={s.description} onClick={() => onGenerated(s.build())} className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-blue-400 hover:bg-blue-50">
              <p className="font-semibold text-navy-900">{s.label}</p>
              <p className="mt-0.5 text-slate-500">{s.description}</p>
            </button>
          ))}
        </div>
      </Field>
      <div className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
        <p className="label sm:col-span-2">Custom generator</p>
        <Field label="AID (4F)"><Input className="mono" value={aid} onChange={(e) => setAid(e.target.value.toUpperCase())} /></Field>
        <Field label="PAN (5A)" hint="Empty = random Luhn-valid simulated PAN">
          <div className="flex gap-2"><Input className="mono" value={pan} onChange={(e) => setPan(e.target.value.replace(/\D/g, ''))} /><Button variant="outline" onClick={() => setPan(randomSimulatedPan())}>Random</Button></div>
        </Field>
        <Field label="Cardholder name (5F20)"><Input value={name} maxLength={26} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="space-y-2 pt-5">
          <Toggle checked={track2} onChange={setTrack2} label="Include Track 2 (57)" />
          <Toggle checked={crc} onChange={setCrc} label="Append simulator CRC (DF7F, non-standard)" />
        </div>
        <div className="sm:col-span-2">
          <Button icon={<IconFlask />} onClick={() => {
            try {
              onGenerated(generateSamplePayload({ aid: aid || undefined, pan: pan || undefined, cardholderName: name, includeTrack2: track2, includeSimulatorCrc: crc }));
            } catch (e) {
              toast.error(`Generation failed: ${(e as Error).message}`);
            }
          }}>Generate Sample CPM Payload</Button>
        </div>
      </div>
    </div>
  );
}

function MockConfigPanel() {
  const mock = useConfigStore((s) => s.mock);
  const update = useConfigStore((s) => s.updateMock);
  const api = useConfigStore((s) => s.app.apiIntegrationEnabled && s.app.executionMode === 'REAL_API');
  return (
    <div className="space-y-3">
      {api && <Alert tone="info">Real API mode is active — the mock processor is used only in Mock mode.</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mock response">
          <Select value={mock.response} onChange={(e) => {
            const r = e.target.value as MockConfig['response'];
            update({ response: r, responseCode: MOCK_DEFAULTS[r].code, responseMessage: MOCK_DEFAULTS[r].message });
          }}>
            {(Object.keys(MOCK_DEFAULTS) as MockConfig['response'][]).map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </Select>
        </Field>
        <Field label="Success rate (%)" hint="Applies to APPROVED: remaining % are declined">
          <NumberInput min={0} max={100} value={mock.successRate} onChange={(n) => update({ successRate: Math.min(100, Math.max(0, n)) })} />
        </Field>
        <Field label="Processing delay (ms)"><NumberInput min={0} value={mock.processingDelayMs} onChange={(n) => update({ processingDelayMs: Math.max(0, n) })} /></Field>
        <Field label="Transaction timeout (ms)" hint="Delay ≥ timeout produces TIMEOUT"><NumberInput min={0} value={mock.transactionTimeoutMs} onChange={(n) => update({ transactionTimeoutMs: Math.max(0, n) })} /></Field>
        <Field label="Response code"><Input className="mono" value={mock.responseCode} onChange={(e) => update({ responseCode: e.target.value })} /></Field>
        <Field label="Response message"><Input value={mock.responseMessage} onChange={(e) => update({ responseMessage: e.target.value })} /></Field>
      </div>
    </div>
  );
}

export function DeveloperPanelPage() {
  const { parsed, validation, validating, validationError } = useSessionStore();
  const [raw, setRaw] = useState('');
  const [tab, setTab] = useState<'tree' | 'json' | 'issues'>('tree');
  const [section, setSection] = useState<'payload' | 'scenarios'>('payload');

  const parse = () => {
    if (!raw.trim()) return toast.warning('Enter a payload first');
    ingestPayload(raw, 'MANUAL');
    toast.info('Payload parsed');
  };
  const parseAndValidate = async () => {
    if (!raw.trim()) return toast.warning('Enter a payload first');
    ingestPayload(raw, 'MANUAL');
    await validateCurrent();
  };
  const v = validation && parsed && validation.payloadHash === parsed.payloadHash ? validation : undefined;

  return (
    <div className="space-y-5">
      <PageHeader title="Developer Testing Panel" description="Parse and validate raw payloads, generate simulated CPM samples, tune the mock processor, inspect logs and run simulation scenarios." />
      <Tabs tabs={[{ id: 'payload', label: 'Payload Lab' }, { id: 'scenarios', label: 'Simulation Scenarios' }]} value={section} onChange={setSection} />

      {section === 'scenarios' ? (
        <Card>
          <CardHeader icon={<IconPlay className="h-5 w-5" />} title="Simulation Scenarios" subtitle="14 predefined end-to-end scenarios" />
          <div className="p-5"><ScenarioRunner /></div>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader icon={<IconCode className="h-5 w-5" />} title="Raw QR Payload" />
              <div className="space-y-3 p-5">
                <Textarea rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste a Base64 (or hex) EMVCo CPM payload…" aria-label="Raw QR payload" />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={async () => {
                    try {
                      setRaw((await navigator.clipboard.readText()).trim());
                    } catch {
                      toast.error('Clipboard access denied — paste manually with Ctrl/Cmd+V');
                    }
                  }}>Paste</Button>
                  <Button variant="secondary" icon={<IconCode />} onClick={parse}>Parse QR Payload</Button>
                  <Button icon={<IconShield />} loading={validating} onClick={() => void parseAndValidate()}>Validate QR Payload</Button>
                  <Button variant="ghost" onClick={() => setRaw('')}>Clear</Button>
                </div>
                {raw && (
                  <div className="flex justify-center rounded-lg bg-slate-50 p-3">
                    <div className="text-center">
                      <QrImage value={raw} />
                      <p className="mt-1 text-[11px] text-slate-400">Show this QR on a phone / second screen to test camera scanning.</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader icon={<IconQr className="h-5 w-5" />} title="Generate Sample CPM QR Payload" />
              <div className="p-5"><SampleGenerator onGenerated={(p) => { setRaw(p); toast.success('Sample generated (simulation data)'); }} /></div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Parse Result" subtitle={parsed ? `${parsed.format} · ${parsed.encoding} · ${parsed.byteLength} bytes · ${parsed.issues.length} issue(s)` : 'Nothing parsed yet'} />
            <div className="p-5">
              <Tabs tabs={[{ id: 'tree', label: 'TLV Tree' }, { id: 'json', label: 'Parsed JSON' }, { id: 'issues', label: 'Parser Issues', count: parsed?.issues.length ?? 0 }]} value={tab} onChange={setTab} />
              <div className="mt-3">
                {!parsed ? <p className="text-sm text-slate-400">Parse a payload to see its structure.</p> : tab === 'tree' ? <TlvTree nodes={parsed.nodes} /> : tab === 'json' ? <JsonViewer value={parsedToJson(parsed)} /> : <JsonViewer value={parsed.issues} />}
              </div>
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-5">
            <div className="xl:col-span-3"><ValidationResultPanel result={v} validating={validating} error={validationError} /></div>
            <div className="xl:col-span-2"><TransactionActionPanel /></div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader icon={<IconSettings className="h-5 w-5" />} title="Mock Payment Processor" subtitle="Response, processing delay and transaction timeout" />
              <div className="p-5"><MockConfigPanel /></div>
            </Card>
            <Card>
              <CardHeader icon={<IconActivity className="h-5 w-5" />} title="Logs" subtitle="Parsing, validation, transaction processing and scanner logs" />
              <div className="p-5"><LogViewer /></div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
