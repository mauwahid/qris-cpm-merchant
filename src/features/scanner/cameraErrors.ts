export type CameraErrorKind = 'INSECURE_CONTEXT' | 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'NO_CAMERA' | 'IN_USE' | 'OVERCONSTRAINED' | 'UNKNOWN';

export interface CameraError {
  kind: CameraErrorKind;
  message: string;
}

export function describeCameraError(e: unknown): CameraError {
  const err = e as { name?: string; message?: string };
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return { kind: 'PERMISSION_DENIED', message: 'Camera permission was denied. Allow camera access in the browser address bar (site settings) and try again.' };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { kind: 'NO_CAMERA', message: 'No camera was found. Connect a camera or use "Upload QR Image" instead.' };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return { kind: 'IN_USE', message: 'The camera could not be started. It may be in use by another application (Zoom, Teams, another tab).' };
    case 'OverconstrainedError':
      return { kind: 'OVERCONSTRAINED', message: 'The selected camera does not support the requested settings. Select another camera.' };
    default:
      return { kind: 'UNKNOWN', message: `Camera error: ${err?.message ?? String(e)}` };
  }
}

export function checkCameraSupport(): CameraError | undefined {
  if (typeof window === 'undefined') return { kind: 'UNSUPPORTED', message: 'No browser environment' };
  if (!window.isSecureContext) {
    return { kind: 'INSECURE_CONTEXT', message: 'Camera access requires HTTPS (or http://localhost). Open the simulator over HTTPS or on localhost.' };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { kind: 'UNSUPPORTED', message: 'This browser does not support camera access (getUserMedia). Use the latest Google Chrome or Microsoft Edge.' };
  }
  return undefined;
}
