import { useState } from 'react';
import type { LogCategory } from '@/core/types';
import { useLogStore } from '@/store/logStore';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IconTrash } from '@/components/ui/Icons';
import { JsonViewer } from '@/components/ui/JsonViewer';

export function LogViewer({ categories = ['PARSING', 'VALIDATION', 'TRANSACTION', 'SCANNER'] as LogCategory[], height = 360 }: { categories?: LogCategory[]; height?: number }) {
  const logs = useLogStore((s) => s.appLogs);
  const clear = useLogStore((s) => s.clearAppLogs);
  const [tab, setTab] = useState<LogCategory>(categories[0]);
  const [open, setOpen] = useState<string | null>(null);
  const list = logs.filter((l) => l.category === tab);
  return (
    <div>
      <div className="flex items-end justify-between">
        <Tabs tabs={categories.map((c) => ({ id: c, label: c.charAt(0) + c.slice(1).toLowerCase(), count: logs.filter((l) => l.category === c).length }))} value={tab} onChange={setTab} />
        <Button size="sm" variant="ghost" icon={<IconTrash />} onClick={() => clear(tab)}>Clear</Button>
      </div>
      <div className="mt-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50" style={{ maxHeight: height }}>
        {list.length === 0 && <p className="p-4 text-center text-sm text-slate-400">No {tab.toLowerCase()} logs</p>}
        {list.map((l) => (
          <div key={l.id} className="border-b border-slate-200 px-3 py-1.5 text-xs last:border-0">
            <button className="flex w-full items-start gap-2 text-left" onClick={() => setOpen(open === l.id ? null : l.id)}>
              <span className="mono shrink-0 text-slate-400">{new Date(l.timestamp).toLocaleTimeString()}</span>
              <Badge tone={l.level === 'ERROR' ? 'red' : l.level === 'WARN' ? 'amber' : l.level === 'DEBUG' ? 'slate' : 'blue'}>{l.level}</Badge>
              <span className="flex-1 text-slate-700">{l.message}</span>
              {l.data !== undefined && <span className="text-blue-500">{open === l.id ? '▾' : '▸'}</span>}
            </button>
            {open === l.id && l.data !== undefined && <div className="mt-1.5"><JsonViewer value={l.data} maxHeight={240} /></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
