import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserCodeReader, BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { checkCameraSupport, describeCameraError, type CameraError } from './cameraErrors';

export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'error';

export interface UseQrScannerOptions {
  /** Called once per distinct detection (duplicates within cooldown are suppressed). */
  onDetected: (text: string) => void;
  cooldownMs?: number;
  /** When true, detections are ignored (camera keeps running). */
  paused?: boolean;
}

function createReader() {
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserQRCodeReader(hints, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 400 });
}

/**
 * Camera Scanner Module. Owns the full camera lifecycle:
 * permission → stream → continuous decode → stop (on Stop, unmount, or tab hidden).
 */
export function useQrScanner({ onDetected, cooldownMs = 3000, paused = false }: UseQrScannerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const onDetectedRef = useRef(onDetected);
  const pausedRef = useRef(paused);
  onDetectedRef.current = onDetected;
  pausedRef.current = paused;

  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [error, setError] = useState<CameraError>();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [flashAt, setFlashAt] = useState(0);
  const [lastText, setLastText] = useState<string>();

  const refreshDevices = useCallback(async () => {
    try {
      const list = await BrowserCodeReader.listVideoInputDevices();
      setDevices(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const releaseStream = () => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
  };

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    releaseStream();
    setStatus((s) => (s === 'error' ? s : 'idle'));
  }, []);

  const start = useCallback(
    async (id?: string) => {
      const unsupported = checkCameraSupport();
      if (unsupported) {
        setError(unsupported);
        setStatus('error');
        return;
      }
      if (!videoRef.current) return;
      controlsRef.current?.stop();
      releaseStream();
      setError(undefined);
      setStatus('starting');
      const chosen = id ?? deviceId;
      try {
        const reader = createReader();
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: chosen
            ? { deviceId: { exact: chosen }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        };
        controlsRef.current = await reader.decodeFromConstraints(constraints, videoRef.current, (result) => {
          if (!result || pausedRef.current) return;
          const text = result.getText();
          const now = Date.now();
          const last = lastRef.current;
          if (last && last.text === text && now - last.at < cooldownMs) return; // duplicate-scan prevention
          lastRef.current = { text, at: now };
          setFlashAt(now);
          setLastText(text);
          onDetectedRef.current(text);
        });
        setStatus('scanning');
        const list = await refreshDevices();
        if (!chosen) {
          const track = (videoRef.current.srcObject as MediaStream | null)?.getVideoTracks()[0];
          const active = track?.getSettings().deviceId;
          if (active && list.some((d) => d.deviceId === active)) setDeviceId(active);
        }
      } catch (e) {
        controlsRef.current = null;
        releaseStream();
        setError(describeCameraError(e));
        setStatus('error');
      }
    },
    [cooldownMs, deviceId, refreshDevices],
  );

  const selectDevice = useCallback(
    (id: string) => {
      setDeviceId(id);
      if (controlsRef.current) void start(id);
    },
    [start],
  );

  /** Allows the same QR to be accepted again immediately (e.g. after Clear Transaction). */
  const resetDuplicateGuard = useCallback(() => {
    lastRef.current = null;
  }, []);

  // Release the camera on unmount and when the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && controlsRef.current) stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void refreshDevices();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      controlsRef.current?.stop();
      controlsRef.current = null;
      releaseStream();
    };
  }, [refreshDevices, stop]);

  return { videoRef, status, error, devices, deviceId, selectDevice, start, stop, flashAt, lastText, resetDuplicateGuard };
}

/** Decodes a QR code from an uploaded image file. */
export async function decodeQrFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const result = await createReader().decodeFromImageUrl(url);
    return result.getText();
  } catch (e) {
    const name = (e as Error)?.name;
    throw new Error(name === 'NotFoundException' || !name ? 'No QR code found in the image. Try a sharper, well-lit image with the full QR visible.' : (e as Error).message);
  } finally {
    URL.revokeObjectURL(url);
  }
}
