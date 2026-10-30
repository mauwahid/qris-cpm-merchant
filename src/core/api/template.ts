export type TemplateVars = Record<string, string | number | boolean | undefined | null>;

export const SUPPORTED_PLACEHOLDERS = [
  'transactionId',
  'merchantId',
  'merchantName',
  'terminalId',
  'amount',
  'amountMinor',
  'currency',
  'currencyNumeric',
  'qrPayload',
  'timestamp',
  'applicationIdentifier',
  'environment',
  'apiVersion',
] as const;

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

function jsonEscape(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

export interface RenderResult {
  output: string;
  missing: string[];
}

/**
 * Replaces `{{name}}` placeholders. In `json` mode string values are JSON-escaped so they can be
 * placed inside quotes in a body template; numeric placeholders (e.g. `"amount": {{amount}}`)
 * are inserted verbatim. Unknown placeholders are left in place and reported.
 */
export function renderTemplate(template: string, vars: TemplateVars, mode: 'json' | 'text' | 'url' = 'text'): RenderResult {
  const missing: string[] = [];
  const output = (template ?? '').replace(PLACEHOLDER, (m, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null) {
      missing.push(name);
      return m;
    }
    const s = String(v);
    if (mode === 'json') return jsonEscape(s);
    if (mode === 'url') return encodeURIComponent(s);
    return s;
  });
  return { output, missing: Array.from(new Set(missing)) };
}

/** Renders path templates supporting both `{{name}}` and REST-style `{name}` placeholders. */
export function renderPath(path: string, vars: TemplateVars): RenderResult {
  const first = renderTemplate(path, vars, 'url');
  const missing = [...first.missing];
  const output = first.output.replace(/\{([A-Za-z0-9_]+)\}/g, (m, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null) {
      missing.push(name);
      return m;
    }
    return encodeURIComponent(String(v));
  });
  return { output, missing: Array.from(new Set(missing)) };
}
