import { useEffect, useState } from 'react';

/** Local editable copy of a store value; `dirty` when it diverges. Resyncs when the source changes. */
export function useDraft<T>(source: T) {
  const [draft, setDraft] = useState<T>(source);
  useEffect(() => setDraft(source), [source]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(source);
  return { draft, setDraft, dirty, patch: (p: Partial<T>) => setDraft((d) => ({ ...d, ...p })), reset: () => setDraft(source) };
}
