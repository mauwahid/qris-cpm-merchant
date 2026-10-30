/** Masks a PAN keeping first 6 and last 4 digits (PCI DSS display rule). */
export function maskPan(pan: string): string {
  const digits = (pan ?? '').replace(/\D/g, '');
  if (digits.length <= 10) return digits.length > 4 ? '*'.repeat(digits.length - 4) + digits.slice(-4) : digits;
  return digits.slice(0, 6) + '*'.repeat(digits.length - 10) + digits.slice(-4);
}

/** Masks Track 2 equivalent data: masked PAN, separator, and fully masked discretionary data. */
export function maskTrack2(track2: string): string {
  const [pan, rest = ''] = (track2 ?? '').toUpperCase().split('D');
  return `${maskPan(pan)}D${rest.slice(0, 4)}${'*'.repeat(Math.max(0, rest.length - 4))}`;
}

export function maskSecret(value: string): string {
  if (!value) return value;
  if (value.length <= 6) return '******';
  return `${value.slice(0, 3)}******${value.slice(-2)}`;
}

const SENSITIVE_KEY_PART = /(password|passwd|secret|token|api[-_]?key|authorization)/i;
const SENSITIVE_KEY_EXACT = /^(pan|pin|cvv|cvv2|track2|cardNumber|accountNumber)$/i;
export const isSensitiveKey = (k: string) => SENSITIVE_KEY_PART.test(k) || SENSITIVE_KEY_EXACT.test(k);

/** Masks sensitive header values. */
export function maskHeaders(headers: Record<string, string>, sensitiveNames: string[]): Record<string, string> {
  const set = new Set(sensitiveNames.map((s) => s.toLowerCase()));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = set.has(k.toLowerCase()) || isSensitiveKey(k) ? maskSecret(v) : v;
  }
  return out;
}

/** Masks sensitive keys in a JSON string body. Non-JSON bodies are returned unchanged. */
export function maskJsonBody(body: string | undefined): string | undefined {
  if (!body) return body;
  try {
    const parsed = JSON.parse(body);
    const walk = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const o: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          o[k] = isSensitiveKey(k) && (typeof val === 'string' || typeof val === 'number') ? maskSecret(String(val)) : walk(val);
        }
        return o;
      }
      return v;
    };
    return JSON.stringify(walk(parsed), null, 2);
  } catch {
    return body;
  }
}
