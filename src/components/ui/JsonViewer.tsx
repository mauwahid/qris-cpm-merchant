import { useMemo } from 'react';
import { CopyButton } from './CopyButton';

function highlight(json: string): string {
  const esc = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      let cls = 'text-amber-300';
      if (/^"/.test(m)) cls = /:$/.test(m) ? 'text-sky-300' : 'text-emerald-300';
      else if (/true|false/.test(m)) cls = 'text-violet-300';
      else if (/null/.test(m)) cls = 'text-slate-400';
      return `<span class="${cls}">${m}</span>`;
    },
  );
}

/** Pretty JSON viewer with syntax colouring. Accepts objects or JSON/plain strings. */
export function JsonViewer({ value, maxHeight = 420, title, copy = true }: { value: unknown; maxHeight?: number; title?: string; copy?: boolean }) {
  const text = useMemo(() => {
    if (value === undefined) return '';
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  const isJson = useMemo(() => {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }, [text]);

  return (
    <div className="overflow-hidden rounded-lg border border-navy-800 bg-navy-950">
      {(title || copy) && (
        <div className="flex items-center justify-between border-b border-navy-800 px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-300">{title ?? (isJson ? 'JSON' : 'Text')}</span>
          {copy && <CopyButton text={text} variant="ghost" />}
        </div>
      )}
      <pre className="mono overflow-auto whitespace-pre-wrap break-all p-3 leading-relaxed text-slate-200" style={{ maxHeight }}>
        {text ? isJson ? <code dangerouslySetInnerHTML={{ __html: highlight(text) }} /> : <code>{text}</code> : <span className="text-slate-500">(empty)</span>}
      </pre>
    </div>
  );
}
