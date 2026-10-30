import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  IconActivity, IconCheckList, IconCode, IconDashboard, IconList, IconQr, IconReceipt, IconRoute, IconServer,
  IconSettings, IconShield, IconShuffle, IconStore, IconTerminal,
} from '../ui/Icons';

interface Item { to: string; label: string; icon: ReactNode }
const SECTIONS: { title: string; items: Item[] }[] = [
  { title: 'Dashboard', items: [
    { to: '/', label: 'Merchant Dashboard', icon: <IconDashboard /> },
    { to: '/scanner', label: 'QR Scanner', icon: <IconQr /> },
  ] },
  { title: 'Transactions', items: [
    { to: '/transactions', label: 'Transaction History', icon: <IconList /> },
    { to: '/transaction-details', label: 'Transaction Details', icon: <IconReceipt /> },
  ] },
  { title: 'Developer Tools', items: [
    { to: '/developer', label: 'Developer Testing Panel', icon: <IconCode /> },
    { to: '/api-console', label: 'API Testing Console', icon: <IconTerminal /> },
    { to: '/api-logs', label: 'API Logs', icon: <IconActivity /> },
    { to: '/validation-logs', label: 'Validation Logs', icon: <IconShield /> },
  ] },
  { title: 'Settings', items: [
    { to: '/settings/merchant', label: 'Merchant Configuration', icon: <IconStore /> },
    { to: '/settings/api', label: 'API Configuration', icon: <IconServer /> },
    { to: '/settings/validation', label: 'Validation Configuration', icon: <IconCheckList /> },
    { to: '/settings/endpoints', label: 'Endpoint Configuration', icon: <IconRoute /> },
    { to: '/settings/mapping', label: 'Request/Response Mapping', icon: <IconShuffle /> },
    { to: '/settings/app', label: 'Application Settings', icon: <IconSettings /> },
  ] },
];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-950 text-navy-100 transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-600/30">
          <IconQr className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">Merchant CPM</p>
          <p className="text-[11px] text-navy-300">ASPI QRIS CPM Simulator</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {SECTIONS.map((s) => (
          <div key={s.title} className="mb-5">
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-navy-400">{s.title}</p>
            {s.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition ${isActive ? 'bg-blue-600 font-medium text-white shadow-md shadow-blue-900/40' : 'text-navy-200 hover:bg-white/5 hover:text-white'}`
                }
              >
                {it.icon}
                {it.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/5 px-5 py-3 text-[10px] leading-relaxed text-navy-400">
        Simulation tool for development &amp; testing. Not certified by ASPI.
      </div>
    </aside>
  );
}
