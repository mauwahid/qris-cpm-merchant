import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/Button';
import { IconDownload } from '@/components/ui/Icons';

/** Renders a payload as a QR image (for displaying on a phone / second screen during tests). */
export function QrImage({ value, size = 220 }: { value: string; size?: number }) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!value) return setUrl(undefined);
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: size * 2 })
      .then((u) => (setUrl(u), setError(undefined)))
      .catch((e) => setError(String(e)));
  }, [value, size]);
  if (!value) return null;
  if (error) return <p className="text-xs text-red-600">{error}</p>;
  return (
    <div className="flex flex-col items-center gap-2">
      {url && <img src={url} width={size} height={size} alt="Generated QR code" className="rounded-lg border border-slate-200 bg-white" />}
      {url && (
        <a href={url} download="cpm-sample-qr.png">
          <Button size="sm" variant="outline" icon={<IconDownload />}>Download PNG</Button>
        </a>
      )}
    </div>
  );
}
