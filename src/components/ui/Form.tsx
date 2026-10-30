import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import type { KeyValue } from '@/core/config/types';
import { Button } from './Button';
import { IconPlus, IconTrash, IconX } from './Icons';

export function Field({ label, hint, error, children, className = '' }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`input ${p.className ?? ''}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`input mono ${p.className ?? ''}`} />;
export const Select = ({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={`input pr-8 ${p.className ?? ''}`}>
    {children}
  </select>
);

export function NumberInput({ value, onChange, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number; onChange: (n: number) => void }) {
  return <input type="number" {...p} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} className={`input ${p.className ?? ''}`} />;
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      {(label || description) && (
        <div className="min-w-0">
          {label && <p className="text-sm font-medium text-slate-700">{label}</p>}
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      )}
    </div>
  );
}

export function KeyValueEditor({ items, onChange, keyPlaceholder = 'Header', valuePlaceholder = 'Value', secretKeys }: { items: KeyValue[]; onChange: (items: KeyValue[]) => void; keyPlaceholder?: string; valuePlaceholder?: string; secretKeys?: RegExp }) {
  const update = (i: number, p: Partial<KeyValue>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="checkbox" checked={it.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-blue-600" aria-label="Enabled" />
          <Input value={it.key} placeholder={keyPlaceholder} onChange={(e) => update(i, { key: e.target.value })} className="mono" />
          <Input value={it.value} placeholder={valuePlaceholder} type={secretKeys?.test(it.key) ? 'password' : 'text'} onChange={(e) => update(i, { value: e.target.value })} className="mono" />
          <Button variant="ghost" size="sm" onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label="Remove" icon={<IconTrash />} />
        </div>
      ))}
      <Button variant="outline" size="sm" icon={<IconPlus />} onClick={() => onChange([...items, { key: '', value: '', enabled: true }])}>
        Add
      </Button>
    </div>
  );
}

export function TagListEditor({ values, onChange, placeholder, transform = (s) => s.trim(), validate, locked = [] }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string; transform?: (s: string) => string; validate?: (s: string) => string | undefined; locked?: string[] }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const add = () => {
    const v = transform(draft);
    if (!v) return;
    const err = validate?.(v);
    if (err) return setError(err);
    if (!values.includes(v)) onChange([...values, v]);
    setDraft('');
    setError(undefined);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {locked.map((v) => (
          <span key={`l-${v}`} title="Required by specification — cannot be removed" className="inline-flex items-center gap-1 rounded-md bg-navy-900 px-2 py-1 font-mono text-xs text-white">
            🔒 {v}
          </span>
        ))}
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 font-mono text-xs text-blue-800 ring-1 ring-inset ring-blue-200">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-blue-400 hover:text-blue-700" aria-label={`Remove ${v}`}>
              <IconX className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} className="mono" />
        <Button variant="outline" onClick={add} icon={<IconPlus />}>
          Add
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
