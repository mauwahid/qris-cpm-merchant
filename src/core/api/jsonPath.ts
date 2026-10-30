/**
 * Minimal JSONPath subset sufficient for response mapping:
 *   $                 root
 *   $.a.b             member access
 *   $.a[0].b          array index (negative indexes count from the end)
 *   $['a-b']["c"]     bracket notation
 */
export type PathSegment = string | number;

export function parsePath(path: string): PathSegment[] {
  const p = path.trim();
  if (!p.startsWith('$')) throw new Error(`JSONPath must start with '$': ${path}`);
  const segs: PathSegment[] = [];
  let i = 1;
  while (i < p.length) {
    const ch = p[i];
    if (ch === '.') {
      i++;
      let name = '';
      while (i < p.length && p[i] !== '.' && p[i] !== '[') name += p[i++];
      if (!name) throw new Error(`Empty member name in JSONPath: ${path}`);
      segs.push(name);
    } else if (ch === '[') {
      const end = p.indexOf(']', i);
      if (end < 0) throw new Error(`Unclosed bracket in JSONPath: ${path}`);
      const inner = p.slice(i + 1, end).trim();
      if (/^-?\d+$/.test(inner)) segs.push(Number(inner));
      else if (/^(['"]).*\1$/.test(inner)) segs.push(inner.slice(1, -1));
      else throw new Error(`Unsupported JSONPath segment [${inner}] in ${path}`);
      i = end + 1;
    } else {
      throw new Error(`Unexpected character '${ch}' in JSONPath: ${path}`);
    }
  }
  return segs;
}

export function getByPath(obj: unknown, path: string): { found: boolean; value?: unknown } {
  if (!path) return { found: false };
  let segs: PathSegment[];
  try {
    segs = parsePath(path);
  } catch {
    return { found: false };
  }
  let cur: unknown = obj;
  for (const s of segs) {
    if (cur === null || cur === undefined) return { found: false };
    if (typeof s === 'number') {
      if (!Array.isArray(cur)) return { found: false };
      const idx = s < 0 ? cur.length + s : s;
      if (idx < 0 || idx >= cur.length) return { found: false };
      cur = cur[idx];
    } else {
      if (typeof cur !== 'object' || !(s in (cur as Record<string, unknown>))) return { found: false };
      cur = (cur as Record<string, unknown>)[s];
    }
  }
  return { found: true, value: cur };
}

export function isValidPath(path: string): boolean {
  try {
    parsePath(path);
    return true;
  } catch {
    return false;
  }
}
