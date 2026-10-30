import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (d: React.ReactNode, displayName: string) => {
  const C = ({ className = 'h-4 w-4', ...p }: P) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...p}>
      {d}
    </svg>
  );
  C.displayName = displayName;
  return C;
};

export const IconDashboard = base(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>, 'IconDashboard');
export const IconQr = base(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></>, 'IconQr');
export const IconList = base(<><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>, 'IconList');
export const IconReceipt = base(<><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h4" /></>, 'IconReceipt');
export const IconCode = base(<><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></>, 'IconCode');
export const IconTerminal = base(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></>, 'IconTerminal');
export const IconActivity = base(<><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>, 'IconActivity');
export const IconShield = base(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>, 'IconShield');
export const IconStore = base(<><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /></>, 'IconStore');
export const IconServer = base(<><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></>, 'IconServer');
export const IconCheckList = base(<><path d="m3 7 2 2 4-4M3 17l2 2 4-4M13 6h8M13 12h8M13 18h8" /></>, 'IconCheckList');
export const IconRoute = base(<><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" /></>, 'IconRoute');
export const IconShuffle = base(<><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></>, 'IconShuffle');
export const IconSettings = base(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, 'IconSettings');
export const IconCamera = base(<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>, 'IconCamera');
export const IconCameraOff = base(<><path d="m2 2 20 20M9 3h6l2 3h4a2 2 0 0 1 2 2v9.34M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3" /><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" /></>, 'IconCameraOff');
export const IconUpload = base(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></>, 'IconUpload');
export const IconDownload = base(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>, 'IconDownload');
export const IconCopy = base(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>, 'IconCopy');
export const IconCheck = base(<path d="M20 6 9 17l-5-5" />, 'IconCheck');
export const IconX = base(<path d="M18 6 6 18M6 6l12 12" />, 'IconX');
export const IconPlus = base(<path d="M12 5v14M5 12h14" />, 'IconPlus');
export const IconTrash = base(<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>, 'IconTrash');
export const IconPlay = base(<path d="m6 3 14 9-14 9z" />, 'IconPlay');
export const IconStop = base(<rect x="5" y="5" width="14" height="14" rx="2" />, 'IconStop');
export const IconRefresh = base(<><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>, 'IconRefresh');
export const IconSend = base(<><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></>, 'IconSend');
export const IconEye = base(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>, 'IconEye');
export const IconAlert = base(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>, 'IconAlert');
export const IconWallet = base(<><path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2" /><path d="M22 11h-6a2 2 0 0 0 0 4h6z" /></>, 'IconWallet');
export const IconTrend = base(<><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>, 'IconTrend');
export const IconBan = base(<><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></>, 'IconBan');
export const IconFlask = base(<><path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3l-6-10V3" /><path d="M7 15h10" /></>, 'IconFlask');
export const IconFilter = base(<path d="M22 3H2l8 9.5V19l4 2v-8.5z" />, 'IconFilter');
export const IconMenu = base(<path d="M3 6h18M3 12h18M3 18h18" />, 'IconMenu');
export const IconImage = base(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>, 'IconImage');
