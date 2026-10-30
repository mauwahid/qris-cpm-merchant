import { useRef, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { IconCamera, IconCameraOff, IconImage, IconPlay, IconQr, IconStop, IconUpload } from '@/components/ui/Icons';
import { toast } from '@/components/ui/Toast';
import { useConfigStore } from '@/store/configStore';
import { useSessionStore } from '@/store/sessionStore';
import { AppLog } from '@/store/logStore';
import { ingestPayload } from '@/services/simulator';
import { decodeQrFromFile, useQrScanner } from './useQrScanner';

export function ScannerPanel({ compact = false }: { compact?: boolean }) {
  const cooldown = useConfigStore((s) => s.app.scanCooldownMs);
  const processing = useSessionStore((s) => s.processing);
  const [pauseAfterDetect, setPauseAfterDetect] = useState(true);
  const [paused, setPaused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const scanner = useQrScanner({
    cooldownMs: cooldown,
    paused: paused || processing,
    onDetected: (text) => {
      const current = useSessionStore.getState().parsed;
      if (current?.raw === text.trim()) return; // already the active QR
      AppLog.scanner('INFO', `QR detected by camera (${text.length} chars)`);
      ingestPayload(text, 'CAMERA');
      toast.success('QR code detected');
      if (pauseAfterDetect) setPaused(true);
    },
  });

  const flashing = Date.now() - scanner.flashAt < 1200;
  const running = scanner.status === 'scanning' || scanner.status === 'starting';

  const onFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const text = await decodeQrFromFile(file);
      AppLog.scanner('INFO', `QR decoded from image ${file.name}`);
      ingestPayload(text, 'UPLOAD');
      toast.success(`QR decoded from ${file.name}`);
    } catch (e) {
      AppLog.scanner('WARN', `Image decode failed: ${(e as Error).message}`);
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<IconQr className="h-5 w-5" />}
        title="Camera QR Scanner"
        subtitle="Point the laptop camera at the CPM QR shown on the customer's phone"
        actions={
          <>
            {scanner.status === 'scanning' && !paused && <Badge tone="green"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />LIVE</Badge>}
            {scanner.status === 'scanning' && paused && <Badge tone="amber">PAUSED</Badge>}
            {scanner.status === 'starting' && <Badge tone="blue">STARTING…</Badge>}
            {scanner.status === 'idle' && <Badge>STOPPED</Badge>}
            {scanner.status === 'error' && <Badge tone="red">ERROR</Badge>}
          </>
        }
      />
      <div className="p-4">
        <div
          className={`relative mx-auto overflow-hidden rounded-xl bg-navy-950 ring-4 transition-all duration-300 ${flashing ? 'ring-emerald-400' : 'ring-transparent'} ${compact ? 'aspect-video' : 'aspect-[4/3]'}`}
        >
          <video ref={scanner.videoRef} className="h-full w-full object-cover" muted playsInline aria-label="Camera preview" />
          {!running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-navy-200">
              <IconCameraOff className="h-12 w-12 text-navy-500" />
              <p className="text-sm">{scanner.status === 'error' ? 'Camera unavailable' : 'Camera is off'}</p>
              <p className="max-w-xs text-xs text-navy-400">Click <b>Start Scanner</b> and allow camera access. Increase the phone's screen brightness for best results.</p>
            </div>
          )}
          {running && (
            <>
              <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-white/40">
                <span className="absolute -left-0.5 -top-0.5 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-blue-400" />
                <span className="absolute -right-0.5 -top-0.5 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-blue-400" />
                <span className="absolute -bottom-0.5 -left-0.5 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-blue-400" />
                <span className="absolute -bottom-0.5 -right-0.5 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-blue-400" />
                {!paused && <span className="scan-line absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_12px_2px_rgba(96,165,250,0.7)]" />}
              </div>
              {flashing && (
                <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">✓ QR detected</div>
              )}
              {paused && !flashing && (
                <div className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-navy-900/80 px-4 py-1.5 text-xs text-white">Detection paused — click Resume to scan the next QR</div>
              )}
            </>
          )}
        </div>

        {scanner.error && (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <p className="font-semibold">{scanner.error.kind.replace(/_/g, ' ')}</p>
            <p className="text-xs">{scanner.error.message}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!running ? (
            <Button icon={<IconPlay />} onClick={() => void scanner.start()}>Start Scanner</Button>
          ) : (
            <Button variant="danger" icon={<IconStop />} onClick={scanner.stop}>Stop Scanner</Button>
          )}
          {running && paused && (
            <Button variant="success" icon={<IconCamera />} onClick={() => { scanner.resetDuplicateGuard(); setPaused(false); }}>Resume</Button>
          )}
          <Button variant="outline" icon={<IconUpload />} loading={uploading} onClick={() => fileRef.current?.click()}>Upload QR Image</Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="qr-upload" />
          <div className="ml-auto flex items-center gap-2">
            <IconImage className="h-4 w-4 text-slate-400" />
            <select
              className="input w-52 py-1.5 text-xs"
              aria-label="Camera"
              value={scanner.deviceId}
              onChange={(e) => scanner.selectDevice(e.target.value)}
              disabled={scanner.devices.length === 0}
            >
              {scanner.devices.length === 0 && <option value="">Default camera</option>}
              {scanner.devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={pauseAfterDetect} onChange={(e) => setPauseAfterDetect(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
          Pause detection after a QR is detected (prevents processing the same QR repeatedly)
        </label>
      </div>
    </Card>
  );
}
