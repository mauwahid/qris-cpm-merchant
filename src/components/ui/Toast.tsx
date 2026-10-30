import { create } from 'zustand';
import { IconX } from './Icons';

type Tone = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}
interface ToastState {
  items: ToastItem[];
  push: (tone: Tone, message: string) => void;
  dismiss: (id: number) => void;
}
let seq = 0;
export const useToast = create<ToastState>()((set, get) => ({
  items: [],
  push: (tone, message) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { id, tone, message }].slice(-4) }));
    setTimeout(() => get().dismiss(id), 3500);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));
export const toast = {
  success: (m: string) => useToast.getState().push('success', m),
  error: (m: string) => useToast.getState().push('error', m),
  info: (m: string) => useToast.getState().push('info', m),
  warning: (m: string) => useToast.getState().push('warning', m),
};

export function ToastViewport() {
  const { items, dismiss } = useToast();
  const tone: Record<Tone, string> = {
    success: 'border-emerald-500 bg-white',
    error: 'border-red-500 bg-white',
    info: 'border-blue-500 bg-white',
    warning: 'border-amber-500 bg-white',
  };
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-start gap-2 rounded-lg border-l-4 px-3 py-2.5 text-sm text-slate-700 shadow-lg ring-1 ring-slate-200 ${tone[t.tone]}`}>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss">
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
